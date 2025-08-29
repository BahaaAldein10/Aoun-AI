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
    if (metadata?.url) {
      await qstashClient.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-crawl`,
        body: {
          kbId: kb.id,
          userId: kb.userId,
          webUrl: metadata?.url,
        },
      });
    }

    if (metadata?.files && metadata.files.length > 0 && metadata?.files[0]) {
      const file = await prisma.uploadedFile.findFirst({
        where: {
          url: metadata?.files?.[0],
          userId: kb.userId,
        },
        select: {
          fileType: true,
          filename: true,
        },
      });

      await qstashClient.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-file`,
        body: {
          kbId: kb.id,
          userId: kb.userId,
          fileUrl: metadata?.files?.[0],
          fileName: file?.filename,
          fileType: file?.fileType,
        },
      });
    }
  } catch (error) {
    console.error(error);
  }
}
