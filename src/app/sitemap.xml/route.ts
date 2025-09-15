import { NextResponse } from "next/server";

const EXTERNAL_DATA_URL = "https://aoun.cx/";

function generateSiteMap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  >
    <url>
      <loc>${EXTERNAL_DATA_URL}/</loc>
      <priority>1.00</priority>
    </url>
    <url>
      <loc>${EXTERNAL_DATA_URL}/about</loc>
      <priority>0.80</priority>
    </url>
    <!-- Add more URLs dynamically if needed -->
  </urlset>`;
}

export async function GET() {
  const sitemap = generateSiteMap();

  return new NextResponse(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
