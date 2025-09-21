export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { Readability } from "@mozilla/readability";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import pLimit from "p-limit";
import type { RetryContext } from "p-retry";
import pRetry from "p-retry";
import robotsParser from "robots-parser";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

type Limit = ReturnType<typeof pLimit>;

interface ExtractedContent {
  title: string;
  content: string;
  wordCount: number;
}

// Domain-specific crawling configurations
const DOMAIN_CONFIGS: Record<
  string,
  {
    crawlDelay: number;
    maxConcurrent: number;
    maxDepth: number;
    respectRobots: boolean;
    userAgent: string;
  }
> = {
  "aoun.cx": {
    crawlDelay: 2000,
    maxConcurrent: 1,
    maxDepth: 3,
    respectRobots: true,
    userAgent: "AounCrawler/1.0 (+https://aoun.cx/robots)",
  },
  "www.aoun.cx": {
    crawlDelay: 2000,
    maxConcurrent: 1,
    maxDepth: 3,
    respectRobots: true,
    userAgent: "AounCrawler/1.0 (+https://aoun.cx/robots)",
  },
};

// Default configuration for unknown domains
const DEFAULT_CONFIG = {
  crawlDelay: 1000,
  maxConcurrent: 2,
  maxDepth: 2,
  respectRobots: true,
  userAgent: "EnhancedWebCrawler/1.0",
};

// Simple in-memory robots cache to avoid refetching for every page on same domain
const robotsCache = new Map<
  string,
  { parser: ReturnType<typeof robotsParser>; fetchedAt: number }
>();

// Rate limiting per domain to be polite
const domainLimits = new Map<string, { limit: Limit; lastRequest: number }>();

// Tracking parameters to remove from URLs
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
  "_ga",
  "_gid",
  "ref",
  "source",
];

function getDomainConfig(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const baseHostname = hostname.replace(/^www\./, "");
    return (
      DOMAIN_CONFIGS[hostname] || DOMAIN_CONFIGS[baseHostname] || DEFAULT_CONFIG
    );
  } catch {
    return DEFAULT_CONFIG;
  }
}

function getRateLimiter(origin: string) {
  if (!domainLimits.has(origin)) {
    const config = getDomainConfig(origin);
    domainLimits.set(origin, {
      limit: pLimit(config.maxConcurrent),
      lastRequest: 0,
    });
  }
  return domainLimits.get(origin)!;
}

function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);

    // Remove tracking parameters
    TRACKING_PARAMS.forEach((param) => url.searchParams.delete(param));

    // Remove fragment
    url.hash = "";

    // Remove trailing slash except root
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    // Stable parameter ordering
    const params = Array.from(url.searchParams.entries()).sort();
    url.search = "";
    for (const [k, v] of params) {
      url.searchParams.append(k, v);
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeUrl(base: string, href: string): string | null {
  if (!href || typeof href !== "string") return null;

  try {
    const url = new URL(href.trim(), base);
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

async function fetchRobotsForOrigin(origin: string) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 900_000) return cached.parser;

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const config = getDomainConfig(origin);

    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": config.userAgent },
      signal: AbortSignal.timeout(10000),
    });

    const txt = res.ok ? await res.text() : "";
    const parser = robotsParser(robotsUrl, txt);
    robotsCache.set(origin, { parser, fetchedAt: Date.now() });
    return parser;
  } catch (err) {
    console.warn(`Failed to fetch robots.txt for ${origin}:`, err);
    return robotsParser("", "");
  }
}

