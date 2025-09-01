import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow crawlers to access robots + sitemap + public assets
  if (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }
}
