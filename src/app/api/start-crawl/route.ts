import { Client as QStashClient } from "@upstash/qstash";
import { XMLParser } from "fast-xml-parser";
import { NextResponse } from "next/server";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

interface SitemapEntry {
  loc?: string;
  lastmod?: string;
}

function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

async function fetchSitemap(origin: string): Promise<string[]> {
  const sitemapUrls = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemaps.xml",
    "/sitemap/sitemap.xml",
  ];

  for (const sitemapPath of sitemapUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

      const sitemapUrl = new URL(sitemapPath, origin).toString();
      console.log(`Trying sitemap: ${sitemapUrl}`);

      const sitemapRes = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "my-crawler/1.0",
          Accept: "application/xml, text/xml, */*",
        },
      });

      clearTimeout(timeoutId);

      if (!sitemapRes.ok) {
        console.log(`Sitemap ${sitemapUrl} returned ${sitemapRes.status}`);
        continue;
      }

      const xml = await sitemapRes.text();
      if (!xml.trim()) {
        console.log(`Empty sitemap: ${sitemapUrl}`);
        continue;
      }

      const parser = new XMLParser({ ignoreAttributes: false });
      const obj = parser.parse(xml);
      const urls: string[] = [];

      // Handle regular sitemap with URLs
      if (obj.urlset?.url) {
        const entries = Array.isArray(obj.urlset.url)
          ? obj.urlset.url
          : [obj.urlset.url];
        for (const entry of entries) {
          if (
            entry.loc &&
            typeof entry.loc === "string" &&
            validateUrl(entry.loc)
          ) {
            urls.push(entry.loc);
          }
        }
      }

      // Handle sitemap index (contains links to other sitemaps)
      if (obj.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(obj.sitemapindex.sitemap)
          ? obj.sitemapindex.sitemap
          : [obj.sitemapindex.sitemap];

        // For sitemap index, recursively fetch child sitemaps (limit to avoid infinite loops)
        const childSitemapPromises = sitemaps
          .slice(0, 10)
          .map(async (sitemapEntry: SitemapEntry) => {
            if (!sitemapEntry.loc || !validateUrl(sitemapEntry.loc)) return [];

            try {
              const childController = new AbortController();
              const childTimeoutId = setTimeout(
                () => childController.abort(),
                8000,
              );

              const childRes = await fetch(sitemapEntry.loc, {
                signal: childController.signal,
                headers: { "User-Agent": "my-crawler/1.0" },
              });

              clearTimeout(childTimeoutId);

              if (!childRes.ok) return [];

              const childXml = await childRes.text();
              const childObj = parser.parse(childXml);
              const childUrls: string[] = [];

              if (childObj.urlset?.url) {
                const childEntries = Array.isArray(childObj.urlset.url)
                  ? childObj.urlset.url
                  : [childObj.urlset.url];

                for (const childEntry of childEntries) {
                  if (childEntry.loc && validateUrl(childEntry.loc)) {
                    childUrls.push(childEntry.loc);
                  }
                }
              }

              return childUrls;
            } catch (error) {
              console.warn(
                `Failed to fetch child sitemap ${sitemapEntry.loc}:`,
                error,
              );
              return [];
            }
          });

        const childResults = await Promise.allSettled(childSitemapPromises);
        for (const result of childResults) {
          if (result.status === "fulfilled") {
            urls.push(...result.value);
          }
        }
      }

      if (urls.length > 0) {
        console.log(`Found sitemap at ${sitemapUrl} with ${urls.length} URLs`);
        return urls;
      }
    } catch (error) {
      console.log(`Error fetching sitemap ${sitemapPath}:`, error);
      continue;
    }
  }

  return []; // No sitemap found
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kbId, url, userId, maxDepth = 2 } = body;

    // Validation
    if (!kbId || !url || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: kbId, url, or userId" },
        { status: 400 },
      );
    }

    if (!validateUrl(url)) {
      return NextResponse.json(
        { error: "Invalid URL provided" },
        { status: 400 },
      );
    }

    if (maxDepth < 0 || maxDepth > 5) {
      return NextResponse.json(
        { error: "maxDepth must be between 0 and 5" },
        { status: 400 },
      );
    }

    const origin = new URL(url).origin;
    console.log(`Starting crawl for ${origin} with maxDepth ${maxDepth}`);

    let enqueuedUrls = 0;
    let discoveredUrls = 0;

    // 1) Try sitemap.xml for quick discovery
    try {
      const sitemapUrls = await fetchSitemap(origin);
      discoveredUrls = sitemapUrls.length;

      if (sitemapUrls.length > 0) {
        console.log(`Discovered ${sitemapUrls.length} URLs from sitemap`);

        // Filter URLs to same origin and limit to avoid overwhelming the queue
        const validUrls = sitemapUrls
          .filter((sitemapUrl) => {
            try {
              return new URL(sitemapUrl).origin === origin;
            } catch {
              return false;
            }
          })
          .slice(0, 100); // Limit to first 100 URLs

        // Enqueue each sitemap URL with staggered delays to avoid spikes
        const enqueuePromises = validUrls.map(async (loc, index) => {
          try {
            // enqueue crawl job
            await qstash.publishJSON({
              url: `${process.env.BASE_URL}/api/process-crawl`,
              body: {
                kbId,
                webUrl: loc,
                userId,
                depth: maxDepth,
              },
              delay: Math.floor(index / 10) * 2 + 15,
            });
            enqueuedUrls++;

            // also enqueue embedding job for the same url
            // note: embedding worker should be resilient and either accept webUrl or wait for document to be created
            // we add a larger delay to give the crawl worker time to save the document
            try {
              await qstash.publishJSON({
                url: `${process.env.BASE_URL}/api/process-embeddings`,
                body: {
                  kbId,
                  webUrl: loc,
                  userId,
                },
                // add an extra delay so processing-crawl likely finishes first
                delay: Math.floor(index / 10) * 2 + 15,
              });
            } catch (embedErr) {
              console.error(
                `Failed to enqueue embeddings for ${loc}:`,
                embedErr,
              );
            }
          } catch (error) {
            console.error(`Failed to enqueue ${loc}:`, error);
          }
        });

        // Process enqueuing in batches to avoid overwhelming QStash
        const batchSize = 10;
        for (let i = 0; i < enqueuePromises.length; i += batchSize) {
          const batch = enqueuePromises.slice(i, i + batchSize);
          await Promise.allSettled(batch);

          // Small delay between batches
          if (i + batchSize < enqueuePromises.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        console.log(`Successfully enqueued ${enqueuedUrls} URLs from sitemap`);

        return NextResponse.json({
          success: true,
          discovered: discoveredUrls,
          enqueued: enqueuedUrls,
          method: "sitemap",
        });
      }
    } catch (error) {
      console.warn("Sitemap processing failed:", error);
      // Continue to fallback
    }

    // 2) Fallback: enqueue root URL only
    console.log("No sitemap found, falling back to root URL crawling");

    try {
      await qstash.publishJSON({
        url: `${process.env.BASE_URL}/api/process-crawl`,
        body: {
          kbId,
          webUrl: url,
          userId,
          depth: maxDepth,
        },
      });
      enqueuedUrls = 1;

      // also enqueue embedding job for the root URL (with a small delay)
      try {
        await qstash.publishJSON({
          url: `${process.env.BASE_URL}/api/process-embeddings`,
          body: {
            kbId,
            webUrl: url,
            userId,
          },
          delay: 6,
        });
      } catch (embedErr) {
        console.error(
          `Failed to enqueue embeddings for root ${url}:`,
          embedErr,
        );
      }
    } catch (error) {
      console.error("Failed to enqueue root URL:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to start crawl",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }

    console.log(`Fallback: enqueued root URL ${url}`);

    return NextResponse.json({
      success: true,
      discovered: 1,
      enqueued: enqueuedUrls,
      method: "fallback",
    });
  } catch (error) {
    console.error("Start crawl error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
