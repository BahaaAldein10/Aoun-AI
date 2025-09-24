/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/process-crawl/route.ts
import { prisma } from "@/lib/prisma";
import { Readability } from "@mozilla/readability";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import * as cheerio from "cheerio";
import { load } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { JSDOM } from "jsdom";
import pLimit from "p-limit";
import type { Browser, Page } from "puppeteer";
import robotsParser from "robots-parser";

export const runtime = "nodejs";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

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
type CheerioRoot = ReturnType<typeof load>;

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
  depth?: number;
}

// Configuration
const CRAWLER_CONFIG: CrawlerConfig = {
  timeout: 45000, // Increased for RSC sites
  maxRetries: 5, // More retries for RSC
  minWordCount: 15, // Lower threshold for Arabic content
  puppeteerTimeout: 20000,
  waitForDynamic: 5000, // Longer wait for RSC hydration
  enablePuppeteer: true, // Enable for stubborn RSC sites
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

function canonicalizeUrl(raw: string): string {
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
    return robotsParser("", ""); // permissive fallback
  }
}

class EnhancedWebCrawler {
  private config: CrawlerConfig;
  private browser: Browser | null = null;

  constructor(config: CrawlerConfig = CRAWLER_CONFIG) {
    this.config = config;
  }

  async crawl(url: string): Promise<ExtractionResult & { html?: string }> {
    console.log(`Starting enhanced crawl for: ${url}`);

    // Check robots.txt and crawl-delay (keep existing)
    const origin = new URL(url).origin;
    const robots = await fetchRobotsForOrigin(origin);
    if (!robots.isAllowed(url, USER_AGENTS.bot)) {
      throw new Error("Blocked by robots.txt");
    }

    // Respect crawl-delay (keep existing)
    const crawlDelay = robots.getCrawlDelay(USER_AGENTS.bot) || 0;
    if (crawlDelay > 0) {
      await this.delay(Math.min(crawlDelay * 1000, 10000));
    }

    // Rate limiting (keep existing)
    const { limit, lastRequest } = getRateLimiter(origin);
    const timeSinceLastRequest = Date.now() - lastRequest;
    const minInterval = 1000;

    if (timeSinceLastRequest < minInterval) {
      await this.delay(minInterval - timeSinceLastRequest);
    }

    // Strategy prioritization based on site characteristics
    const strategies: CrawlStrategy[] = [];

    // For modern Next.js sites, try static with enhanced headers first
    strategies.push({ name: "static", fn: () => this.crawlStatic(url) });
    strategies.push({
      name: "readability",
      fn: () => this.crawlWithReadability(url),
    });
    strategies.push({ name: "semantic", fn: () => this.crawlSemantic(url) });

    // Add dynamic strategy if available (for fallback)
    if (this.config.enablePuppeteer) {
      strategies.push({ name: "dynamic", fn: () => this.crawlDynamic(url) });
    }

    // Try strategies in order
    for (const strategy of strategies) {
      try {
        console.log(`Trying ${strategy.name} strategy...`);
        const { result, html } = await this.withRetry(() => strategy.fn());

        if (this.isValidResult(result)) {
          console.log(`✓ ${strategy.name} extraction successful`);
          getRateLimiter(origin).lastRequest = Date.now();
          return { ...result, extractionMethod: strategy.name, html };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(`${strategy.name} strategy failed:`, errorMessage);
        // Continue to next strategy instead of aborting
      }
    }

    // Final fallback
    const fallback = await this.crawlFallback(url);
    getRateLimiter(origin).lastRequest = Date.now();
    return { ...fallback, extractionMethod: "fallback" };
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
          await this.delay(1000 * (i + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  private async crawlDynamic(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    // Defensive: import puppeteer lazily and handle absence gracefully
    let page: Page | null = null;

    try {
      let puppeteerModule: any;
      try {
        puppeteerModule = await import("puppeteer");
      } catch (impErr) {
        console.warn("Puppeteer module not available:", impErr);
        // Skip dynamic strategy when puppeteer isn't installed in the environment
        return { result: null };
      }

      const puppeteer = puppeteerModule.default || puppeteerModule;

      if (!this.browser) {
        try {
          // Allow overriding executable path via env
          const launchOptions: any = {
            headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-web-security",
              "--disable-blink-features=AutomationControlled",
            ],
          };

          if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath =
              process.env.PUPPETEER_EXECUTABLE_PATH;
          }

          this.browser = await puppeteer.launch(launchOptions);
        } catch (launchErr) {
          console.warn(
            "Puppeteer launch failed (missing Chrome or bad config):",
            launchErr,
          );
          // Return null result so caller tries other strategies/fallbacks
          return { result: null };
        }
      }

      page = await (this.browser as Browser).newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(USER_AGENTS.desktop);

      // Block unnecessary resources
      // Note: some puppeteer versions require request interception to be enabled before 'request' listeners
      try {
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const resourceType = req.resourceType();
          if (["image", "font", "media"].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });
      } catch (e) {
        // If request interception isn't supported, continue without blocking
        console.warn(
          "Request interception not available, continuing without it:",
          e,
        );
      }

      // Navigate and wait for content
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.config.puppeteerTimeout,
      });

      // Wait for RSC hydration / visible text
      try {
        await page.waitForFunction(
          () => (document.body?.innerText || "").length > 100,
          {
            timeout: 10000,
          },
        );
      } catch {
        // ignore — we'll still try to extract
      }

      // Wait for dynamic content
      await this.delay(this.config.waitForDynamic);

      // Try to trigger any lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await this.delay(1000);

      // Get the rendered HTML
      const html = await page.content();
      const title = await page.title();

      // Process with multiple strategies
      const readabilityResult = this.processWithReadability(html, url);
      if (this.isValidResult(readabilityResult)) {
        return {
          result: {
            ...readabilityResult,
            title: title || readabilityResult.title,
          },
          html,
        };
      }

      const semanticResult = this.processSemanticHTML(html, url);
      if (this.isValidResult(semanticResult)) {
        return {
          result: { ...semanticResult, title: title || semanticResult.title },
          html,
        };
      }

      // Fallback to full page text
      const bodyText = await page.evaluate(() => {
        const elementsToRemove = document.querySelectorAll(
          "script, style, nav, header, footer, aside",
        );
        elementsToRemove.forEach((el) => el.remove());
        return document.body.innerText || document.body.textContent || "";
      });

      return {
        result: this.createResult(title, bodyText, "dynamic-fallback"),
        html,
      };
    } finally {
      if (page) await page.close();
    }
  }

  private async crawlStatic(
    url: string,
  ): Promise<{ result: ExtractionResult | null; html?: string }> {
    const html: string = await this.fetchHTML(url, USER_AGENTS.desktop);

    // Now that we have proper HTML, process it normally
    if (this.detectSPA(html)) {
      throw new Error("SPA detected, skipping static strategy");
    }

    let result =
      this.processSemanticHTML(html, url) ||
      this.processWithReadability(html, url);

    // If we still have RSC payload issues after decompression
    if (!this.isGoodExtraction(result, url)) {
      const flightText = this.extractFromNextFlight(html);
      if (flightText) {
        const cleaned = this.cleanText(flightText);
        const wc = cleaned.split(/\s+/).filter(Boolean).length;
        if (wc >= this.config.minWordCount) {
          const title =
            this.extractTitleFromFlight(html) || this.extractTitleFromUrl(url);
          result = this.createResult(title, cleaned, "flight-json");
        }
      }
    }

    if (!this.isGoodExtraction(result, url)) {
      result = this.processContentDensity(html, url);
    }

    return { result, html };
  }

  async testCompressionFix(url: string): Promise<void> {
    console.log(`\n=== Testing compression fix for ${url} ===`);

    try {
      const html = await this.fetchHTML(url, USER_AGENTS.desktop);
      console.log(`✓ Success! Got ${html.length} chars of HTML`);
      console.log(`First 200 chars: ${html.substring(0, 200)}...`);

      // Test if it looks like HTML
      if (html.includes("<!DOCTYPE html>") || html.includes("<html")) {
        console.log("✓ Valid HTML detected");
      } else if (html.includes('"$Sreact.fragment"')) {
        console.log("⚠ Got RSC payload, but at least it's readable text");
      } else {
        console.log("⚠ Unknown content type");
      }
    } catch (error) {
      console.error(`✗ Test failed: ${error}`);
    }
  }

  // Extract better titles from Next.js Flight payloads
  private extractTitleFromFlight(html: string): string | null {
    try {
      // Method 1: Look for title in metadata objects
      const titleMatches = html.match(/"title"[^}]*?"children":\s*"([^"]+)"/);
      if (titleMatches && titleMatches[1] && titleMatches[1].length > 3) {
        return titleMatches[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }

      // Method 2: Look for page titles with common patterns
      const pageTitlePatterns = [
        /"children":\s*"([^\"]*(?:FAQ|Contact|About|Home|Blog|Pricing|Terms|Privacy)[^\"]*?)"/i,
        /"children":\s*"([^\"]*(?:الأسئلة|تواصل|حول|الرئيسية|المدونة|الأسعار|شروط|الخصوصية)[^\"]*?)"/i, // Arabic
      ];

      for (const pattern of pageTitlePatterns) {
        const matches = html.match(pattern);
        if (matches && matches[1] && matches[1].length > 3) {
          return matches[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
      }

      // Method 3: Look for h1 content
      const h1Patterns = [
        /"h1"[^}]*"children":\s*"([^"]+)"/,
        /\["h1"[^}]*"children":\s*"([^"]+)"/,
      ];

      for (const pattern of h1Patterns) {
        const matches = html.match(pattern);
        if (matches && matches[1] && matches[1].length > 3) {
          return matches[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
      }

      // Method 4: Look for any meaningful heading text
      const headingPatterns = [/"children":\s*"([^\"]{10,100})"/g];

      for (const pattern of headingPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const candidate = match[1]
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");

          if (
            candidate.length >= 10 &&
            candidate.length <= 100 &&
            /^[A-Z\u0600-\u06FF]/.test(candidate) &&
            !candidate.includes("className") &&
            !candidate.includes("onClick") &&
            !candidate.includes("href") &&
            !candidate.includes("src") &&
            !/^[\d\s\-_]+$/.test(candidate)
          ) {
            return candidate;
          }
        }
      }

      return null;
    } catch (error) {
      console.warn("Error extracting title from flight payload:", error);
      return null;
    }
  }

  // Also need the extractTitleFromUrl helper method I referenced:
  private extractTitleFromUrl(url: string): string {
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

        const title =
          titleMap[lastPart.toLowerCase()] ||
          lastPart.charAt(0).toUpperCase() +
            lastPart.slice(1).replace(/[-_]/g, " ");

        return title;
      }

      const hostname = urlObj.hostname.replace(/^www\./, "");
      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch {
      return "Extracted Content";
    }
  }

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

  private async crawlFallback(url: string): Promise<ExtractionResult> {
    try {
      const html = await this.fetchHTML(url, USER_AGENTS.desktop);
      return this.processFallback(html, url);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        title: "Extraction Failed",
        content: `Unable to extract content: ${errorMessage}`,
        wordCount: 0,
        method: "failed",
      };
    }
  }

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
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...extraHeaders,
      };

      console.log(
        `[fetchHTML] Fetching ${url} with UA: ${userAgent.substring(0, 50)}...`,
      );

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
        `[fetchHTML] ${url} status=${response.status} content-type=${response.headers.get("content-type")} length=${text.length} compressed=${response.headers.get("content-encoding") || "none"}`,
      );

      if (this.isValidHTMLContent(text)) {
        return text;
      } else {
        console.warn(
          `[fetchHTML] Got non-HTML content from ${url}, first 100 chars:`,
          text.substring(0, 100),
        );
        throw new Error("Response is not valid HTML content");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isValidHTMLContent(content: string): boolean {
    const hasHTMLTags = /<[a-z][\s\S]*>/i.test(content);
    const hasReadableText = /[a-zA-Z\u0600-\u06FF]{10,}/.test(content);
    const isNotBinary = !/[\x00-\x08\x0E-\x1F\x7F-\xFF]{5,}/.test(
      content.substring(0, 200),
    );

    return (hasHTMLTags || hasReadableText) && isNotBinary;
  }

  private detectSPA(html: string): boolean {
    const $ = load(html);

    const indicators = [
      "react",
      "vue",
      "angular",
      "app-root",
      "ng-app",
      "data-reactroot",
      "__NEXT_DATA__",
      "__NUXT__",
    ];

    const bodyText = $("body").text().toLowerCase();
    const hasMinimalContent = bodyText.replace(/\s+/g, " ").trim().length < 200;

    const hasFrameworkIndicators = indicators.some((indicator) =>
      html.toLowerCase().includes(indicator),
    );

    const hasLargeScripts = $("script").length > 5;

    return hasMinimalContent && (hasFrameworkIndicators || hasLargeScripts);
  }

  private processWithReadability(
    html: string,
    _url: string,
  ): ExtractionResult | null {
    try {
      const dom = new JSDOM(html, { url: _url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        const cleanContent = this.cleanText(article.textContent);
        return this.createResult(
          article.title || "Untitled",
          cleanContent,
          "readability",
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn("Readability processing failed:", errorMessage);
    }
    return null;
  }

  private processSemanticHTML(
    html: string,
    _url: string,
  ): ExtractionResult | null {
    try {
      const $ = load(html);

      // Remove noise elements
      this.removeNoiseElements($);

      // Try semantic selectors in priority order
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
        const element = $(selector).first() as cheerio.Cheerio<AnyNode>;
        if (element.length > 0) {
          const text = this.extractTextFromElement(element);
          if (text.length > 200) {
            const title = this.extractTitle($);
            return this.createResult(title, text, "semantic");
          }
        }
      }

      // Try content density as fallback
      return this.processContentDensity(html, _url);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn("Semantic processing failed:", errorMessage);
    }
    return null;
  }

  private processContentDensity(
    html: string,
    _url: string,
  ): ExtractionResult | null {
    try {
      const $ = load(html);
      this.removeNoiseElements($);

      let bestElement: cheerio.Cheerio<AnyNode> | null = null;
      let bestScore = 0;

      $("div, section, article, main, .content").each((_, element) => {
        const $el = $(element) as cheerio.Cheerio<AnyNode>;
        const score = this.calculateAdvancedContentScore($el);

        if (score > bestScore && score > 100) {
          bestScore = score;
          bestElement = $el;
        }
      });

      if (bestElement) {
        const beCheerio = bestElement as cheerio.Cheerio<AnyNode>;
        const node = beCheerio.get(0) as AnyNode | undefined;

        if (node && (node as AnyNode).type === "tag") {
          const be = beCheerio as cheerio.Cheerio<Element>;
          const text = this.extractTextFromElement(be);
          const title =
            this.extractTitle($) || be.find("h1, h2, h3").first().text().trim();

          return this.createResult(title, text, "density");
        } else {
          const text = this.extractTextFromElement(beCheerio);
          const title = this.extractTitle($);
          return this.createResult(title, text, "density");
        }
      }
    } catch (error) {
      console.warn("Content density processing failed:", error);
    }
    return null;
  }

  private processFallback(html: string, _url: string): ExtractionResult {
    const $ = load(html);
    this.removeNoiseElements($);

    const bodyText = $("body").text();
    const cleanText = this.cleanText(bodyText);
    const title = this.extractTitle($);

    return this.createResult(
      title,
      cleanText.length > 100 ? cleanText : "No meaningful content found",
      "fallback",
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

    $("div, section").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const links = $el.find("a").length;

      if (text.length < 100 && links > 3) {
        $el.remove();
      }
    });
  }

  private extractTextFromElement($element: cheerio.Cheerio<AnyNode>): string {
    // Convert to readable text with basic formatting
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

  private calculateAdvancedContentScore(
    $element: cheerio.Cheerio<AnyNode>,
  ): number {
    const text = $element.text();
    const textLength = text.length;
    const linkText = $element.find("a").text();
    const linkLength = linkText.length;
    const paragraphs = $element.find("p").length;
    const headings = $element.find("h1, h2, h3, h4, h5, h6").length;
    const lists = $element.find("ul, ol").length;
    const childElements = $element.children().length;

    if (textLength < 100) return 0;

    const contentRatio =
      textLength > 0 ? (textLength - linkLength) / textLength : 0;
    const paragraphBonus = Math.min(paragraphs * 15, 150);
    const headingBonus = Math.min(headings * 20, 100);
    const listBonus = Math.min(lists * 10, 50);
    const complexityPenalty = childElements > 30 ? -100 : 0;
    const linkDensityPenalty = linkLength > textLength * 0.3 ? -50 : 0;

    const sentenceCount = text
      .split(/[.!?]+/)
      .filter((s: string) => s.trim().length > 10).length;
    const avgSentenceLength =
      sentenceCount > 0 ? textLength / sentenceCount : 0;
    const sentenceQualityBonus =
      avgSentenceLength > 50 && avgSentenceLength < 200 ? 50 : 0;

    const lengthScore =
      textLength < 2000 ? textLength : 2000 + Math.log(textLength - 2000) * 100;

    return (
      lengthScore * contentRatio +
      paragraphBonus +
      headingBonus +
      listBonus +
      sentenceQualityBonus +
      complexityPenalty +
      linkDensityPenalty
    );
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
    return !!(
      result &&
      result.content &&
      result.wordCount >= this.config.minWordCount &&
      result.content !== "No meaningful content found"
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  extractLinksFromHtml(html: string, baseUrl: string): string[] {
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
            fullUrl.match(
              /\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|mp3|css|js|woff|woff2|ico|xml|json)(\?|$)/i,
            )
          )
            return;

          if (
            fullUrl.match(
              /\/(login|register|logout|admin|api|cdn|assets|static|wp-admin|wp-content)\//i,
            )
          )
            return;

          if (href.match(/^(mailto:|tel:|javascript:|#|ftp:|file:)/)) return;

          if (parsedUrl.searchParams.toString().length > 200) return;

          const canonicalUrl = canonicalizeUrl(fullUrl);
          links.add(canonicalUrl);
        } catch {
          // Invalid URL, skip
        }
      });

      return Array.from(links);
    } catch (error) {
      console.warn("Link extraction failed:", error);
      return [];
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Enhanced RSC/Flight payload extractor
  private extractFromNextFlight(html: string): string | null {
    try {
      const payloadPatterns = [
        /self\.__next_f\.push\(\s*\[([\s\S]*?)\]\s*\)/g,
        /\$\S+:"([^"]*(?:\\.[^\"]*)*)"/g,
        /"children":\s*"([^"]*(?:\\.[^\"]*)*)"/g,
      ];

      const texts: string[] = [];
      let totalPayloads = 0;

      for (const pattern of payloadPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) {
          totalPayloads++;
          let raw = match[1];
          if (!raw) continue;

          raw = raw
            .replace(/\\n/g, " ")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .replace(/\\t/g, " ")
            .replace(/\\r/g, "");

          if (raw.length < 10) continue;
          if (this.isTechnicalNoise(raw)) continue;

          if (this.isMeaningfulContent(raw)) {
            texts.push(raw.trim());
          }
        }
      }

      console.log(
        `[flight] totalPayloads=${totalPayloads} extractedTexts=${texts.length}`,
      );

      if (texts.length === 0) return null;

      let joined = texts.join(" ").replace(/\s+/g, " ").trim();
      joined = this.cleanFlightContent(joined);

      return joined.length > 50 ? joined : null;
    } catch (err) {
      console.warn("extractFromNextFlight failed:", err);
      return null;
    }
  }

  private isTechnicalNoise(text: string): boolean {
    const noisePatterns = [
      /^[\d\s\-_:,\[\]{}()]+$/,
      /^[A-Z][a-zA-Z]*$/,
      /static\/chunks/,
      /webpack/i,
      /\/_next\//,
      /^[a-f0-9]{6,}$/,
      /className|onClick|href|src/i,
      /\$[A-Z]/,
      /^I\[|^HL\[/,
      /application\/vnd\.ant/,
      /crossOrigin|type.*font/i,
    ];

    return noisePatterns.some((pattern) => pattern.test(text));
  }

  private isMeaningfulContent(text: string): boolean {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);

    if (!hasArabic && !hasEnglish) return false;
    if (text.length < 10 || text.length > 500) return false;

    const words = text.split(/\s+/).filter((w) => w.length > 2);
    if (words.length < 2) return false;

    const meaningfulPatterns = [
      /[.!?؟،]/,
      /\b(the|and|or|in|on|at|to|for|of|with|by)\b/i,
      /\b(في|من|إلى|على|مع|عن|هذا|هذه|التي|الذي)\b/,
      /\b(price|service|contact|about|help|support|terms|privacy)/i,
      /\b(سعر|خدمة|تواصل|حول|مساعدة|دعم|شروط|خصوصية)/,
    ];

    return meaningfulPatterns.some((pattern) => pattern.test(text));
  }

  private cleanFlightContent(content: string): string {
    return content
      .replace(/\$L\w+/g, "")
      .replace(/static\/chunks\/[\w\-\.\/]+/g, "")
      .replace(/\b[a-f0-9]{8,}\b/g, "")
      .replace(/webpack\w*/gi, "")
      .replace(/crossOrigin|font\/woff2?/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private detectRSC(html: string): boolean {
    const rscIndicators = [
      "self.__next_f.push",
      '"$Sreact.fragment"',
      "static/chunks/app/",
      "parallelRouterKey",
      /I\[\d+,\[/,
      /\$S[a-z]/,
      /"children":\s*"\$/,
      /app\/layout-[a-f0-9]+\.js/,
      /static\/chunks\/app\//,
      /"type":\s*"font\/woff2?"/,
    ];

    const rscCount = rscIndicators.filter((indicator) =>
      typeof indicator === "string"
        ? html.includes(indicator)
        : indicator.test(html),
    ).length;

    const hasMinimalHTML =
      html.length > 10000 &&
      !html.includes("<main") &&
      !html.includes("<article") &&
      html.includes("static/chunks/");

    return rscCount >= 2 || hasMinimalHTML;
  }

  private async fetchHTMLWithRetry(
    url: string,
    userAgent: string,
    extraHeaders: Record<string, string> = {},
    maxRetries: number = 3,
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const html = await this.fetchHTML(url, userAgent, extraHeaders);

        if (!this.detectRSC(html)) {
          return html;
        }

        if (attempt < maxRetries) {
          console.log(
            `Attempt ${attempt}: Got RSC payload, retrying in ${attempt * 1000}ms...`,
          );
          await this.delay(attempt * 1000);
        }
      } catch (error) {
        if (attempt === maxRetries) throw error;
        console.log(`Attempt ${attempt} failed: ${error}, retrying...`);
        await this.delay(attempt * 500);
      }
    }

    console.log(`Final attempt with cache-busting headers...`);
    return this.fetchHTML(url, userAgent, {
      ...extraHeaders,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-Requested-With": "XMLHttpRequest",
    });
  }

  private async fetchHTMLWithEnhancedHeaders(
    url: string,
    attempt: number = 1,
  ): Promise<string> {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    ];

    const headers = {
      "User-Agent": userAgents[attempt % userAgents.length],
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": url.includes("/ar/") ? "ar,en;q=0.9" : "en,ar;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Ch-Ua":
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isGoodExtraction(
    result: ExtractionResult | null,
    url: string,
  ): boolean {
    if (!result || !this.isValidResult(result)) return false;

    const content = result.content.toLowerCase();

    const technicalTerms = [
      "component",
      "props",
      "children",
      "classname",
      "onclick",
      "href",
      "src",
    ];
    const technicalCount = technicalTerms.filter((term) =>
      content.includes(term),
    ).length;
    const technicalRatio = technicalCount / result.wordCount;

    if (technicalRatio > 0.1) return false;

    if (
      result.title.includes("Flight payload") ||
      result.title.includes("Next.js")
    )
      return false;

    return true;
  }
}

// Save document helper function
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

      if (existingWordCount < newWordCount * 0.5) {
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

// Next.js 15 App Router handler with QStash signature verification
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
    url.hostname.includes(".cx") ||
    url.hostname.includes("aoun.cx") ||
    webUrl.includes("/_next/") ||
    (await isKnownRSCSite(url.hostname));

  const crawlerConfig = {
    ...CRAWLER_CONFIG,
    enablePuppeteer: isLikelyRSCSite,
    maxRetries: isLikelyRSCSite ? 5 : 3,
    timeout: isLikelyRSCSite ? 60000 : 30000,
  };

  const crawler = new EnhancedWebCrawler(crawlerConfig);

  try {
    const extracted = await crawler.crawl(webUrl);

    if (!extracted || !isValidExtraction(extracted, webUrl)) {
      console.warn("No meaningful content extracted from:", webUrl);

      if (isLikelyRSCSite && !crawlerConfig.enablePuppeteer) {
        console.log("Retrying with Puppeteer for RSC site...");
        const puppeteerCrawler = new EnhancedWebCrawler({
          ...crawlerConfig,
          enablePuppeteer: true,
        });

        const retryResult = await puppeteerCrawler.crawl(webUrl);
        if (retryResult && isValidExtraction(retryResult, webUrl)) {
          return processSuccessfulExtraction(
            retryResult,
            kbId,
            webUrl,
            userId,
            depth,
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "no_content",
          details: "Insufficient content extracted",
          extraction: extracted,
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
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Handler error:", errorMessage);

    if (errorMessage.includes("RSC") || errorMessage.includes("payload")) {
      await markAsRSCSite(url.hostname);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        details: errorMessage,
      }),
      { status: 500 },
    );
  } finally {
    await crawler.cleanup();
  }
}

function isValidExtraction(extracted: ExtractionResult, url: string): boolean {
  if (!extracted || extracted.wordCount < 10) return false;

  if (url.includes("/ar/")) {
    const hasArabic = /[\u0600-\u06FF]/.test(extracted.content);
    const hasReasonableContent = extracted.content.length > 50;
    return hasArabic && hasReasonableContent;
  }

  return extracted.wordCount >= 15 && extracted.content.length > 100;
}

async function processSuccessfulExtraction(
  extracted: ExtractionResult,
  kbId: string,
  webUrl: string,
  userId: string,
  depth: number,
) {
  const { title, content, wordCount, extractionMethod } = extracted;

  const savedDocument = await saveDocumentIfNew(
    kbId,
    webUrl,
    title,
    content,
    wordCount,
  );

  try {
    if (savedDocument?.id) {
      await qstash.publishJSON({
        url: `${process.env.BASE_URL}/api/process-embeddings`,
        body: { kbId, documentId: savedDocument.id, userId },
        delay: 5,
      });
    }
  } catch (error) {
    console.error("Failed to queue embedding processing:", error);
  }

  console.log(
    `Successfully processed ${webUrl} using ${extractionMethod}:\n  - Content: ${wordCount} words\n  - Title: "${title}"\n  - Method: ${extractionMethod}`,
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
      enqueuedChildren: 0,
    }),
    { status: 200 },
  );
}

// Simple caching for known RSC sites (implement with your preferred storage)
async function isKnownRSCSite(hostname: string): Promise<boolean> {
  return ["aoun.cx", "www.aoun.cx"].includes(hostname);
}

async function markAsRSCSite(hostname: string): Promise<void> {
  console.log(`Marking ${hostname} as RSC site`);
}

// Export with QStash signature verification for Next.js 15 App Router
export const POST = verifySignatureAppRouter(handler);
