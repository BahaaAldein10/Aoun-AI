import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SupportedLang } from "@/lib/dictionaries";

const DOMAIN = "https://www.aoun.cx";
const STATIC_ROUTES = [
  { path: "", priority: 1.0, changefreq: "daily" },
  { path: "pricing", priority: 0.8, changefreq: "monthly" },
  { path: "privacy", priority: 0.5, changefreq: "yearly" },
  { path: "terms", priority: 0.5, changefreq: "yearly" },
  { path: "blog", priority: 0.7, changefreq: "weekly" },
  { path: "faq", priority: 0.7, changefreq: "monthly" },
  { path: "contact", priority: 0.7, changefreq: "monthly" },
];

const LANGS: SupportedLang[] = ["en", "ar"];

type BlogPost = {
  slug: string;
  lang: string;
  updatedAt: Date;
  status: string;
};

async function getBlogPosts(): Promise<BlogPost[]> {
  try {
    return await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, lang: true, updatedAt: true, status: true },
    });
  } catch {
    return [];
  }
}

function xmlEscape(str: string) {
  return str.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
}

function buildUrl(
  loc: string,
  priority: number,
  changefreq: string,
  lastmod?: string,
) {
  return `
    <url>
      <loc>${xmlEscape(loc)}</loc>
      <priority>${priority.toFixed(2)}</priority>
      <changefreq>${changefreq}</changefreq>
      ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
    </url>`;
}

export async function GET() {
  try {
    const blogPosts = await getBlogPosts();

    let urls = "";

    // Static pages (multi-language)
    for (const lang of LANGS) {
      for (const route of STATIC_ROUTES) {
        urls += buildUrl(
          `${DOMAIN}/${lang}${route.path ? "/" + route.path : ""}`,
          route.priority,
          route.changefreq,
        );
      }
    }

    // Blog posts (multi-language)
    for (const post of blogPosts) {
      if (!LANGS.includes(post.lang as SupportedLang)) continue;
      urls += buildUrl(
        `${DOMAIN}/${post.lang}/blog/${encodeURIComponent(post.slug)}`,
        0.6,
        "monthly",
        post.updatedAt.toISOString().split("T")[0],
      );
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls}
</urlset>`;

    return new NextResponse(sitemap, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse("Failed to generate sitemap", { status: 500 });
  }
}
