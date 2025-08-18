import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Queue } from "bullmq";
import { NextResponse } from "next/server";

const queue = new Queue("ingest", {
  connection: { url: process.env.REDIS_URL },
});

type Body = {
  uploadedFileId?: string;
  url?: string;
  kbTitle?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Must provide either uploadedFileId (upload) OR url (crawl)
    if (!body.uploadedFileId && !body.url) {
      return NextResponse.json(
        { error: "uploadedFileId or url required" },
        { status: 400 },
      );
    }

    let uploadedFile = null;
    if (body.uploadedFileId) {
      uploadedFile = await prisma.uploadedFile.findUnique({
        where: { id: body.uploadedFileId },
      });
      if (!uploadedFile) {
        return NextResponse.json(
          { error: "Uploaded file not found" },
          { status: 404 },
        );
      }
      const meta =
        (uploadedFile.meta as object & { ingestStatus: string }) ?? {};
      if (meta.ingestStatus === "processing" || meta.ingestStatus === "done") {
        return NextResponse.json(
          { ok: true, message: "Already processing/done" },
          { status: 200 },
        );
      }
    }

    // Create a KB record immediately and mark processing
    const kb = await prisma.knowledgeBase.create({
      data: {
        userId: session.user.id,
        title: body.kbTitle ?? uploadedFile?.filename ?? body.url ?? "Ingest",
        source: body.url ? "url" : "upload",
        description: body.url
          ? `Crawled from ${body.url}`
          : `Ingested upload ${uploadedFile?.filename}`,
        metadata: {
          ingestStatus: "queued",
          startedAt: new Date().toISOString(),
          sourceUrl: body.url ?? null,
          uploadedFileId: uploadedFile?.id ?? null,
        },
      },
    });

    // mark uploadedFile (if present) as queued/processing
    if (uploadedFile) {
      await prisma.uploadedFile.update({
        where: { id: uploadedFile.id },
        data: {
          meta: {
            ...((uploadedFile.meta as object) ?? {}),
            ingestStatus: "queued",
            kbId: kb.id,
            queuedAt: new Date().toISOString(),
          },
        },
      });
    }

    // Enqueue job (job data includes kbId, uploadedFileId or url)
    const job = await queue.add(
      "ingest-job",
      {
        kbId: kb.id,
        uploadedFileId: uploadedFile?.id ?? null,
        url: body.url ?? null,
        userId: session.user.id,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    );

    return NextResponse.json(
      { accepted: true, jobId: job.id, kbId: kb.id },
      { status: 202 },
    );
  } catch (err) {
    console.error("enqueue ingest error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? String(err) },
      { status: 500 },
    );
  }
}
