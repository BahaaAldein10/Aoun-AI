/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/process-crawl/route.ts
import { prisma } from "@/lib/prisma";
import { Readability } from "@mozilla/readability";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import chromium from "@sparticuz/chromium";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import * as cheerio from "cheerio";
import { load } from "cheerio";
import type { Element } from "domhandler";
import { JSDOM } from "jsdom";
import pLimit from "p-limit";
import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import robotsParser from "robots-parser";

export const runtime = "nodejs";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

type CheerioEl = cheerio.Cheerio<Element>;
type CheerioRoot = ReturnType<typeof load>;

// Simple in-memory robots cache to avoid refetching for every page on same domain
const robotsCache = new Map<
  string,
  { parser: ReturnType<typeof robotsParser>; fetchedAt: number }
>();

// Rate limiting per domain to be polite
const domainLimits = new Map<
  string,
  { limit: ReturnType<typeof pLimit>; lastRequest: number }
>();

function getRateLimiter(origin: string) {
  if (!domainLimits.has(origin)) {
    domainLimits.set(origin, {
      limit: pLimit(2), // Max 2 concurrent requests per domain
      lastRequest: 0,
    });
  }
  return domainLimits.get(origin)!;
}

// Type definitions
interface CrawlerConfig {
  timeout: number;
  maxRetries: number;
  minWordCount: number;
  puppeteerTimeout: number;
  waitForDynamic: number;
  enablePuppeteer: boolean;
}

interface UserAgents {
  desktop: string;
  mobile: string;
  bot: string;
}

interface ExtractionResult {
  title: string;
  content: string;
  wordCount: number;
  method: string;
  extractionMethod?: string;
  html?: string;
}

interface CrawlStrategy {
  name: string;
  fn: () => Promise<{ result: ExtractionResult | null; html?: string }>;
}

interface RequestBody {
  kbId: string;
  webUrl: string;
  userId: string;
  depth?: Depth;
}

// Configuration optimized for Vercel
const CRAWLER_CONFIG: CrawlerConfig = {
  timeout: 45000,
  maxRetries: 3,
  minWordCount: 15, // Reasonable minimum
  puppeteerTimeout: 25000,
  waitForDynamic: 2000,
  enablePuppeteer: true,
};

// User agents for different strategies
const USER_AGENTS: UserAgents = {
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  bot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

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
  "ref",
  "source",
];

type Depth = 0 | 1 | 2 | 3;

const MAX_LINKS_PER_DEPTH: Record<Depth, number> = {
  3: 25,
  2: 20,
  1: 15,
  0: 0,
};

function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/"))
      url.pathname = url.pathname.replace(/\/+$/, "");
    const params = Array.from(url.searchParams.entries()).sort();
    url.search = "";
    for (const [k, v] of params) url.searchParams.append(k, v);
    return url.toString();
  } catch {
    return raw;
  }
}

async function fetchRobotsForOrigin(origin: string) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 900_000) return cached.parser;

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(robotsUrl, {
        headers: { "User-Agent": USER_AGENTS.bot },
        signal: controller.signal,
      });
      const txt = res.ok ? await res.text() : "";
      const parser = robotsParser(robotsUrl, txt);
      robotsCache.set(origin, { parser, fetchedAt: Date.now() });
      return parser;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn(`Failed to fetch robots.txt for ${origin}:`, err);
    return robotsParser("", "");
  }
}

class RobustWebCrawler {
  private config: CrawlerConfig;
  private browser: Browser | null = null;

  constructor(config: CrawlerConfig = CRAWLER_CONFIG) {
    this.config = config;
  }

