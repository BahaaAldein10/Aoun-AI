// app/api/admin/metrics/route.ts
import { getRecentInvocationMetrics } from "@/lib/monitoring/vercelMetrics";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const samples = await getRecentInvocationMetrics();
    return NextResponse.json({ ok: true, samples });
  } catch (err) {
    console.error("admin/metrics error:", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