async function fetchWithRetry(url: string): Promise<string> {
  const config = getDomainConfig(url);

  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            DNT: "1",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "no-cache",
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
      minTimeout: 2000,
      maxTimeout: 8000,
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

function extractLinksEnhanced(
  html: string,
  baseUrl: string,
  origin: string,
): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  // Navigation and menu links (high priority)
  $("nav a, .navigation a, .menu a, .navbar a, .header a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) addLink(href);
  });

  // Main content links
  $("main a, article a, .content a, .main-content a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) addLink(href);
  });

  // Breadcrumb and pagination links
  $(".breadcrumb a, .pagination a, .pager a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) addLink(href);
  });

  // Footer links (lower priority, but still useful)
  $("footer a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    // Only include footer links that look like pages, not social media
    if (href && !text.match(/facebook|twitter|instagram|linkedin|github/i)) {
      addLink(href);
    }
  });

  // Next.js specific: extract from router data
  const nextDataMatch = html.match(/__NEXT_DATA__\s*=\s*({.*?});/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      if (data.props?.pageProps?.routes) {
        data.props.pageProps.routes.forEach((route: string) => {
          addLink(route);
        });
      }
      // Extract from build manifest if available
      if (data.buildManifest?.pages) {
        Object.keys(data.buildManifest.pages).forEach((page: string) => {
          if (page !== "/_app" && page !== "/_error") {
            addLink(page);
          }
        });
      }
    } catch (e) {
      console.warn("Failed to parse Next.js data:", e);
    }
  }

  // Try to extract from sitemap links in the page
  $('a[href*="sitemap"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) addLink(href);
  });

  function addLink(href: string) {
    const full = normalizeUrl(baseUrl, href);
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
          /\/(login|register|logout|admin|api|cdn|assets|static|wp-admin|wp-content|_next)\//i,
        )
      )
        return;

      // Skip anchor links, mailto, tel, etc.
      if (href.match(/^(mailto:|tel:|javascript:|#|ftp:|file:)/)) return;

      // Skip query-heavy URLs (likely dynamic/filtered content)
      if (u.searchParams.toString().length > 200) return;

      // Skip URLs with session IDs or temporary tokens
      if (full.match(/[?&](session|token|sid|jsessionid)=/i)) return;

      links.add(full);
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(links);
}

// Enhanced content cleaning functions
function cleanExtractedContent(content: string): string {
  let cleaned = content
    // Remove HTML fragments at the beginning
    .replace(/^[^>]*>[^<]*<[^>]*>/g, "")
    // Remove meta tag fragments
    .replace(/\/><title>[^<]*<\/title><meta name=[^>]*>/g, "")
    .replace(/<title>[^<]*<\/title>/g, "")
    .replace(/<meta[^>]*>/g, "")
    // Remove Next.js internal code patterns
    .replace(/\$L\w+/g, " ")
    .replace(/\["?\$"?,/g, " ")
    .replace(/,null,\{[^}]*\}/g, " ")
    .replace(/,\{\"children\":/g, " ")
    .replace(/\"className\":\s*\"[^"]*\"/g, " ")
    .replace(/\"data-slot\":\s*\"[^"]*\"/g, " ")
    // Clean up React/Next.js patterns
    .replace(/\]\}\]\}\]/g, " ")
    .replace(/\{\["?\$"?,/g, " ")
    .replace(/self\.__next_f[^;]*;/g, " ")
    .replace(/window\.dataLayer[^}]*\}/g, " ")
    // Remove common technical fragments
    .replace(/gtag\([^)]*\);?/g, " ")
    .replace(/fbq\([^)]*\);?/g, " ")
    .replace(/lucide lucide-\w+/g, " ")
    .replace(/aria-hidden[^>]*>/g, " ")
    .replace(/strokeWidth|strokeLinecap|strokeLinejoin/g, " ")
    // Clean up whitespace and line breaks
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove technical noise at the beginning and end
  cleaned = cleaned
    .replace(/^[^a-zA-Z\u0600-\u06FF]*/, "") // Remove non-letter characters at start
    .replace(/[^a-zA-Z\u0600-\u06FF\s.!?]*$/, ""); // Remove non-letter/punctuation at end

  return cleaned;
}

// Enhanced title extraction with better fallbacks
function extractCleanTitle(html: string, url: string, content: string): string {
  // Try multiple title extraction methods
  const titlePatterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      let title = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();

      // Clean up common title patterns
      title = title.replace(/\s*[|\-–]\s*.*$/, "").trim();

      if (
        title.length > 5 &&
        title.length < 200 &&
        !title.includes("<") &&
        !title.includes(">")
      ) {
        return title;
      }
    }
  }

  // Fallback: extract from content
  const contentLines = content
    .split(/[.!?\n]/)
    .filter(
      (line) =>
        line.trim().length > 10 &&
        line.trim().length < 100 &&
        !line.includes("$") &&
        !line.includes("{") &&
        !line.includes("}"),
    );

  if (contentLines.length > 0) {
    return contentLines[0].trim();
  }

  // Final fallback: generate from URL
  try {
    const urlPath = new URL(url).pathname;
    const pathParts = urlPath.split("/").filter((p) => p.length > 0);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      return (
        lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, " ")
      );
    }
  } catch {}

  return "Untitled";
}