  // Main crawl method with optimized strategy selection
  async crawl(url: string): Promise<ExtractionResult & { html?: string }> {
    console.log(`[Crawler] Starting crawl for: ${url}`);

    // Check robots.txt and rate limiting
    const origin = new URL(url).origin;
    const robots = await fetchRobotsForOrigin(origin);
    if (!robots.isAllowed(url, USER_AGENTS.bot)) {
      throw new Error("Blocked by robots.txt");
    }

    const crawlDelay = robots.getCrawlDelay(USER_AGENTS.bot) || 0;
    if (crawlDelay > 0) {
      await this.delay(Math.min(crawlDelay * 1000, 10000));
    }

    const { limit, lastRequest } = getRateLimiter(origin);
    const timeSinceLastRequest = Date.now() - lastRequest;
    const minInterval = 1000;

    if (timeSinceLastRequest < minInterval) {
      await this.delay(minInterval - timeSinceLastRequest);
    }

    // Use smart strategy selection
    const strategies = this.getStrategiesForUrl(url);

    // Try strategies in order
    for (const strategy of strategies) {
      try {
        console.log(`[Crawler] Trying ${strategy.name} strategy...`);
        const { result, html } = await this.withRetry<{
          result: ExtractionResult | null;
          html?: string;
        }>(() => strategy.fn());

        if (this.isValidResult(result)) {
          console.log(
            `[Crawler] ✓ ${strategy.name} successful: ${result.wordCount} words`,
          );
          getRateLimiter(origin).lastRequest = Date.now();
          return { ...result, extractionMethod: strategy.name, html };
        } else {
          const wordCount = (result as ExtractionResult | null)?.wordCount ?? 0;
          console.log(
            `[Crawler] ✗ ${strategy.name} insufficient: ${wordCount} words`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(`[Crawler] ✗ ${strategy.name} failed:`, errorMessage);
      }
    }

    // Final fallback
    console.log("[Crawler] All strategies failed, trying fallback...");
    const fallback = await this.crawlFallback(url);
    getRateLimiter(origin).lastRequest = Date.now();
    return { ...fallback, extractionMethod: "fallback" };
  }

  // Smart strategy selection based on site characteristics
  private getStrategiesForUrl(url: string): CrawlStrategy[] {
    const strategies: CrawlStrategy[] = [];
    const isRSCSite = this.detectRSCSite(url);
    const isArabicSite = url.includes("/ar/") || url.includes("/arabic/");

    console.log(
      `[Crawler] Site analysis - RSC: ${isRSCSite}, Arabic: ${isArabicSite}`,
    );

    // For RSC sites, prioritize dynamic rendering
    if (isRSCSite) {
      if (this.config.enablePuppeteer) {
        strategies.push({ name: "dynamic", fn: () => this.crawlDynamic(url) });
      }
      // Enhanced static for RSC
      strategies.push({
        name: "static-rsc",
        fn: () => this.crawlStaticRSC(url),
      });
    } else {
      // Regular sites: try static first
      strategies.push({ name: "static", fn: () => this.crawlStatic(url) });
    }

    // Always include these fallbacks
    strategies.push({
      name: "readability",
      fn: () => this.crawlWithReadability(url),
    });
    strategies.push({ name: "semantic", fn: () => this.crawlSemantic(url) });

    return strategies;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    retries?: number,
  ): Promise<T> {
    const max = retries ?? this.config.maxRetries;
    let lastError: Error = new Error("No attempts made");

    for (let i = 0; i < max; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < max - 1) {
          await this.delay(1000 * (i + 1));
        }
      }
    }

    throw lastError;
  }

