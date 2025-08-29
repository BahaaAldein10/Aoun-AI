import { prisma } from "@/lib/prisma";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import * as cheerio from "cheerio";

async function handler(req: Request) {
  const data = await req.json();
  const { kbId, userId, webUrl } = data;

  const htmlRes = await fetch(webUrl, {
    headers: { "User-Agent": "my-crawler/1.0" },
  });
  if (!htmlRes.ok) throw new Error("Failed to fetch url");
  const html = await htmlRes.text();

  const $ = cheerio.load(html);
  const title = $("title").text();
  // pull paragraphs and headings — you can customize selector
  const paragraphs = $("p")
    .map((i, el) => $(el).text())
    .get()
    .join("\n\n");
  const content = `${title}\n\n${paragraphs}`;

  // save to Document
  await prisma.document.create({
    data: { kbId, sourceUrl: webUrl, content: content },
  });

  // chunk + embed
  // const chunks = chunkText(content, 1800, 200);
  // for (const chunk of chunks) {
  //   const vector = await createEmbeddings(chunk);
  //   await prisma.embedding.create({
  //     data: { kbId, vector, text: chunk, meta: { source: webUrl } },
  //   });
  // }

  // await notifyUserProcessingDone(userId, kbId, `Crawl processed: ${webUrl}`);

  return Response.json({ success: true }, { status: 200 });
}

export const POST = verifySignatureAppRouter(handler);