// Enhanced content extraction with multiple strategies
async function extractMainContent(
  html: string,
  url: string,
): Promise<ExtractedContent | null> {
  console.log(`Starting enhanced content extraction for ${url}`);

  // Strategy 1: Enhanced Next.js SSR extraction
  const nextjsContent = await extractFromNextjsSSREnhanced(html, url);
  if (nextjsContent && validateExtractedContent(nextjsContent)) {
    console.log(
      `Next.js SSR extraction successful: ${nextjsContent.wordCount} words`,
    );
    logExtractionResults(url, nextjsContent);
    debugContentExtraction(nextjsContent, url);
    return nextjsContent;
  }

  // Strategy 2: DOM-based extraction with SSR awareness
  const domContent = await extractFromDOMEnhanced(html, url);
  if (domContent && validateExtractedContent(domContent)) {
    console.log(
      `Enhanced DOM extraction successful: ${domContent.wordCount} words`,
    );
    logExtractionResults(url, domContent);
    debugContentExtraction(domContent, url);
    return domContent;
  }

  // Strategy 3: Readability as final fallback
  const readabilityContent = await extractWithReadability(html, url);
  if (readabilityContent && validateExtractedContent(readabilityContent)) {
    console.log(
      `Readability extraction successful: ${readabilityContent.wordCount} words`,
    );
    logExtractionResults(url, readabilityContent);
    debugContentExtraction(readabilityContent, url);
    return readabilityContent;
  }

  console.log(`All extraction strategies failed for ${url}`);
  return null;
}

async function extractFromNextjsSSREnhanced(
  html: string,
  url: string,
): Promise<ExtractedContent | null> {
  try {
    console.log("Enhanced Next.js SSR extraction starting...");

    // Find all Next.js self.__next_f script tags
    const scriptMatches = html.match(
      /<script[^>]*>.*?self\.__next_f.*?<\/script>/gs,
    );
    if (!scriptMatches || scriptMatches.length === 0) {
      console.log("No Next.js script tags found");
      return null;
    }

    console.log(`Found ${scriptMatches.length} Next.js script tags`);

    let cleanContent = "";

    // Content quality scoring
    const contentScores: Array<{ text: string; score: number }> = [];

    for (const scriptTag of scriptMatches) {
      const potentialContent = extractContentStrings(scriptTag);

      for (const text of potentialContent) {
        const score = scoreContentQuality(text, url);
        if (score > 0.2) {
          // Lower threshold for more content
          const cleanText = cleanExtractedContent(text);
          if (cleanText.length > 20) {
            // Must have reasonable length after cleaning
            contentScores.push({ text: cleanText, score });
          }
        }
      }
    }

    // Sort by quality score and build content
    contentScores.sort((a, b) => b.score - a.score);

    const seenContent = new Set<string>();
    const usedSentences = new Set<string>();

    for (const { text, score } of contentScores) {
      const sentences = text
        .split(/[.!?؟]/)
        .filter((s) => s.trim().length > 15);

      for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase();

        // Avoid duplicate sentences
        if (seenContent.has(normalized) || usedSentences.has(normalized))
          continue;

        // Skip sentences that are mostly technical
        if (
          sentence.includes("$") ||
          sentence.includes("className") ||
          sentence.includes("onClick") ||
          sentence.includes("href=")
        )
          continue;

        seenContent.add(normalized);
        usedSentences.add(normalized);
        cleanContent += sentence.trim() + ". ";

        // Stop when we have enough quality content
        if (cleanContent.length > 3000) break;
      }

      if (cleanContent.length > 3000) break;
    }

    // Final cleanup
    cleanContent = cleanExtractedContent(cleanContent);

    if (cleanContent.length < 100) {
      console.log("Not enough quality content extracted after cleaning");
      return null;
    }

    // Extract clean title
    const title = extractCleanTitle(html, url, cleanContent);

    const wordCount = cleanContent
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return {
      title,
      content: cleanContent,
      wordCount,
    };
  } catch (error) {
    console.error("Error in enhanced Next.js SSR extraction:", error);
    return null;
  }
}

function extractContentStrings(scriptContent: string): string[] {
  const strings: string[] = [];

  // Focus on the most reliable patterns first
  const patterns = [
    // High-confidence content patterns
    /children['"]*:\s*['"]([\s\S]{20,1000}?)['"]/g,
    /textContent['"]*:\s*['"]([\s\S]{20,800}?)['"]/g,

    // Medium-confidence patterns
    /['"]([\s\S]{30,600}?)['"]\s*[,\]\}]/g,

    // Low-confidence but potentially useful
    /"((?:[^"\\]|\\.){40,400})"/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scriptContent)) !== null) {
      const text = match[1];
      if (text && isLikelyContent(text)) {
        strings.push(text);
      }
    }
  }

  return strings;
}