  // Vercel-optimized dynamic crawling
  private async crawlDynamic(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    let page: Page | null = null;

    try {
      if (!this.browser) {
        const isProduction = this.isVercelEnvironment();
        const chrom = chromium as unknown as any;

        const launchOptions: any = {
          args: isProduction
            ? chrom?.args || []
            : [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security",
                "--disable-blink-features=AutomationControlled",
              ],
          defaultViewport: isProduction
            ? chrom?.defaultViewport
            : { width: 1920, height: 1080 },
          executablePath: isProduction
            ? await chrom.executablePath()
            : process.env.PUPPETEER_EXECUTABLE_PATH ||
              "/usr/bin/google-chrome-stable",
          headless: isProduction ? (chrom?.headless ?? true) : true,
        };

        console.log(`[Puppeteer] Launching (production: ${isProduction})`);
        this.browser = await puppeteer.launch(launchOptions);
      }

      page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(USER_AGENTS.desktop);

      // Block unnecessary resources
      try {
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const resourceType = req.resourceType();
          if (["image", "font", "media", "stylesheet"].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });
      } catch {
        console.warn("[Puppeteer] Request interception unavailable");
      }

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.config.puppeteerTimeout,
      });

      // Wait for content to load
      try {
        await page.waitForFunction(
          () => {
            const text = document.body?.textContent || "";
            return text.length > 100;
          },
          { timeout: 10000 },
        );
      } catch {
        console.log("[Puppeteer] Content wait timeout, proceeding");
      }

      await this.delay(this.config.waitForDynamic);

      const html = await page.content();
      const title = await page.title();

      console.log(`[Puppeteer] Got ${html.length} chars, title: "${title}"`);

      // Try extraction approaches
      const approaches = [
        () => this.processWithReadability(html, url),
        () => this.processSemanticHTML(html, url),
        () => this.extractCleanRSCContent(html, title),
      ];

      for (const approach of approaches) {
        const result = approach();
        if (this.isValidResult(result)) {
          return {
            result: { ...result, title: title || result.title },
            html,
          };
        }
      }

      return { result: null, html };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[Puppeteer] Error:`, errorMessage);
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          console.warn("[Puppeteer] Error closing page");
        }
      }
    }
  }

  // Enhanced static crawling with RSC handling
  private async crawlStatic(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    const html = await this.fetchHTML(url, USER_AGENTS.desktop);

    // Try standard methods first
    let result =
      this.processSemanticHTML(html, url) ||
      this.processWithReadability(html, url);

    if (!this.isValidResult(result)) {
      // Try content density
      result = this.processContentDensity(html, url);
    }

    return { result, html };
  }

  // Enhanced RSC static crawling
  private async crawlStaticRSC(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    const html = await this.fetchHTML(url, USER_AGENTS.desktop);

    console.log(`[Static RSC] Processing ${html.length} chars`);

    // Try RSC-specific extraction first
    let result = this.extractCleanRSCContent(html);

    // If RSC fails, try standard methods
    if (!this.isValidResult(result)) {
      result =
        this.processSemanticHTML(html, url) ||
        this.processWithReadability(html, url) ||
        this.processContentDensity(html, url, true);
    }

    return { result, html };
  }

  // ROBUST RSC content extraction - this is the key improvement
  private extractCleanRSCContent(
    html: string,
    fallbackTitle?: string,
  ): ExtractionResult | null {
    try {
      console.log("[RSC] Starting clean extraction");

      // Step 1: Extract meaningful text segments from flight payloads
      const textSegments = this.extractMeaningfulSegments(html);
      console.log(`[RSC] Found ${textSegments.length} text segments`);

      if (textSegments.length === 0) return null;

      // Step 2: Clean and filter segments
      const cleanedSegments = textSegments
        .map((text) => this.cleanTextSegment(text))
        .filter((text) => this.isQualityContent(text));

      console.log(`[RSC] ${cleanedSegments.length} segments after cleaning`);

      if (cleanedSegments.length === 0) return null;

      // Step 3: Build content with smart deduplication
      const content = this.buildContentFromSegments(cleanedSegments);

      if (content.length < 50) return null;

      // Step 4: Extract title
      const title =
        fallbackTitle ||
        this.extractTitleFromRSC(html) ||
        this.extractTitleFromURL(html) ||
        "Extracted Content";

      const result = this.createResult(title, content, "rsc-clean");

      console.log(`[RSC] Final result: ${result.wordCount} words`);
      return result;
    } catch (error) {
      console.warn("[RSC] Extraction failed:", error);
      return null;
    }
  }

  // Extract meaningful text segments from various RSC patterns
  private extractMeaningfulSegments(html: string): string[] {
    const segments = new Set<string>();

    // Pattern 1: Flight payload strings
    const flightPattern = /self\.__next_f\.push\(\s*\[([^\]]+)\]\s*\)/g;
    let match;
    while ((match = flightPattern.exec(html)) !== null) {
      const payload = match[1];
      this.extractTextFromPayload(payload, segments);
    }

    // Pattern 2: Direct JSON strings in scripts
    const jsonPattern = /"([^"]{20,300})"/g;
    while ((match = jsonPattern.exec(html)) !== null) {
      const text = match[1];
      if (this.isPotentiallyMeaningful(text)) {
        segments.add(text);
      }
    }

    // Pattern 3: React component text content
    const componentPattern = />\s*([^<>{]{20,200})\s*</g;
    while ((match = componentPattern.exec(html)) !== null) {
      const text = match[1].trim();
      if (this.isPotentiallyMeaningful(text)) {
        segments.add(text);
      }
    }

    return Array.from(segments);
  }

  // Extract text from Next.js flight payload
  private extractTextFromPayload(payload: string, segments: Set<string>) {
    try {
      // Look for quoted strings in the payload
      const quotedPattern = /"([^"]{15,500})"/g;
      let match;
      while ((match = quotedPattern.exec(payload)) !== null) {
        const text = match[1]
          .replace(/\\n/g, " ")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
          .replace(/\\[tr]/g, " ")
          .trim();

        if (this.isPotentiallyMeaningful(text)) {
          segments.add(text);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check if text segment is potentially meaningful
  private isPotentiallyMeaningful(text: string): boolean {
    if (!text || text.length < 15 || text.length > 500) return false;

    // Must have readable characters
    if (!/[a-zA-Z\u0600-\u06FF]{10,}/.test(text)) return false;

    // Skip obvious technical noise
    const technicalNoise = [
      /^[\d\s\-_:,\[\]{}()\.\/\\]+$/,
      /^[a-f0-9]{8,}$/,
      /^[A-Z][a-z]*$/,
      /webpack|chunk|__next|static\/|cdn\.|\.css|\.js|\.woff|\.png/i,
      /className|onClick|onSubmit|href.*https?|src.*https?|data-/i,
      /lucide|icon|button|input|form|div|span|nav|header|footer/i,
      /^\w+\s*:\s*\w+$/,
      /^(true|false|null|undefined)$/i,
    ];

    if (technicalNoise.some((pattern) => pattern.test(text))) return false;

    return true;
  }

  // Clean individual text segment
  private cleanTextSegment(text: string): string {
    return text
      .replace(/\\[ntr]/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .trim();
  }

  // Check if content meets quality standards
  private isQualityContent(text: string): boolean {
    if (!text || text.length < 20) return false;

    // Check for meaningful patterns
    const meaningfulPatterns = [
      /[.!?؟،]/,
      /\b(the|and|or|in|on|at|to|for|of|with|by|about|contact|home|terms|privacy|faq|pricing|blog)\b/i,
      /\b(في|من|إلى|على|مع|عن|هذا|هذه|التي|الذي|حول|اتصل|الرئيسية|الشروط|الخصوصية|الأسئلة|الأسعار|المدونة)\b/,
      /\b\w{4,}\s+\w{4,}\s+\w{4,}/,
    ];

    if (!meaningfulPatterns.some((pattern) => pattern.test(text))) {
      return false;
    }

    // Additional quality checks
    const words = text.split(/\s+/).filter((w) => w.length > 2);
    if (words.length < 4) return false;

    // Check word diversity (avoid repetitive text)
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const diversity = uniqueWords.size / words.length;
    if (diversity < 0.5 && words.length > 10) return false;

    return true;
  }

  // Build final content from segments with smart deduplication
  private buildContentFromSegments(segments: string[]): string {
    // Sort by length (longer segments first, they're usually more complete)
    const sortedSegments = [...segments].sort((a, b) => b.length - a.length);

    const finalSegments: string[] = [];
    const usedContent = new Set<string>();

    for (const segment of sortedSegments) {
      // Check for overlap with existing content
      const normalizedSegment = segment.toLowerCase().replace(/\s+/g, " ");
      let isOverlapping = false;

      for (const used of usedContent) {
        const normalizedUsed = used.toLowerCase().replace(/\s+/g, " ");

        // Check if this segment is contained in or contains existing content
        if (
          normalizedSegment.includes(normalizedUsed) ||
          normalizedUsed.includes(normalizedSegment)
        ) {
          isOverlapping = true;
          break;
        }

        // Check for significant word overlap
        const segmentWords = normalizedSegment.split(/\s+/);
        const usedWords = normalizedUsed.split(/\s+/);
        const commonWords = segmentWords.filter((word) =>
          usedWords.includes(word),
        );

        if (
          commonWords.length >
          Math.min(segmentWords.length, usedWords.length) * 0.7
        ) {
          isOverlapping = true;
          break;
        }
      }

      if (!isOverlapping) {
        finalSegments.push(segment);
        usedContent.add(segment);
      }

      // Limit total segments to prevent overly long content
      if (finalSegments.length >= 20) break;
    }

    return finalSegments.join(" ").replace(/\s+/g, " ").trim();
  }

  // Standard extraction methods
  private async crawlWithReadability(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    const langHeader = url.includes("/ar/") ? { "Accept-Language": "ar" } : {};
    const html = await this.fetchHTML(
      url,
      USER_AGENTS.bot,
      langHeader as { "Accept-Language": string },
    );
    return { result: this.processWithReadability(html, url), html };
  }

  private async crawlSemantic(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    const html = await this.fetchHTML(url, USER_AGENTS.desktop);
    return { result: this.processSemanticHTML(html, url), html };
  }

  private processWithReadability(
    html: string,
    url: string,
  ): ExtractionResult | null {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        const cleanContent = this.cleanText(article.textContent);
        if (cleanContent.length > 100) {
          return this.createResult(
            article.title || "Untitled",
            cleanContent,
            "readability",
          );
        }
      }
    } catch {
      console.warn("[Readability] Processing failed");
    }
    return null;
  }

  private processSemanticHTML(
    html: string,
    url: string,
  ): ExtractionResult | null {
    try {
      const $ = load(html);
      this.removeNoiseElements($);

      const semanticSelectors = [
        "main article",
        '[role="main"] article',
        "main",
        "article",
        '[role="main"]',
        ".content-area",
        ".main-content",
        ".post-content",
        ".entry-content",
        ".article-content",
        "#content",
        "#main-content",
      ];

      for (const selector of semanticSelectors) {
        const element = $(selector).first() as CheerioEl;
        if (element.length > 0) {
          const text = this.extractTextFromElement(element);
          if (text.length > 200) {
            const title = this.extractTitle($);
            return this.createResult(title, text, "semantic");
          }
        }
      }

      return this.processContentDensity(html, url);
    } catch {
      console.warn("[Semantic] Processing failed");
    }
    return null;
  }

  private processContentDensity(
    html: string,
    url: string,
    relaxed: boolean = false,
  ): ExtractionResult | null {
    try {
      const $ = load(html);
      this.removeNoiseElements($);

      let bestElement: CheerioEl | null = null;
      let bestScore = relaxed ? 50 : 100;

      const selectors = relaxed
        ? "div, section, article, main, p, .content, [class*='text'], [class*='content']"
        : "div, section, article, main, .content";

      $(selectors).each((_, element) => {
        const $el = $(element) as CheerioEl;
        const score = this.calculateContentScore($el);

        if (score > bestScore) {
          bestScore = score;
          bestElement = $el;
        }
      });

      if (bestElement) {
        const text = this.extractTextFromElement(bestElement);
        const title =
          this.extractTitleFromHTML(html) ||
          (bestElement as CheerioEl).find("h1, h2, h3").first().text().trim();

        if (text.length >= (relaxed ? 50 : 150)) {
          return this.createResult(
            title,
            text,
            `density${relaxed ? "-relaxed" : ""}`,
          );
        }
      }
    } catch {
      console.warn("[Content Density] Processing failed");
    }
    return null;
  }

  private calculateContentScore($element: CheerioEl): number {
    const text = $element.text();
    const textLength = text.length;

    if (textLength < 100) return 0;

    const linkText = $element.find("a").text();
    const linkLength = linkText.length;
    const contentRatio =
      textLength > 0 ? (textLength - linkLength) / textLength : 0;

    const paragraphs = $element.find("p").length;
    const headings = $element.find("h1, h2, h3, h4, h5, h6").length;

    const baseScore = textLength * contentRatio;
    const structureBonus = paragraphs * 10 + headings * 15;
    const linkPenalty = linkLength > textLength * 0.3 ? -50 : 0;

    return baseScore + structureBonus + linkPenalty;
  }

  // Comprehensive fallback method
  private async crawlFallback(url: string): Promise<ExtractionResult> {
    try {
      const html = await this.fetchHTML(url, USER_AGENTS.desktop);

      const approaches = [
        () => this.extractVisibleText(html),
        () => this.extractFromMetaTags(html),
        () => {
          const result = this.extractCleanRSCContent(html);
          return result?.content || null;
        },
      ];

      for (const approach of approaches) {
        const content = approach();
        if (content && content.length > 100) {
          const title =
            this.extractTitleFromHTML(html) || this.extractTitleFromURL(url);
          return this.createResult(title, content, "fallback-enhanced");
        }
      }

      // Last resort
      const $ = load(html);
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const title = this.extractTitleFromHTML(html) || "Extracted Content";

      return this.createResult(
        title,
        bodyText.length > 100
          ? bodyText.substring(0, 2000)
          : "Content extraction failed",
        "fallback-basic",
      );
    } catch (error) {
      return {
        title: "Extraction Failed",
        content: `Unable to extract content: ${error instanceof Error ? error.message : "Unknown error"}`,
        wordCount: 0,
        method: "failed",
      };
    }
  }

  // Fallback extraction methods
  private extractVisibleText(html: string): string | null {
    try {
      const $ = load(html);
      $(
        "script, style, nav, header, footer, noscript, [style*='display:none'], [style*='visibility:hidden']",
      ).remove();
      const text = $("body").text().replace(/\s+/g, " ").trim();
      return text.length > 200 ? text : null;
    } catch {
      return null;
    }
  }

  private extractFromMetaTags(html: string): string | null {
    try {
      const $ = load(html);
      const metaContents = [
        $('meta[name="description"]').attr("content"),
        $('meta[property="og:description"]').attr("content"),
        $('meta[name="twitter:description"]').attr("content"),
      ].filter(Boolean);

      return metaContents.length > 0 ? metaContents.join(" ") : null;
    } catch {
      return null;
    }
  }

  // Title extraction methods
  private extractTitleFromHTML(html: string): string {
    const $ = load(html);

    const titleCandidates = [
      () => $("h1").first().text().trim(),
      () => $('meta[property="og:title"]').attr("content") || "",
      () => $('meta[name="twitter:title"]').attr("content") || "",
      () =>
        $("title")
          .text()
          .split(/[|\-–]/)[0]
          .trim(),
      () => $('[class*="title"], [class*="headline"]').first().text().trim(),
    ];

    for (const getTitle of titleCandidates) {
      const title = getTitle();
      if (title && title.length > 3 && title.length < 150) {
        return title;
      }
    }

    return "Untitled";
  }

  private extractTitleFromRSC(html: string): string | null {
    const titlePatterns = [
      /"title"[^}]*?"children":\s*"([^"]+)"/,
      /"children":\s*"([^\"]*(?:FAQ|Contact|About|Home|Blog|Pricing|Terms|Privacy)[^\"]*?)"/i,
      /"children":\s*"([^\"]*(?:الأسئلة|تواصل|حول|الرئيسية|المدونة|الأسعار|شروط|الخصوصية)[^\"]*?)"/i,
    ];

    for (const pattern of titlePatterns) {
      const matches = html.match(pattern);
      if (matches && matches[1] && matches[1].length > 3) {
        return matches[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    }

    return null;
  }

  private extractTitleFromURL(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        const titleMap: Record<string, string> = {
          faq: "FAQ",
          contact: "Contact Us",
          about: "About",
          pricing: "Pricing",
          blog: "Blog",
          terms: "Terms of Service",
          privacy: "Privacy Policy",
          ar: "Arabic",
          en: "English",
        };

        return (
          titleMap[lastPart.toLowerCase()] ||
          lastPart.charAt(0).toUpperCase() +
            lastPart.slice(1).replace(/[-_]/g, " ")
        );
      }

      const hostname = urlObj.hostname.replace(/^www\./, "");
      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch {
      return "Extracted Content";
    }
  }

  // Utility methods
  private async fetchHTML(
    url: string,
    userAgent: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers = {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...extraHeaders,
      };

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      console.log(
        `[fetchHTML] ${response.status} - ${text.length} chars - ${response.headers.get("content-encoding") || "none"}`,
      );

      if (this.isValidHTMLContent(text)) {
        return text;
      } else {
        throw new Error("Response is not valid HTML content");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isValidHTMLContent(content: string): boolean {
    const hasHTMLTags = /<[a-z][\s\S]*>/i.test(content);
    const hasReadableText = /[a-zA-Z\u0600-\u06FF]{20,}/.test(content);
    const isNotBinary = !/[\x00-\x08\x0E-\x1F\x7F-\xFF]{10,}/.test(
      content.substring(0, 500),
    );

    return (hasHTMLTags || hasReadableText) && isNotBinary;
  }

  private detectRSCSite(url: string): boolean {
    const hostname = new URL(url).hostname;
    return (
      hostname.includes("vercel.app") ||
      hostname.includes("netlify.app") ||
      hostname.endsWith(".cx") ||
      url.includes("/_next/") ||
      url.includes("/static/chunks/")
    );
  }

  private removeNoiseElements($: CheerioRoot): void {
    const noiseSelectors = [
      "script",
      "style",
      "nav",
      "header",
      "footer",
      "aside",
      "noscript",
      ".advertisement",
      ".ads",
      ".social",
      ".comments",
      ".sidebar",
      ".navigation",
      ".menu",
      ".breadcrumb",
      ".cookie",
      ".popup",
      '[class*="ad-"]',
      '[class*="advertisement"]',
      '[class*="banner"]',
      '[class*="social"]',
      '[id*="comment"]',
      '[class*="share"]',
    ];

    $(noiseSelectors.join(", ")).remove();
  }

  private extractTextFromElement($element: CheerioEl): string {
    return this.cleanText($element.text());
  }

  private extractTitle($: CheerioRoot): string {
    const titleCandidates = [
      () => $("h1").first().text().trim(),
      () => $('[class*="title"], [class*="headline"]').first().text().trim(),
      () =>
        $("title")
          .text()
          .replace(/\s*[|\-–]\s*.*$/, "")
          .trim(),
      () => $('meta[property="og:title"]').attr("content") || "",
      () => $('meta[name="twitter:title"]').attr("content") || "",
    ];

    for (const getTitle of titleCandidates) {
      const title = getTitle();
      if (title && title.length > 3 && title.length < 200) {
        return title;
      }
    }

    return "Untitled";
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  }

  private createResult(
    title: string | null,
    content: string,
    method: string,
  ): ExtractionResult {
    const cleanContent = this.cleanText(content);
    const wordCount = cleanContent
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return {
      title: title || "Untitled",
      content: cleanContent,
      wordCount,
      method,
    };
  }

  private isValidResult(
    result: ExtractionResult | null,
  ): result is ExtractionResult {
    if (!result || !result.content) return false;

    // Check minimum word count
    if (result.wordCount < this.config.minWordCount) return false;

    // Check for technical noise
    const content = result.content.toLowerCase();
    const technicalRatio = this.calculateTechnicalNoiseRatio(content);
    if (technicalRatio > 0.3) return false;

    // Check for meaningful content patterns
    const meaningfulPatterns = [
      /[.!?؟،]/,
      /\b(the|and|or|in|on|at|to|for|of|with|by|about|contact|home|services|products|pricing|terms|privacy|faq|blog)\b/i,
      /\b(في|من|إلى|على|مع|عن|هذا|هذه|التي|الذي|حول|اتصل|الرئيسية|الخدمات|المنتجات|الأسعار|الشروط|الخصوصية|الأسئلة|المدونة)\b/,
    ];

    const hasmeaningfulPatterns = meaningfulPatterns.some((pattern) =>
      pattern.test(content),
    );

    return hasmeaningfulPatterns;
  }

  private calculateTechnicalNoiseRatio(content: string): number {
    const words = content.split(/\s+/);
    const technicalWords = words.filter((word) =>
      /^(class|div|span|button|input|form|nav|header|footer|lucide|icon|container|flex|grid|text|bg|border|hover|transition|md|lg|xl|sm|px|py|mt|mb|ml|mr|w|h)[\w-]*$/i.test(
        word,
      ),
    );

    return words.length > 0 ? technicalWords.length / words.length : 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isVercelEnvironment(): boolean {
    return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  }

  // Link extraction for crawling depth
  extractLinksFromHtml(
    html: string,
    baseUrl: string,
    maxLinks: number = 20,
  ): string[] {
    try {
      const $ = load(html);
      const origin = new URL(baseUrl).origin;
      const links = new Set<string>();

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        try {
          const fullUrl = new URL(href, baseUrl).toString();
          const parsedUrl = new URL(fullUrl);

          if (parsedUrl.origin !== origin) return;

          if (
            parsedUrl.pathname.match(
              /^\/(ar|en)\/(auth|login|signup|signin|register|dashboard|account|forgot|reset|verify)/i,
            )
          )
            return;

          if (
            fullUrl.match(
              /\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|mp3|css|js|woff|woff2|ico|xml|json)(\?|$)/i,
            )
          )
            return;

          if (
            fullUrl.match(
              /\/(login|register|logout|signup|signin|auth|admin|api|cdn|assets|static|wp-admin|wp-content|_next|dashboard|forgot|reset-password|verify|account)\//i,
            )
          )
            return;

          if (href.match(/^(mailto:|tel:|javascript:|#|ftp:|file:)/)) return;
          if (parsedUrl.searchParams.toString().length > 200) return;

          const canonicalUrl = canonicalizeUrl(fullUrl);
          links.add(canonicalUrl);

          if (links.size >= maxLinks) return false;
        } catch {
          // Invalid URL, skip
        }
      });

      return Array.from(links).slice(0, maxLinks);
    } catch (error) {
      console.warn("[Links] Extraction failed:", error);
      return [];
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log("[Cleanup] Browser closed");
      } catch {
        console.warn("[Cleanup] Error closing browser");
      } finally {
        this.browser = null;
      }
    }
  }
}

// Helper functions
function getMaxLinksForDepth(depth: Depth): number {
  return MAX_LINKS_PER_DEPTH[depth] || 5;
}

async function getExistingUrls(
  kbId: string,
  urls: string[],
): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  try {
    const canonicalUrls = urls.map(canonicalizeUrl);
    const existingDocs = await prisma.document.findMany({
      where: { kbId, sourceUrl: { in: canonicalUrls } },
      select: { sourceUrl: true },
    });

    return new Set(existingDocs.map((doc) => doc.sourceUrl as string));
  } catch (error) {
    console.error("Failed to check existing URLs:", error);
    return new Set();
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
    const canonicalUrl = canonicalizeUrl(url);

    const existing = await prisma.document.findFirst({
      where: { kbId, sourceUrl: canonicalUrl },
      select: { id: true, content: true, filename: true },
    });

    if (existing) {
      const existingWordCount = existing.content
        ? existing.content.split(/\s+/).length
        : 0;
      const newWordCount = wordCount || content.split(/\s+/).length;

      if (existingWordCount < newWordCount * 0.6) {
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
        console.log(`Updated existing document: ${canonicalUrl}`);
      }
      return existing;
    }

    try {
      const doc = await prisma.document.create({
        data: {
          kbId,
          sourceUrl: canonicalUrl,
          filename: title || "Untitled",
          content,
          mimeType: "text/html",
          metadata: {
            wordCount: wordCount || content.split(/\s+/).length,
            crawledAt: new Date().toISOString(),
            originalUrl: url !== canonicalUrl ? url : undefined,
          },
        },
      });

      console.log(
        `Created new document: ${canonicalUrl} (${wordCount || "unknown"} words)`,
      );
      return doc;
    } catch (err) {
      if (
        (err as PrismaClientKnownRequestError)?.code === "P2002" ||
        (err as PrismaClientKnownRequestError)?.message?.includes(
          "duplicate key",
        )
      ) {
        const doc = await prisma.document.findFirst({
          where: { kbId, sourceUrl: canonicalUrl },
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

async function handler(req: Request): Promise<Response> {
  const payload = await req.json();
  const { kbId, webUrl, userId, depth = 0 }: RequestBody = payload;

  if (!kbId || !webUrl || !userId) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required parameters" }),
      { status: 400 },
    );
  }

  const url = new URL(webUrl);
  const isLikelyRSCSite =
    url.hostname.includes("vercel.app") ||
    url.hostname.includes("netlify.app") ||
    url.hostname.endsWith(".cx") ||
    webUrl.includes("/_next/") ||
    (await isKnownRSCSite(url.hostname));

  const crawlerConfig = {
    ...CRAWLER_CONFIG,
    enablePuppeteer: isLikelyRSCSite,
    timeout: isLikelyRSCSite ? 60000 : 45000,
  };

  const crawler = new RobustWebCrawler(crawlerConfig);

  try {
    console.log(
      `[Handler] Processing ${webUrl} (RSC: ${isLikelyRSCSite}, depth: ${depth})`,
    );
    const extracted = await crawler.crawl(webUrl);

    if (!extracted || !isValidExtraction(extracted, webUrl)) {
      console.warn(`[Handler] No meaningful content from: ${webUrl}`);
      console.warn(`[Handler] Result:`, {
        title: extracted?.title,
        wordCount: extracted?.wordCount,
        method: extracted?.method,
        contentPreview: extracted?.content?.substring(0, 150),
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "no_content",
          details: "Insufficient content extracted",
          extraction: {
            title: extracted?.title,
            wordCount: extracted?.wordCount,
            method: extracted?.method,
          },
          debug: { isRSCSite: isLikelyRSCSite, url: webUrl },
        }),
        { status: 200 },
      );
    }

    return await processSuccessfulExtraction(
      extracted,
      kbId,
      webUrl,
      userId,
      depth,
      crawler,
      extracted.html,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Handler] Error for ${webUrl}:`, errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        details: errorMessage,
        url: webUrl,
      }),
      { status: 500 },
    );
  } finally {
    await crawler.cleanup();
  }
}

