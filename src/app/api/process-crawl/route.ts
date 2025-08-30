export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { Readability } from "@mozilla/readability";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import type { Cheerio } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { JSDOM } from "jsdom";
import pLimit from "p-limit";
import type { RetryContext } from "p-retry";
import pRetry from "p-retry";
import robotsParser from "robots-parser";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

type Limit = ReturnType<typeof pLimit>;

// Simple in-memory robots cache to avoid refetching for every page on same domain
const robotsCache = new Map<
  string,
  { parser: ReturnType<typeof robotsParser>; fetchedAt: number }
>();

// Rate limiting per domain to be polite
const domainLimits = new Map<string, { limit: Limit; lastRequest: number }>();

function getRateLimiter(origin: string) {
  if (!domainLimits.has(origin)) {
    domainLimits.set(origin, {
      limit: pLimit(2), // Max 2 concurrent requests per domain
      lastRequest: 0,
    });
  }
  return domainLimits.get(origin)!;
}

function normalizeUrl(base: string, href: string): string | null {
  if (!href || typeof href !== "string") return null;

  try {
    const url = new URL(href.trim(), base);

    // Remove common tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "fbclid",
      "gclid",
    ];
    trackingParams.forEach((param) => url.searchParams.delete(param));

    // Normalize the URL
    let normalized = url.toString().split("#")[0]; // Remove fragments
    if (normalized.endsWith("/") && normalized.length > url.origin.length + 1) {
      normalized = normalized.slice(0, -1); // Remove trailing slash (except for root)
    }

    return normalized;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
];

function canonicalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    // remove fragment
    url.hash = "";
    // remove trailing slash except root
    if (url.pathname !== "/" && url.pathname.endsWith("/"))
      url.pathname = url.pathname.replace(/\/+$/, "");
    // stable param ordering
    const params = Array.from(url.searchParams.entries()).sort();
    url.search = "";
    for (const [k, v] of params) url.searchParams.append(k, v);
    return url.toString();
  } catch {
    return raw;
  }
}

async function fetchRobotsForOrigin(origin: string) {
  // Check cache (15 min TTL)
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 900_000) return cached.parser;

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": "my-crawler/1.0" },
      signal: AbortSignal.timeout(10000), // 10s timeout for robots.txt
    });
    const txt = res.ok ? await res.text() : "";
    const parser = robotsParser(robotsUrl, txt);
    robotsCache.set(origin, { parser, fetchedAt: Date.now() });
    return parser;
  } catch (err) {
    console.warn(`Failed to fetch robots.txt for ${origin}:`, err);
    return robotsParser("", ""); // permissive fallback
  }
}

async function fetchWithRetry(url: string) {
  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "my-crawler/1.0",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            DNT: "1",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("text/html")) {
          throw new Error(`Not HTML content: ${contentType}`);
        }

        const buffer = await res.arrayBuffer();
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

        if (text.length === 0) {
          throw new Error("Empty response body");
        }

        return text;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
      onFailedAttempt: ({ error, attemptNumber }: RetryContext) => {
        console.warn(
          `Attempt ${attemptNumber} failed for ${url}:`,
          error.message,
        );
      },
    },
  );
}