function isLikelyContent(text: string): boolean {
  const decoded = text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");

  // More restrictive filtering
  if (
    // Technical patterns - more specific
    decoded.match(
      /^(https?:\/\/|\/static\/|\/api\/|function\s*\(|import\s+|export\s+|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|return\s+)/,
    ) ||
    decoded.match(
      /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|json|ico)(\?|$|#)/,
    ) ||
    decoded.match(/^[0-9a-f\-]{20,}$/i) ||
    decoded.match(/^[A-Z_]{5,}$/) ||
    // React/Next.js patterns - more specific
    decoded.match(/^\$L\w+/) ||
    decoded.match(
      /^(onClick|onChange|onSubmit|className|style|ref|key|props)\s*=/,
    ) ||
    (decoded.match(/^[\[\{].*[\]\}]$/) && decoded.length > 50) ||
    // CSS and styling - more specific
    decoded.match(/^[\w\-]+(:\s*[\w\-#%]+;?\s*){2,}$/) ||
    decoded.match(
      /^(flex|grid|inline|block|absolute|relative|fixed|container|hidden)$/,
    ) ||
    // Length constraints
    decoded.length < 15 ||
    decoded.length > 1000
  ) {
    return false;
  }

  // Must contain letters
  if (!decoded.match(/[\p{L}]/u)) return false;

  // More lenient character ratio requirements
  const letterCount = (decoded.match(/[\p{L}]/gu) || []).length;
  const totalLength = decoded.length;
  const spaceCount = (decoded.match(/\s/g) || []).length;

  // At least 25% should be letters
  if (letterCount / totalLength < 0.25) return false;

  // Should have some spaces (indicates natural text)
  if (spaceCount < letterCount * 0.1) return false;

  // Should not be mostly punctuation or numbers
  const punctuationCount = (decoded.match(/[^\p{L}\s]/gu) || []).length;
  if (punctuationCount / totalLength > 0.6) return false;

  return true;
}

function scoreContentQuality(text: string, url: string): number {
  let score = 0;
  const cleanText = enhanceTextContent(text);
  const words = cleanText.split(/\s+/).filter((w) => w.length > 0);

  // Length scoring (optimal range)
  if (cleanText.length >= 50 && cleanText.length <= 1200) score += 0.2; // Increased upper limit
  if (cleanText.length >= 100 && cleanText.length <= 800) score += 0.2;

  // Word count scoring
  if (words.length >= 5 && words.length <= 150) score += 0.3; // Increased upper limit
  if (words.length >= 10 && words.length <= 80) score += 0.2;

  // Sentence structure
  const sentences = cleanText
    .split(/[.!?؟।]/)
    .filter((s) => s.trim().length > 10);
  if (sentences.length >= 1) score += 0.2;
  if (sentences.length >= 2) score += 0.2;

  // Natural language indicators
  const hasCommonWords = cleanText.match(
    /\b(the|and|or|in|on|at|to|for|of|with|by|is|are|was|were|have|has|had|will|would|can|could|should|may|might|we|you|our|your|this|that|these|those|و|في|على|من|إلى|هذا|هذه|التي|الذي|أن|كان|يمكن|سوف|قد|لا|نعم)\b/gi,
  );
  if (hasCommonWords) score += 0.3;

  // Business/content keywords - more comprehensive and less penalizing
  const hasBusinessKeywords = cleanText.match(
    /\b(service|customer|business|support|agent|AI|voice|chat|call|phone|website|platform|solution|help|answer|question|booking|appointment|price|pricing|plan|feature|automation|contact|about|privacy|terms|FAQ|blog|company|team|product|technology|innovation|digital|smart|intelligent|الذكي|الاصطناعي|خدمة|العملاء|الوكيل|المساعد|الأعمال|المنصة|الحل|السعر|الأسعار|الخطة|الميزة|الأتمتة|اتصال|حول|الخصوصية|الشروط|الأسئلة|مدونة|الشركة|الفريق|المنتج|التكنولوجيا|الابتكار|الرقمي|الذكي)\b/gi,
  );
  if (hasBusinessKeywords) {
    const matches = cleanText.match(
      /\b(service|customer|business|support|agent|AI|voice|chat|call|phone|website|platform|solution|help|answer|question|booking|appointment|price|pricing|plan|feature|automation|contact|about|privacy|terms|FAQ|blog|company|team|product|technology|innovation|digital|smart|intelligent|الذكي|الاصطناعي|خدمة|العملاء|الوكيل|المساعد|الأعمال|المنصة|الحل|السعر|الأسعار|الخطة|الميزة|الأتمتة|اتصال|حول|الخصوصية|الشروط|الأسئلة|مدونة|الشركة|الفريق|المنتج|التكنولوجيا|الابتكار|الرقمي|الذكي)\b/gi,
    );
    score += Math.min(0.5, (matches?.length || 0) * 0.08); // Increased bonus
  }

  // Reduce technical penalties - these might appear in legitimate content
  const hasTechnicalWords = cleanText.match(
    /\b(component|props|state|render|function|class|import|export|const|let|var|null|undefined|true|false|jsx|tsx)\b/gi,
  );
  if (hasTechnicalWords) {
    const count = hasTechnicalWords.length;
    // Only penalize if there are many technical terms relative to content length
    if (count > words.length * 0.1) score -= 0.2; // Reduced penalty
  }

  // Reduce CSS penalties - some styling terms might appear in content
  const hasStylingWords = cleanText.match(
    /\b(className|style|css|px|rem|em|flex|grid|hidden|block|inline|absolute|relative|fixed|hover|focus|dark|bg-|text-|w-|h-|p-|m-)\b/gi,
  );
  if (hasStylingWords) {
    const count = hasStylingWords.length;
    if (count > words.length * 0.05) score -= 0.1; // Reduced penalty
  }

  // Be more specific about graphics content
  const hasGraphicsContent =
    cleanText.match(/\b(svg|viewBox|stroke|fill|lucide|icon)\b/gi) &&
    cleanText.match(/M\d+[\d\s\.,\-LCZ]*\d+/); // Must have both keywords AND path data
  if (hasGraphicsContent) score -= 0.2; // Reduced penalty

  // Bonus for proper punctuation
  const hasPunctuation = cleanText.match(/[.!?؟،]/);
  if (hasPunctuation) score += 0.1;

  // Bonus for Arabic content (domain-specific)
  if (cleanText.match(/[\u0600-\u06FF]/)) score += 0.2;

  // Bonus for mixed language content
  if (cleanText.match(/[a-zA-Z]/) && cleanText.match(/[\u0600-\u06FF]/))
    score += 0.1;

  // Less strict penalty for repetitive content
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const uniqueRatio = uniqueWords.size / words.length;
  if (uniqueRatio < 0.3) score -= 0.2; // Only penalize very repetitive content

  // Bonus for reasonable content length
  if (cleanText.length > 200 && cleanText.length < 2000) score += 0.1;

  // Bonus for having multiple sentences
  if (sentences.length >= 3) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

function enhanceTextContent(text: string): string {
  let enhanced = text
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();

  // Handle Arabic content improvements
  if (enhanced.match(/[\u0600-\u06FF]/)) {
    enhanced = enhanceArabicContent(enhanced);
  }

  return enhanced;
}

function enhanceArabicContent(text: string): string {
  return (
    text
      // Fix Arabic text direction markers
      .replace(/[\u200E\u200F\u202A-\u202E]/g, " ")
      // Normalize Arabic numbers
      .replace(/[٠-٩]/g, (match) =>
        String.fromCharCode(match.charCodeAt(0) - 1584 + 48),
      )
      // Fix spacing around Arabic punctuation
      .replace(/\s*([؟،؛])\s*/g, "$1 ")
      // Clean up mixed RTL/LTR text
      .replace(/([a-zA-Z])\s+([\u0600-\u06FF])/g, "$1 $2")
      .replace(/([\u0600-\u06FF])\s+([a-zA-Z])/g, "$1 $2")
      // Fix common Arabic text issues
      .replace(/\s+/g, " ")
      .trim()
  );
}

function normalizeTextContent(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/([.!?؟])\s*([A-ZÀ-ÿ\u0600-\u06FF])/g, "$1\n\n$2") // Add paragraph breaks
    .trim();
}

function extractTitleFromHTML(html: string): string {
  const titlePatterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="title"[^>]*content="([^"]+)"/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      let title = match[1].trim();
      // Clean up common title patterns
      title = title.replace(/\s*[|\-]\s*.*$/, "").trim();
      if (title.length > 5 && title.length < 200) {
        return enhanceTextContent(title);
      }
    }
  }

  return "";
}

