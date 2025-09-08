export const runtime = "nodejs";

import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { processDocumentEmbeddings } from "@/lib/embedding-service";
import { notifyUserProcessingDone } from "@/lib/notifier";
import { prisma } from "@/lib/prisma";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

async function handler(req: Request) {
  try {
    const payload = await req.json();
    const { kbId, documentId, userId } = payload;

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
      `Processing embeddings for KB ${kbId}, document: ${documentId || "all"}`,
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
        // Process specific document
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
          where: { kbId },
        });

        await processDocumentEmbeddings(documentId);

        // Count embeddings after
        const embeddingsAfter = await prisma.embedding.count({
          where: { kbId },
        });

        processedDocuments = 1;
        createdEmbeddings = embeddingsAfter - embeddingsBefore;
      } else {
        // Process all documents in knowledge base
        console.log(`Processing embeddings for entire knowledge base: ${kbId}`);

        // Get documents that don't have embeddings yet
        const documentsToProcess = await prisma.document.findMany({
          where: {
            kbId,
            content: { not: null },
          },
          select: { id: true, filename: true, sourceUrl: true },
        });

        // Count embeddings before
        const embeddingsBefore = await prisma.embedding.count({
          where: { kbId },
        });

        // Process each document
        for (const doc of documentsToProcess) {
          try {
            // Check if this document already has embeddings
            const existingEmbeddings = await prisma.embedding.count({
              where: {
                kbId,
              },
            });

            if (existingEmbeddings === 0) {
              await processDocumentEmbeddings(doc.id);
              processedDocuments++;

              // Small delay to respect API rate limits
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          } catch (error) {
            const errorMsg = `Failed to process document ${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        // Count embeddings after
        const embeddingsAfter = await prisma.embedding.count({
          where: { kbId },
        });

        createdEmbeddings = embeddingsAfter - embeddingsBefore;
      }

      // Update knowledge base metadata to track embedding completion
      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: {
          metadata: {
            ...(
              kb as {
                id: string;
                title: string;
                metadata: KbMetadata;
              }
            ).metadata,
            embeddingsProcessed: true,
            embeddingsProcessedAt: new Date().toISOString(),
            lastEmbeddingStats: {
              processedDocuments,
              createdEmbeddings,
              totalDocuments: kb._count.documents,
              totalEmbeddings: kb._count.embeddings + createdEmbeddings,
              errors: errors.length,
            },
          },
        },
      });

      console.log(`Successfully processed embeddings for KB ${kbId}:`);
      console.log(`- Processed documents: ${processedDocuments}`);
      console.log(`- Created embeddings: ${createdEmbeddings}`);
      console.log(`- Errors: ${errors.length}`);

      try {
        await notifyUserProcessingDone(userId, kbId, {
          title: kb.title,
          pages: processedDocuments,
          embeddings: createdEmbeddings,
          link: `${process.env.BASE_URL}/en/dashboard/knowledge-base`,
        });
        console.log(`User ${userId} notified about KB ${kbId} readiness.`);
      } catch (notifyErr) {
        console.error(
          "Failed to notify user about embeddings completion:",
          notifyErr,
        );
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
