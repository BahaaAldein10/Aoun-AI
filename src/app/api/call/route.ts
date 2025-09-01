// app/api/call/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy /api/call -> /api/voice
 * Accepts multipart/form-data (FormData from browser) and forwards body+content-type+auth header.
 * If you want to accept base64 JSON from clients, prefer sending FormData from client instead
 * (this keeps server code simpler).
 */
export async function POST(req: NextRequest) {
  try {
    // build the internal /api/voice URL on same origin
    const voiceUrl = new URL("/api/voice", req.url).href;

    // clone necessary headers
    const headers: Record<string, string> = {};
    const ct = req.headers.get("content-type");
    if (ct) headers["content-type"] = ct;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

    // read raw body as arrayBuffer and forward
    const buf = await req.arrayBuffer();

    const upstream = await fetch(voiceUrl, {
      method: "POST",
      headers,
      body: Buffer.from(buf),
    });

    const text = await upstream.text();
    // Propagate status
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error("api/call proxy error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
