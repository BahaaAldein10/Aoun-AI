"use server";

import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { KnowledgeBase } from "@prisma/client";
import { Client } from "@upstash/qstash";

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

interface FaqItem {
  question: string;
  answer: string;
}

export async function qstash(kb: KnowledgeBase) {
  const metadata = kb.metadata as KbMetadata;

  const results = {
    success: false,
    urlProcessing: false,
    filesProcessing: 0,
    faqProcessing: 0,
  };

  try {
    // Handle URL crawling
    if (metadata?.url) {
      console.log(`Starting crawl for KB ${kb.id} with URL: ${metadata.url}`);

      await qstashClient.publishJSON({
        url: `${process.env.BASE_URL}/api/start-crawl`,
        body: {
          kbId: kb.id,
          userId: kb.userId,
          url: metadata.url,
          maxDepth: 2,
        },
      });

      results.urlProcessing = true;
      console.log(`Successfully enqueued crawl job for ${metadata.url}`);
    }

    // Handle file processing
    if (metadata?.files && metadata.files.length > 0) {
      console.log(`Processing ${metadata.files.length} files for KB ${kb.id}`);

      for (const fileUrl of metadata.files) {
        if (!fileUrl) continue;

        try {
          const file = await prisma.uploadedFile.findFirst({
            where: {
              url: fileUrl,
              userId: kb.userId,
            },
            select: {
              fileType: true,
              filename: true,
              size: true,
            },
          });

          if (!file) {
            console.warn(`File not found in database: ${fileUrl}`);
            continue;
          }

          await qstashClient.publishJSON({
            url: `${process.env.BASE_URL}/api/process-file`,
            body: {
              kbId: kb.id,
              userId: kb.userId,
              fileUrl: fileUrl,
              fileName: file.filename,
              fileType: file.fileType,
              fileSize: file.size,
            },
            delay: 2,
          });

          results.filesProcessing++;
          console.log(`Enqueued file processing for: ${file.filename}`);
        } catch (fileError) {
          console.error(`Failed to process file ${fileUrl}:`, fileError);
          // Continue with other files instead of failing entirely
        }
      }
    }

    // Handle FAQ processing
    if (
      metadata?.faq &&
      Array.isArray(metadata.faq) &&
      metadata.faq.length > 0
    ) {
      // Filter out empty FAQ items
      const validFaqs = metadata.faq.filter(
        (faq: FaqItem) =>
          faq.question &&
          faq.question.trim() &&
          faq.answer &&
          faq.answer.trim(),
      );

      if (validFaqs.length > 0) {
        console.log(`Processing ${validFaqs.length} FAQ items for KB ${kb.id}`);

        try {
          await qstashClient.publishJSON({
            url: `${process.env.BASE_URL}/api/process-faq`,
            body: {
              kbId: kb.id,
              userId: kb.userId,
              faqItems: validFaqs,
            },
            delay: 5, // Process FAQ after initial setup
          });

          results.faqProcessing = validFaqs.length;
          console.log(`Enqueued FAQ processing: ${validFaqs.length} items`);
        } catch (faqError) {
          console.error(`Failed to enqueue FAQ processing:`, faqError);
          // Continue with processing - don't fail entire operation
        }
      }
    }

    results.success = true;
    console.log(`QStash processing summary for KB ${kb.id}:`, results);

    return results;
  } catch (error) {
    console.error(`Failed to start processing for KB ${kb.id}:`, error);

    // Re-throw with more context for the calling code
    throw new Error(
      `Failed to enqueue processing jobs for knowledge base: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