async function extractFromDOMEnhanced(
  html: string,
  url: string,
): Promise<ExtractedContent | null> {
  try {
    const $ = cheerio.load(html);

    // Remove noise elements more aggressively
    $(
      "script, style, nav, footer, header, aside, noscript, iframe, " +
        ".nav, .navigation, .menu, .sidebar, .advertisement, .ads, .social, .share, " +
        ".cookie, .popup, .modal, .overlay, .loader, .loading, .spinner, " +
        '[class*="nav"], [class*="menu"], [class*="sidebar"], [class*="ad"], ' +
        '[class*="social"], [class*="share"], [class*="cookie"], [class*="popup"], ' +
        '[class*="loading"], [class*="spinner"], [data-testid*="loading"]',
    ).remove();

    // Try to find main content areas
    const contentSelectors = [
      "main",
      "article",
      ".content",
      ".main-content",
      ".post-content",
      ".entry-content",
      ".page-content",
      ".container main",
      "#content",
      "#main",
      '[role="main"]',
    ];

    let bestContent = "";
    let bestScore = 0;
    let bestTitle = "";

    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 50) {
          const score = scoreContentQuality(text, url);
          if (score > bestScore) {
            bestContent = text;
            bestScore = score;
            // Try to find title within this content area
            const titleElement = element.find("h1, h2, .title").first();
            if (titleElement.length > 0) {
              bestTitle = titleElement.text().trim();
            }
          }
        }
      }
    }

    // Fallback to body content if no specific content area found
    if (!bestContent || bestScore < 0.3) {
      const bodyText = $("body").text().trim();
      if (bodyText.length > 100) {
        const bodyScore = scoreContentQuality(bodyText, url);
        if (bodyScore > bestScore) {
          bestContent = bodyText;
          bestScore = bodyScore;
        }
      }
    }

    if (bestContent.length < 50) return null;

    // Extract title if not found in content area
    if (!bestTitle) {
      bestTitle = extractTitleFromHTML(html);
    }

    const enhancedContent = enhanceTextContent(bestContent);
    const wordCount = enhancedContent
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return {
      title: bestTitle || "",
      content: enhancedContent,
      wordCount,
    };
  } catch (error) {
    console.error("Error in enhanced DOM extraction:", error);
    return null;
  }
}