function isValidExtraction(extracted: ExtractionResult, url: string): boolean {
  if (!extracted || extracted.wordCount < 15) return false;

  // Special handling for Arabic content
  if (url.includes("/ar/") || url.includes("/arabic/")) {
    const hasArabic = /[\u0600-\u06FF]/.test(extracted.content);
    const hasReasonableContent = extracted.content.length > 100;
    const notJustTechnical = !/^[\d\s\[\]"$,:{}\\><\/_]+$/.test(
      extracted.content.substring(0, 200),
    );

    console.log(
      `[Validation] Arabic - hasArabic: ${hasArabic}, reasonable: ${hasReasonableContent}, notTechnical: ${notJustTechnical}`,
    );

    return hasArabic && hasReasonableContent && notJustTechnical;
  }

  // General validation
  const hasEnoughWords = extracted.wordCount >= 20;
  const hasEnoughContent = extracted.content.length > 150;
  const notTechnicalNoise = !/^[\d\s\[\]"$,:{}\\><\/_]+$/.test(
    extracted.content.substring(0, 200),
  );

  // Check for meaningful patterns
  const hasMeaningfulContent =
    /[.!?؟،]/.test(extracted.content) ||
    /\b(the|and|or|in|on|at|to|for|of|with|by|about|contact|home|services|products|pricing|terms|privacy|faq|blog)\b/i.test(
      extracted.content,
    ) ||
    /\b(في|من|إلى|على|مع|عن|هذا|هذه|التي|الذي|حول|اتصل|الرئيسية|الخدمات|المنتجات|الأسعار|الشروط|الخصوصية|الأسئلة|المدونة)\b/.test(
      extracted.content,
    );

  console.log(
    `[Validation] General - words: ${extracted.wordCount}, content: ${extracted.content.length}, notNoise: ${notTechnicalNoise}, meaningful: ${hasMeaningfulContent}`,
  );

  return (
    hasEnoughWords &&
    hasEnoughContent &&
    notTechnicalNoise &&
    hasMeaningfulContent
  );
}

