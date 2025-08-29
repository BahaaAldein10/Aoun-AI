export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

async function handler(req: Request) {
  const mammoth = await import("mammoth");
  const pdfParse = await import("pdf-parse");

  const data = await req.json();
  const { kbId, userId, fileUrl, fileName, fileType } = data;

  // 1) fetch the file from Firebase URL (assumes public or signed download URL)
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("Failed to fetch file");

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let text = "";

  if (fileType?.includes("pdf") || fileName?.endsWith(".pdf")) {
    const parseResult = await pdfParse.default(buffer);
    text = parseResult.text || "";
  } else if (fileType?.includes("word") || fileName?.endsWith(".docx")) {
    const result = await mammoth.default.extractRawText({ buffer });
    text = result.value || "";
  } else {
    // fallback: try plain text conversion
    text = buffer.toString("utf-8");
  }

  // 2) save Document content for this fileUrl
  await prisma.document.create({
    data: {
      kbId,
      filename: fileName,
      sourceUrl: fileUrl,
      mimeType: fileType,
      content: text,
    },
  });

  // 3) chunk and create embeddings
  // const chunks = chunkText(text, 1800, 200);

  // for (const chunk of chunks) {
  //   const vector = await createEmbeddings(chunk); // see function below
  //   await prisma.embedding.create({
  //     data: {
  //       kbId,
  //       vector: vector, // store as JSON array
  //       text: chunk,
  //       meta: { source: fileUrl, fileName },
  //     },
  //   });
  // }

  // 4) optionally notify user by creating a "job done" flag or email
  // await notifyUserProcessingDone(userId, kbId, `File processed: ${fileName}`);

  return Response.json({ success: true }, { status: 200 });
}

export const POST = verifySignatureAppRouter(handler);