function extractLinksSameDomain(html: string, base: string, origin: string) {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const full = normalizeUrl(base, href);
    if (!full) return;

    try {
      const u = new URL(full);

      // Must be same origin and HTTP(S)
      if (u.origin !== origin || !["https:", "http:"].includes(u.protocol))
        return;

      // Skip unwanted file types and patterns
      if (
        full.match(
          /\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|mp3|css|js|woff|woff2|ico|xml|json)(\?|$)/i,
        )
      )
        return;

      // Skip common non-content paths
      if (
        full.match(
          /\/(login|register|logout|admin|api|cdn|assets|static|wp-admin|wp-content)\//i,
        )
      )
        return;

      // Skip anchor links, mailto, tel, etc.
      if (href.match(/^(mailto:|tel:|javascript:|#|ftp:|file:)/)) return;

      // Skip query-heavy URLs (likely dynamic/filtered content)
      if (u.searchParams.toString().length > 200) return;

      links.add(full);
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(links);
}

async function extractMainContent(html: string, url: string) {
  // Try Readability first (best for article-like pages)
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const article = reader.parse();

    if (article?.textContent && article.textContent.trim().length > 100) {
      const cleanContent = article.textContent.trim();

      // Basic quality checks
      const wordCount = cleanContent.split(/\s+/).length;
      if (wordCount < 20) return null; // Too short

      // Check for reasonable content-to-noise ratio
      const sentences = cleanContent
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 10);
      if (sentences.length < 3) return null; // Not enough substantial sentences

      return {
        title: article.title?.trim() || "",
        content: cleanContent,
        wordCount,
      };
    }
  } catch (err) {
    console.warn("Readability failed for", url, ":", err);
  }

  // Fallback: improved extraction with cheerio
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $(
    "script, style, nav, footer, header, aside, .sidebar, .menu, .advertisement, .ads, .social-share",
  ).remove();

  const title =
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  // Try to find main content area
  const contentSelectors = [
    "main",
    "article",
    ".content",
    ".post",
    ".article",
    ".entry-content",
    ".post-content",
    ".main-content",
    "#content",
    "#main",
  ];

  let contentArea: Cheerio<AnyNode> = $("body");
  for (const selector of contentSelectors) {
    const element = $(selector).first();
    if (element.length > 0 && element.text().trim().length > 200) {
      contentArea = element;
      break;
    }
  }

  const paragraphs = contentArea
    .find("p, h1, h2, h3, h4, h5, h6, li")
    .map((i, el) => $(el).text().trim())
    .get()
    .filter(
      (text) =>
        text.length > 10 &&
        !text.match(/^(cookie|privacy|terms|subscribe|follow)/i),
    )
    .join("\n\n");

  const finalContent = `${title}\n\n${paragraphs}`.trim();
  const wordCount = finalContent.split(/\s+/).length;

  if (wordCount < 20) return null; // Too short to be useful

  // Check for content quality
  const sentences = finalContent
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 10);
  if (sentences.length < 3) return null;

  return { title, content: finalContent, wordCount };
}