async function extractWithReadability(
  html: string,
  url: string,
): Promise<ExtractedContent | null> {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const article = reader.parse();

    if (article?.textContent && article.textContent.trim().length > 100) {
      const cleanContent = enhanceTextContent(article.textContent.trim());
      const wordCount = cleanContent
        .split(/\s+/)
        .filter((w) => w.length > 0).length;

      if (wordCount >= 20) {
        return {
          title: article.title?.trim() || "",
          content: cleanContent,
          wordCount,
        };
      }
    }
  } catch (error) {
    console.warn("Readability failed for", url, ":", error);
  }

  return null;
}

function validateExtractedContent(content: ExtractedContent): boolean {
  const { title, content: text, wordCount } = content;

  // Minimum quality thresholds
  if (wordCount < 15) return false;
  if (text.length < 80) return false;

  // More specific noise indicators - avoid false positives
  const noiseIndicators = [
    /M\d+\.\d+[LC]\d+/g, // SVG path commands (more specific)
    /lucide lucide-\w+/g, // Specific icon classes
    /className\s*=\s*["'][^"']*["']/g, // React className props (more specific)
    /__NEXT_DATA__\s*=|self\.__next_f\s*\(/g, // Next.js internal (more specific)
    /\b(onClick|onChange|onSubmit|onFocus|onBlur)\s*=\s*\{/g, // Event handlers (more specific)
  ];

  let noiseCount = 0;
  noiseIndicators.forEach((regex) => {
    const matches = text.match(regex);
    if (matches) noiseCount += matches.length;
  });

  // More lenient noise ratio - 15% instead of 8%
  const noiseRatio = noiseCount / wordCount;
  if (noiseRatio > 0.15) {
    console.warn(
      `Content rejected: ${(noiseRatio * 100).toFixed(1)}% noise, ${noiseCount} noise indicators`,
    );
    return false;
  }

  // Ensure actual readable content exists
  const readableText = text.replace(/[^\p{L}\s]/gu, " ").trim();
  if (readableText.length < text.length * 0.5) {
    // More lenient - 50% instead of 60%
    console.warn("Content rejected: Less than 50% readable text");
    return false;
  }

  // More lenient quality score threshold
  const qualityScore = scoreContentQuality(text, "");
  if (qualityScore < 0.2) {
    // Reduced from 0.3
    console.warn(
      `Content rejected: Quality score ${qualityScore.toFixed(2)} too low`,
    );
    return false;
  }

  return true;
}

function logExtractionResults(url: string, result: ExtractedContent | null) {
  if (!result) {
    console.log(`EXTRACTION FAILED: ${url}`);
    return;
  }

  const quality = scoreContentQuality(result.content, url);
  const status = quality > 0.6 ? "HIGH" : quality > 0.3 ? "MED" : "LOW";

  console.log(
    `${status} QUALITY (${quality.toFixed(2)}): ${url}\n` +
      `  ${result.wordCount} words, title: "${result.title.substring(0, 50)}${result.title.length > 50 ? "..." : ""}"\n` +
      `  Preview: "${result.content.substring(0, 100)}${result.content.length > 100 ? "..." : ""}"`,
  );
}

function debugContentExtraction(content: ExtractedContent, url: string): void {
  const { title, content: text, wordCount } = content;
  const qualityScore = scoreContentQuality(text, url);

  console.log(`\nDEBUG: Content analysis for ${url}`);
  console.log(`Title: "${title}"`);
  console.log(`Word count: ${wordCount}`);
  console.log(`Content length: ${text.length}`);
  console.log(`Quality score: ${qualityScore.toFixed(3)}`);

  // Check noise indicators
  const noiseIndicators = [
    /M\d+\.\d+[LC]\d+/g,
    /lucide lucide-\w+/g,
    /className\s*=\s*["'][^"']*["']/g,
    /__NEXT_DATA__\s*=|self\.__next_f\s*\(/g,
    /\b(onClick|onChange|onSubmit|onFocus|onBlur)\s*=\s*\{/g,
  ];

  let totalNoise = 0;
  noiseIndicators.forEach((regex, i) => {
    const matches = text.match(regex);
    if (matches) {
      console.log(`Noise indicator ${i}: ${matches.length} matches`);
      totalNoise += matches.length;
    }
  });

  console.log(`Total noise indicators: ${totalNoise}`);
  console.log(`Noise ratio: ${((totalNoise / wordCount) * 100).toFixed(1)}%`);
  console.log(`Content preview: "${text.substring(0, 200)}..."`);
  console.log(
    `Validation result: ${validateExtractedContent(content) ? "PASS" : "FAIL"}\n`,
  );
}

async function enqueueChild(
  url: string,
  kbId: string,
  userId: string,
  depth: number,
) {
  try {
    // Add small delay based on domain to spread load
    const config = getDomainConfig(url);
    const delayMs = Math.max(10, Math.floor(config.crawlDelay / 4));

    // Convert to seconds (number) for QStash
    const delaySeconds = Math.max(1, Math.floor(delayMs / 1000));

    // Use numeric delay (seconds) to satisfy SDK types
    const qRes = await qstash.publishJSON({
      url: `${process.env.BASE_URL}/api/process-crawl`,
      body: { kbId, webUrl: url, userId, depth },
      delay: delaySeconds, // <-- number (seconds)
    });

    console.log(
      `Enqueued child ${url} with delay ${delaySeconds}s, qstash:`,
      qRes,
    );
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
      select: { id: true, content: true, filename: true, metadata: true },
    });

    if (existing) {
      // Update if current content is significantly better
      const existingWordCount =
        (existing.metadata as Record<string, number>)?.wordCount ||
        (existing.content ? existing.content.split(/\s+/).length : 0);
      const newWordCount = wordCount || content.split(/\s+/).length;

      // Only update if new content is significantly better (50% more words or much better quality)
      const shouldUpdate =
        existingWordCount < newWordCount * 0.6 ||
        !existing.content ||
        existing.content.length < 100;

      if (shouldUpdate) {
        await prisma.document.update({
          where: { id: existing.id },
          data: {
            content,
            filename: title || existing.filename || "Untitled",
            mimeType: "text/html",
            metadata: {
              ...(existing.metadata as object),
              wordCount: newWordCount,
              updatedAt: new Date().toISOString(),
              extractionMethod: "enhanced",
              qualityScore: scoreContentQuality(content, url),
            },
          },
        });
        console.log(
          `Updated existing document: ${url} (${newWordCount} words)`,
        );
      } else {
        console.log(`Skipped update for ${url}: existing content is adequate`);
      }
      return existing;
    }

    // Create new document
    try {
      const qualityScore = scoreContentQuality(content, url);
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
            extractionMethod: "enhanced",
            qualityScore,
            contentLength: content.length,
          },
        },
      });

      console.log(
        `Created new document: ${url} (${wordCount || "unknown"} words, quality: ${qualityScore.toFixed(2)})`,
      );
      return doc;
    } catch (err) {
      // Handle unique constraint race condition
      if (
        (err as PrismaClientKnownRequestError)?.code === "P2002" ||
        (err as PrismaClientKnownRequestError)?.message?.includes(
          "duplicate key",
        )
      ) {
        const doc = await prisma.document.findFirst({
          where: { kbId, sourceUrl: url },
        });
        if (doc) {
          console.log(`Document created by another process: ${url}`);
          return doc;
        }
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
    const url = new URL(webUrl);
    origin = url.origin;
  } catch {
    return new Response(JSON.stringify({ error: "invalid URL" }), {
      status: 400,
    });
  }

  console.log(`Processing: ${webUrl} (depth: ${depth})`);

  try {
    const config = getDomainConfig(webUrl);

    // 1) Check robots.txt if configured to respect it
    if (config.respectRobots) {
      const robots = await fetchRobotsForOrigin(origin);
      if (!robots.isAllowed(webUrl, config.userAgent)) {
        console.warn("Blocked by robots.txt:", webUrl);
        return new Response(
          JSON.stringify({ blocked: true, reason: "robots.txt" }),
          { status: 200 },
        );
      }

      // 2) Respect crawl-delay from robots.txt
      const robotsCrawlDelay = robots.getCrawlDelay(config.userAgent) || 0;
      const finalDelay = Math.max(config.crawlDelay, robotsCrawlDelay * 1000);
      if (finalDelay > 0) {
        await new Promise((r) => setTimeout(r, Math.min(finalDelay, 10000))); // Max 10s delay
      }
    }

    // 3) Rate limiting - ensure polite crawling
    const { limit, lastRequest } = getRateLimiter(origin);
    const timeSinceLastRequest = Date.now() - lastRequest;
    const minInterval = config.crawlDelay;

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
        getRateLimiter(origin).lastRequest = Date.now();
        return result;
      });

      console.log(`Successfully fetched ${webUrl} (${html.length} chars)`);
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

    // 5) Extract main content with enhanced algorithms
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

    // 7) Queue embedding processing for this document (use numeric delay and log response)
    try {
      if (savedDocument && savedDocument.id) {
        const initialDelaySeconds = 2;

        const qRes = await qstash.publishJSON({
          url: `${process.env.BASE_URL}/api/process-embeddings`,
          body: {
            kbId,
            documentId: savedDocument.id,
            userId,
            webUrl,
          },
          delay: initialDelaySeconds,
        });

        console.log(
          `Published embedding job for document ${savedDocument.id} to QStash:`,
          qRes,
        );
      }
    } catch (err) {
      console.error("Failed to publish embedding job to QStash:", err);
    }

    // 8) Extract same-domain links and enqueue children (if depth > 0)
    let enqueuedCount = 0;
    if (depth > 0) {
      const links = extractLinksEnhanced(html, webUrl, origin)
        .map(canonicalizeUrl)
        .filter((link, index, arr) => arr.indexOf(link) === index); // Remove duplicates

      console.log(`Found ${links.length} unique links on ${webUrl}`);

      // Limit links per page based on domain config
      const maxLinks = Math.min(links.length, config.maxDepth * 15);
      const selectedLinks = links.slice(0, maxLinks);

      // Batch DB check to avoid processing already crawled URLs
      const existingDocs = await prisma.document.findMany({
        where: { kbId, sourceUrl: { in: selectedLinks } },
        select: { sourceUrl: true },
      });
      const existingSet = new Set(
        existingDocs.map((d) => canonicalizeUrl(d.sourceUrl!)),
      );

      const toEnqueue = selectedLinks.filter((l) => !existingSet.has(l));

      // Enqueue with controlled concurrency
      const enqueueLimit = pLimit(3);
      await Promise.all(
        toEnqueue.map((link) =>
          enqueueLimit(async () => {
            try {
              await enqueueChild(link, kbId, userId, depth - 1);
            } catch (e) {
              console.error("Failed to enqueue child", link, e);
            }
          }),
        ),
      );
      enqueuedCount = toEnqueue.length;

      console.log(
        `Link processing: ${selectedLinks.length} selected, ${existingDocs.length} already exist, ${enqueuedCount} enqueued`,
      );
    }

    const qualityScore = scoreContentQuality(content, webUrl);

    console.log(
      `Successfully processed ${webUrl}:\n` +
        `  - Content: ${wordCount} words, ${content.length} chars\n` +
        `  - Quality: ${qualityScore.toFixed(2)}\n` +
        `  - Children: ${enqueuedCount} enqueued\n` +
        `  - Title: "${title || "Untitled"}"`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        wordCount,
        contentLength: content.length,
        qualityScore: qualityScore,
        enqueuedChildren: enqueuedCount,
        title: title || "Untitled",
        extractionMethod: "enhanced",
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
      {
        status: 500,
      },
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