async function processSuccessfulExtraction(
  extracted: ExtractionResult,
  kbId: string,
  webUrl: string,
  userId: string,
  depth: Depth,
  crawler: RobustWebCrawler,
  html?: string,
) {
  const { title, content, wordCount, extractionMethod } = extracted;

  const savedDocument = await saveDocumentIfNew(
    kbId,
    webUrl,
    title,
    content,
    wordCount,
  );

  // Queue embedding processing
  try {
    if (savedDocument?.id) {
      await qstash.publishJSON({
        url: `${process.env.BASE_URL}/api/process-embeddings`,
        body: { kbId, documentId: savedDocument.id, userId },
        delay: 5,
      });
    }
  } catch (error) {
    console.error("[Handler] Failed to queue embedding processing:", error);
  }

  let enqueuedChildren = 0;
  let skippedExisting = 0;
  const failedLinks: string[] = [];

  // Discover and crawl additional links if depth > 0
  if (depth > 0 && html) {
    try {
      const discoveredLinks = crawler.extractLinksFromHtml(html, webUrl);
      console.log(
        `[Handler] Discovered ${discoveredLinks.length} links from ${webUrl}`,
      );

      const maxLinksForDepth = getMaxLinksForDepth(depth);
      const linksToProcess = discoveredLinks.slice(0, maxLinksForDepth);

      // Batch check for existing URLs
      const existingUrls = await getExistingUrls(kbId, linksToProcess);
      const newLinks = linksToProcess.filter(
        (link) => !existingUrls.has(canonicalizeUrl(link)),
      );

      skippedExisting = linksToProcess.length - newLinks.length;
      console.log(
        `[Handler] Processing ${newLinks.length} new links, skipping ${skippedExisting} existing`,
      );

      // Process new links in batches
      const batchSize = 5;
      for (let i = 0; i < newLinks.length; i += batchSize) {
        const batch = newLinks.slice(i, i + batchSize);

        const batchPromises = batch.map(async (link, batchIndex) => {
          const overallIndex = i + batchIndex;
          try {
            await qstash.publishJSON({
              url: `${process.env.BASE_URL}/api/process-crawl`,
              body: {
                kbId,
                webUrl: link,
                userId,
                depth: (depth - 1) as Depth,
              },
              delay: Math.floor(overallIndex / 3) * 10 + 30,
            });
            enqueuedChildren++;
          } catch (error) {
            console.error(
              `[Handler] Failed to enqueue child link ${link}:`,
              error,
            );
            failedLinks.push(link);
          }
        });

        await Promise.allSettled(batchPromises);

        if (i + batchSize < newLinks.length) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      console.log(`[Handler] Link processing summary for ${webUrl}:`);
      console.log(`  - Discovered: ${discoveredLinks.length}`);
      console.log(`  - Processed: ${linksToProcess.length}`);
      console.log(`  - Enqueued: ${enqueuedChildren}`);
      console.log(`  - Skipped (existing): ${skippedExisting}`);
      if (failedLinks.length > 0) {
        console.log(`  - Failed: ${failedLinks.length}`);
      }
    } catch (error) {
      console.error("[Handler] Failed to process discovered links:", error);
    }
  }

  console.log(
    `[Handler] Successfully processed ${webUrl} using ${extractionMethod}:\n` +
      `  - Content: ${wordCount} words\n` +
      `  - Title: "${title}"\n` +
      `  - Method: ${extractionMethod}\n` +
      `  - Child pages enqueued: ${enqueuedChildren}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      document: {
        id: savedDocument?.id,
        url: webUrl,
        title,
        wordCount,
        contentLength: content.length,
        extractionMethod: extractionMethod || "unknown",
      },
      enqueuedChildren,
      skippedExisting,
      failedLinks: failedLinks.length,
      depth,
    }),
    { status: 200 },
  );
}

// Simple caching for known RSC sites
async function isKnownRSCSite(hostname: string): Promise<boolean> {
  const knownRSCSites = ["aoun.cx", "www.aoun.cx", "vercel.app", "netlify.app"];
  return knownRSCSites.some((site) => hostname.includes(site));
}

// Export with QStash signature verification for Next.js 15 App Router
export const POST = verifySignatureAppRouter(handler);