async function enqueueChild(
  url: string,
  kbId: string,
  userId: string,
  depth: number,
) {
  try {
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-crawl`,
      body: { kbId, webUrl: url, userId, depth },
      delay: Math.floor(Math.random() * 5) + 1, // Random delay 1-5 seconds to spread load
    });
  } catch (error) {
    console.error("Failed to enqueue child URL", url, ":", error);
  }
}

async function saveDocumentIfNew(
  kbId: string,
  url: string,
  title: string,
  content: string,
  wordCount?: number,
) {
  try {
    // Dedupe using sourceUrl
    const existing = await prisma.document.findFirst({
      where: { kbId, sourceUrl: url },
      select: { id: true, content: true, filename: true },
    });

    if (existing) {
      // Update if current content is significantly better
      const existingWordCount = existing.content
        ? existing.content.split(/\s+/).length
        : 0;
      const newWordCount = wordCount || content.split(/\s+/).length;

      if (existingWordCount < newWordCount * 0.5) {
        // New content is significantly longer
        await prisma.document.update({
          where: { id: existing.id },
          data: {
            content,
            filename: title || existing.filename || "Untitled",
            mimeType: "text/html",
            metadata: {
              wordCount: newWordCount,
              updatedAt: new Date().toISOString(),
            },
          },
        });
        console.log(`Updated existing document: ${url}`);
      }
      return existing;
    }

    // Create new document
    try {
      const doc = await prisma.document.create({
        data: {
          kbId,
          sourceUrl: url,
          filename: title || "Untitled",
          content,
          mimeType: "text/html",
          metadata: {
            wordCount: wordCount || content.split(/\s+/).length,
            crawledAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `Created new document: ${url} (${wordCount || "unknown"} words)`,
      );
      return doc;
    } catch (err) {
      // Handle unique constraint race (another worker created it)
      // Prisma throws PrismaClientKnownRequestError; code may be 'P2002' for SQL, for Mongo it still surfaces.
      if (
        (err as PrismaClientKnownRequestError)?.code === "P2002" ||
        (err as PrismaClientKnownRequestError)?.message?.includes(
          "duplicate key",
        )
      ) {
        const doc = await prisma.document.findFirst({
          where: { kbId, sourceUrl: url },
        });
        if (doc) return doc;
      }
      throw err;
    }
  } catch (error) {
    console.error("Failed to save document", url, ":", error);
    throw error;
  }
}

async function handler(req: Request) {
  const payload = await req.json();
  const { kbId, webUrl, userId, depth = 1 } = payload;

  if (!kbId || !webUrl) {
    return new Response(JSON.stringify({ error: "missing kbId or webUrl" }), {
      status: 400,
    });
  }

  let origin: string;
  try {
    origin = new URL(webUrl).origin;
  } catch {
    return new Response(JSON.stringify({ error: "invalid URL" }), {
      status: 400,
    });
  }

  console.log(`Processing: ${webUrl} (depth: ${depth})`);

  try {
    // 1) Check robots.txt
    const robots = await fetchRobotsForOrigin(origin);
    if (!robots.isAllowed(webUrl, "my-crawler/1.0")) {
      console.warn("Blocked by robots.txt:", webUrl);
      return new Response(
        JSON.stringify({ blocked: true, reason: "robots.txt" }),
        {
          status: 200,
        },
      );
    }

    // 2) Respect crawl-delay
    const crawlDelay = robots.getCrawlDelay("my-crawler/1.0") || 0;
    if (crawlDelay > 0) {
      await new Promise((r) =>
        setTimeout(r, Math.min(crawlDelay * 1000, 10000)),
      ); // Max 10s delay
    }

    // 3) Rate limiting - ensure polite crawling
    const { limit, lastRequest } = getRateLimiter(origin);
    const timeSinceLastRequest = Date.now() - lastRequest;
    const minInterval = 1000; // 1 second between requests

    if (timeSinceLastRequest < minInterval) {
      await new Promise((r) =>
        setTimeout(r, minInterval - timeSinceLastRequest),
      );
    }

    // 4) Fetch page with retries and rate limiting
    let html: string;
    try {
      html = await limit(async () => {
        const result = await fetchWithRetry(webUrl);
        getRateLimiter(origin).lastRequest = Date.now(); // Update last request time
        return result;
      });
    } catch (err) {
      console.error("Fetch failed:", webUrl, err);
      return new Response(
        JSON.stringify({
          success: false,
          error: "fetch_failed",
          details: err instanceof Error ? err.message : "Unknown error",
        }),
        { status: 500 },
      );
    }

    // 5) Extract main content
    const extracted = await extractMainContent(html, webUrl);
    if (!extracted) {
      console.warn("No meaningful content extracted from:", webUrl);
      return new Response(
        JSON.stringify({ success: false, error: "no_content" }),
        { status: 200 },
      );
    }

    const { title, content, wordCount } = extracted;

    // 6) Save to database
    const savedDocument = await saveDocumentIfNew(
      kbId,
      webUrl,
      title,
      content,
      wordCount,
    );

    // 7) NEW: queue embedding processing for this document
    try {
      if (savedDocument && savedDocument.id) {
        await qstash.publishJSON({
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-embeddings`,
          body: {
            kbId,
            documentId: savedDocument.id,
            userId,
          },
          delay: 5, // small delay to let DB transactions settle
        });
        console.log(
          `Queued embedding processing for document ${savedDocument.id}`,
        );
      }
    } catch (error) {
      console.error("Failed to queue embedding processing:", error);
      // Don't fail the entire process if embedding queuing fails
    }
    // --- end new embeddings logic ---

    // 7) Extract same-domain links and enqueue children (if depth > 0)
    let enqueuedCount = 0;
    if (depth > 0) {
      const links = extractLinksSameDomain(html, webUrl, origin).map(
        canonicalizeUrl,
      );
      console.log(`Found ${links.length} links on ${webUrl}`);

      const maxLinks = Math.min(links.length, 40);
      const selectedLinks = links.slice(0, maxLinks);

      // Batch DB check
      const existingDocs = await prisma.document.findMany({
        where: { kbId, sourceUrl: { in: selectedLinks } },
        select: { sourceUrl: true },
      });
      const existingSet = new Set(
        existingDocs.map((d) => canonicalizeUrl(d.sourceUrl!)),
      );

      const toEnqueue = selectedLinks.filter((l) => !existingSet.has(l));
      const enqueueLimit = pLimit(4);
      await Promise.all(
        toEnqueue.map((link) =>
          enqueueLimit(async () => {
            try {
              await enqueueChild(link, kbId, userId, depth - 1);
            } catch (e) {
              console.error("enqueue child fail", link, e);
            }
          }),
        ),
      );
      enqueuedCount = toEnqueue.length;
    }

    console.log(
      `Successfully processed ${webUrl}: ${wordCount} words, ${enqueuedCount} children enqueued`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        wordCount,
        enqueuedChildren: enqueuedCount,
        title: title || "Untitled",
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Handler error for", webUrl, ":", error);
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
