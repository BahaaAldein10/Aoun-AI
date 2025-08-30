"use server";

import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { KnowledgeBase } from "@prisma/client";
import { Client } from "@upstash/qstash";

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function qstash(kb: KnowledgeBase) {
  const metadata = kb.metadata as KbMetadata;

  try {
    // Handle URL crawling
    if (metadata?.url) {
      console.log(`Starting crawl for KB ${kb.id} with URL: ${metadata.url}`);

      // Use the correct start-crawl endpoint instead of process-crawl
      await qstashClient.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/start-crawl`,
        body: {
          kbId: kb.id,
          userId: kb.userId,
          url: metadata.url,
          maxDepth: 2, // Add explicit depth control
        },
      });

      console.log(`Successfully enqueued crawl job for ${metadata.url}`);
    }

    // Handle file processing
    if (metadata?.files && metadata.files.length > 0) {
      console.log(`Processing ${metadata.files.length} files for KB ${kb.id}`);

      // Process each file
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
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-file`, // Fixed: use BASE_URL
            body: {
              kbId: kb.id,
              userId: kb.userId,
              fileUrl: fileUrl,
              fileName: file.filename,
              fileType: file.fileType,
              fileSize: file.size,
            },
            // Add delay for file processing to avoid overwhelming the system
            delay: 2,
          });

          console.log(`Enqueued file processing for: ${file.filename}`);
        } catch (fileError) {
          console.error(`Failed to process file ${fileUrl}:`, fileError);
          // Continue with other files instead of failing entirely
        }
      }
    }

    // Return success with details
    return {
      success: true,
      urlProcessing: !!metadata?.url,
      filesProcessing: metadata?.files?.length || 0,
    };
  } catch (error) {
    console.error(`Failed to start processing for KB ${kb.id}:`, error);

    // Re-throw with more context for the calling code
    throw new Error(
      `Failed to enqueue processing jobs for knowledge base: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
