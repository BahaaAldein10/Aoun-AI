export const runtime = "nodejs";

import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { processDocumentEmbeddings } from "@/lib/embedding-service";
import { notifyUserProcessingDone } from "@/lib/notifier";
import { prisma } from "@/lib/prisma";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

async function shouldSendCompletionNotification(
  kbId: string,
): Promise<boolean> {
  const totalDocuments = await prisma.document.count({
    where: { kbId, content: { not: null } },
  });

  const documentsWithEmbeddings = await prisma.document.count({
    where: { kbId, content: { not: null }, embedding: { some: {} } },
  });

  return totalDocuments > 0 && documentsWithEmbeddings === totalDocuments;
}

async function handler(req: Request) {
  try {
    const payload = await req.json();
    const { kbId, documentId, userId, webUrl } = payload;
    const attempts = (payload.attempts ?? 0) as number;

    if (!kbId || !userId) {
      return new Response(
        JSON.stringify({
          error: "missing required fields: kbId or userId",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `Processing embeddings for KB ${kbId}, document: ${documentId || "all"}, webUrl: ${webUrl || "none"}, attempts: ${attempts}`,
    );

    // Verify the knowledge base belongs to the user
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: kbId,
        userId,
      },
      select: {
        id: true,
        title: true,
        metadata: true,
        _count: {
          select: {
            documents: true,
            embeddings: true,
          },
        },
      },
    });

    if (!kb) {
      return new Response(
        JSON.stringify({
          error: "Knowledge base not found or access denied",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let processedDocuments = 0;
    let createdEmbeddings = 0;
    const errors: string[] = [];

    try {
      if (documentId) {
        // Process specific document by ID
        console.log(
          `Processing embeddings for specific document: ${documentId}`,
        );

        // Verify document belongs to the knowledge base
        const document = await prisma.document.findFirst({
          where: {
            id: documentId,
            kbId,
          },
          select: { id: true, filename: true, sourceUrl: true },
        });

        if (!document) {
          return new Response(
            JSON.stringify({
              error: "Document not found in specified knowledge base",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Count embeddings before
        const embeddingsBefore = await prisma.embedding.count({
          where: { kbId, documentId },
        });

        await processDocumentEmbeddings(documentId);

        // Count embeddings after
        const embeddingsAfter = await prisma.embedding.count({
          where: { kbId, documentId },
        });

        processedDocuments = 1;
        createdEmbeddings = embeddingsAfter - embeddingsBefore;
      } else if (webUrl) {
        // Process document by webUrl (for crawled pages)
        console.log(`Processing embeddings for document with URL: ${webUrl}`);

        // Find document by sourceUrl
        const document = await prisma.document.findFirst({
          where: { kbId, sourceUrl: webUrl },
          select: { id: true, filename: true, sourceUrl: true },
        });

        if (!document) {
          console.warn(
            `Document ${webUrl} not found yet — returning 500 so QStash will retry.`,
          );
          return new Response(
            JSON.stringify({
              success: false,
              message: "document_not_found_yet",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        // Check if this document already has embeddings
        const existingEmbeddings = await prisma.embedding.findFirst({
          where: { kbId, documentId: document.id },
          select: { id: true },
        });

        if (existingEmbeddings) {
          console.log(
            `Document ${document.id} already has embeddings, skipping...`,
          );
          return new Response(
            JSON.stringify({
              success: true,
              message: "Document already has embeddings",
              skipped: true,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Count embeddings before
        const embeddingsBefore = await prisma.embedding.count({
          where: { kbId, documentId: document.id },
        });

        await processDocumentEmbeddings(document.id);

        // Count embeddings after
        const embeddingsAfter = await prisma.embedding.count({
          where: { kbId, documentId: document.id },
        });

        processedDocuments = 1;
        createdEmbeddings = embeddingsAfter - embeddingsBefore;
      } else {
        // Process all documents in knowledge base that don't have embeddings
        console.log(`Processing embeddings for entire knowledge base: ${kbId}`);

        // Get documents that don't have embeddings yet
        const documentsToProcess = await prisma.document.findMany({
          where: {
            kbId,
            content: { not: null },
            // Only get documents that don't have embeddings
            NOT: {
              embedding: {
                some: {},
              },
            },
          },
          select: { id: true, filename: true, sourceUrl: true },
        });

        if (documentsToProcess.length === 0) {
          console.log(`No documents need embedding processing for KB ${kbId}`);
          return new Response(
            JSON.stringify({
              success: true,
              message: "No documents need embedding processing",
              processedDocuments: 0,
              createdEmbeddings: 0,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Count total embeddings before processing
        const totalEmbeddingsBefore = await prisma.embedding.count({
          where: { kbId },
        });

        // Process each document
        for (const doc of documentsToProcess) {
          try {
            console.log(`Processing embeddings for document ${doc.id}`);

            await processDocumentEmbeddings(doc.id);
            processedDocuments++;

            // Small delay to respect rate limits
            await new Promise((r) => setTimeout(r, 100));
          } catch (error) {
            const errorMsg = `Failed to process document ${doc.id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        // Count total embeddings after processing
        const totalEmbeddingsAfter = await prisma.embedding.count({
          where: { kbId },
        });

        createdEmbeddings = totalEmbeddingsAfter - totalEmbeddingsBefore;
      }

      // Update knowledge base metadata to track embedding completion
      const updatedMetadata = {
        ...(
          kb as {
            id: string;
            title: string;
            metadata: KbMetadata;
          }
        ).metadata,
        embeddingsProcessed: processedDocuments > 0,
        embeddingsProcessedAt: new Date().toISOString(),
        lastEmbeddingStats: {
          processedDocuments,
          createdEmbeddings,
          totalDocuments: kb._count.documents,
          totalEmbeddings: kb._count.embeddings + createdEmbeddings,
          errors: errors.length,
        },
      };

      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: {
          metadata: updatedMetadata,
        },
      });

      console.log(`Successfully processed embeddings for KB ${kbId}:`);
      console.log(`- Processed documents: ${processedDocuments}`);
      console.log(`- Created embeddings: ${createdEmbeddings}`);
      console.log(`- Errors: ${errors.length}`);

      // Check if this completes all embeddings for the KB
      const shouldNotify = await shouldSendCompletionNotification(kbId);

      if (shouldNotify) {
        try {
          // Get final stats for notification
          const finalStats = await prisma.knowledgeBase.findUnique({
            where: { id: kbId },
            select: {
              title: true,
              metadata: true,
              _count: {
                select: {
                  documents: { where: { content: { not: null } } },
                  embeddings: true,
                },
              },
            },
          });

          await notifyUserProcessingDone(userId, kbId, {
            title: finalStats?.title || "Knowledge Base",
            pages: finalStats?._count.documents || 0,
            embeddings: finalStats?._count.embeddings || 0,
            link: `${process.env.BASE_URL}/en/dashboard/knowledge-base`,
            language: (finalStats?.metadata as KbMetadata)?.language,
          });

          console.log(`User ${userId} notified about KB ${kbId} completion.`);
        } catch (notifyErr) {
          console.error("Failed to notify user about completion:", notifyErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          kbId,
          processedDocuments,
          createdEmbeddings,
          totalDocuments: kb._count.documents,
          totalEmbeddings: kb._count.embeddings + createdEmbeddings,
          errors: errors.length > 0 ? errors : undefined,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error(`Embedding processing failed for KB ${kbId}:`, error);

      return new Response(
        JSON.stringify({
          success: false,
          error: "embedding_processing_failed",
          details: error instanceof Error ? error.message : "Unknown error",
          kbId,
          processedDocuments,
          createdEmbeddings,
          errors,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Handler error in process-embeddings:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
