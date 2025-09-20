export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

interface FaqItem {
  question: string;
  answer: string;
}

async function saveEachFaqAsDocument(
  kbId: string,
  faqItems: FaqItem[],
): Promise<string[]> {
  const createdDocumentIds: string[] = [];

  for (let i = 0; i < faqItems.length; i++) {
    const faq = faqItems[i];

    // Skip empty FAQ items
    if (!faq.question.trim() || !faq.answer.trim()) {
      continue;
    }

    // Create a combined content string for better searchability
    const content = `Q: ${faq.question.trim()}\n\nA: ${faq.answer.trim()}`;
    const filename = `FAQ ${i + 1}: ${faq.question.substring(0, 50)}${faq.question.length > 50 ? "..." : ""}`;

    // Use a consistent sourceUrl pattern for FAQ items
    const sourceUrl = `faq://question-${i + 1}`;

    try {
      // Check if this FAQ already exists
      const existing = await prisma.document.findFirst({
        where: {
          kbId,
          sourceUrl,
        },
        select: { id: true, content: true },
      });

      if (existing) {
        // Update if content has changed
        if (existing.content !== content) {
          await prisma.document.update({
            where: { id: existing.id },
            data: {
              content,
              filename,
              mimeType: "text/plain",
              metadata: {
                type: "faq",
                questionIndex: i,
                question: faq.question,
                answer: faq.answer,
                updatedAt: new Date().toISOString(),
              },
            },
          });
          console.log(`Updated FAQ document: ${filename}`);
        }
        createdDocumentIds.push(existing.id);
      } else {
        // Create new FAQ document
        try {
          const doc = await prisma.document.create({
            data: {
              kbId,
              sourceUrl,
              filename,
              content,
              mimeType: "text/plain",
              metadata: {
                type: "faq",
                questionIndex: i,
                question: faq.question,
                answer: faq.answer,
                createdAt: new Date().toISOString(),
              },
            },
          });

          createdDocumentIds.push(doc.id);
          console.log(`Created FAQ document: ${filename}`);
        } catch (err) {
          // Handle race condition where another process created the same FAQ
          if (
            (err as PrismaClientKnownRequestError)?.code === "P2002" ||
            (err as PrismaClientKnownRequestError)?.message?.includes(
              "duplicate key",
            )
          ) {
            const doc = await prisma.document.findFirst({
              where: { kbId, sourceUrl },
              select: { id: true },
            });
            if (doc) {
              createdDocumentIds.push(doc.id);
            }
          } else {
            throw err;
          }
        }
      }
    } catch (error) {
      console.error(`Failed to save FAQ item ${i}:`, error);
      // Continue with other FAQ items instead of failing completely
    }
  }

  return createdDocumentIds;
}

async function cleanupOldFaqDocuments(kbId: string, currentFaqCount: number) {
  try {
    // Remove FAQ documents that are beyond the current FAQ count
    // This handles cases where FAQs were removed
    const oldFaqs = await prisma.document.findMany({
      where: {
        kbId,
        sourceUrl: {
          startsWith: "faq://question-",
        },
      },
      select: { id: true, sourceUrl: true },
    });

    const toDelete = oldFaqs.filter((doc) => {
      const match = doc.sourceUrl?.match(/faq:\/\/question-(\d+)/);
      if (!match) return false;
      const questionNum = parseInt(match[1], 10);
      return questionNum > currentFaqCount;
    });

    if (toDelete.length > 0) {
      // Delete embeddings first
      await prisma.embedding.deleteMany({
        where: {
          kbId,
          documentId: { in: toDelete.map((d) => d.id) },
        },
      });

      // Delete documents
      await prisma.document.deleteMany({
        where: {
          id: { in: toDelete.map((d) => d.id) },
        },
      });

      console.log(`Cleaned up ${toDelete.length} old FAQ documents`);
    }
  } catch (error) {
    console.error("Failed to cleanup old FAQ documents:", error);
    // Don't fail the entire process for cleanup errors
  }
}

async function handler(req: Request) {
  try {
    const payload = await req.json();
    const { kbId, userId, faqItems } = payload;

    if (!kbId || !userId || !Array.isArray(faqItems)) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: kbId, userId, or faqItems array",
        }),
        { status: 400 },
      );
    }

    console.log(`Processing ${faqItems.length} FAQ items for KB ${kbId}`);

    // Verify the knowledge base belongs to the user
    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: kbId, userId },
      select: { id: true, title: true },
    });

    if (!kb) {
      return new Response(
        JSON.stringify({
          error: "Knowledge base not found or access denied",
        }),
        { status: 404 },
      );
    }

    // Filter out empty FAQ items
    const validFaqs = faqItems.filter(
      (faq: FaqItem) =>
        faq.question && faq.question.trim() && faq.answer && faq.answer.trim(),
    );

    if (validFaqs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No valid FAQ items to process",
          processedFaqs: 0,
        }),
        { status: 200 },
      );
    }

    // Save FAQ items as documents
    const documentIds = await saveEachFaqAsDocument(kbId, validFaqs);

    // Clean up old FAQ documents that might have been removed
    await cleanupOldFaqDocuments(kbId, validFaqs.length);

    // Queue embedding processing for each FAQ document
    let enqueuedEmbeddings = 0;
    for (const documentId of documentIds) {
      try {
        await qstash.publishJSON({
          url: `${process.env.BASE_URL}/api/process-embeddings`,
          body: {
            kbId,
            documentId,
            userId,
          },
          delay: enqueuedEmbeddings * 2 + 5, // Stagger the requests
        });
        enqueuedEmbeddings++;
      } catch (error) {
        console.error(
          `Failed to enqueue embedding processing for FAQ document ${documentId}:`,
          error,
        );
        // Continue with other documents
      }
    }

    console.log(
      `Successfully processed ${validFaqs.length} FAQ items, created/updated ${documentIds.length} documents, enqueued ${enqueuedEmbeddings} embedding jobs`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        processedFaqs: validFaqs.length,
        createdDocuments: documentIds.length,
        enqueuedEmbeddings,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("FAQ processing error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
