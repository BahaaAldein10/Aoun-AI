import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RequestBody = {
  type: "messaging" | "calendar" | "crm";
  provider: string;
};

export async function POST(req: Request) {
  try {
    const body: RequestBody = await req.json();
    const { provider, type } = body;

    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "missing_provider" },
        { status: 400 },
      );
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "not_authenticated" },
        { status: 401 },
      );
    }

    const existing = await prisma.integration.findFirst({
      where: { userId, provider },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "integration_not_found" },
        { status: 404 },
      );
    }

    // Handle Google token revocation
    if (provider === "google") {
      const encrypted =
        (existing.credentials as { token: string })?.token ?? null;

      if (encrypted) {
        try {
          const decrypted = decrypt(encrypted, process.env.ENCRYPTION_KEY!);
          const tokenRes = JSON.parse(decrypted);
          const tokenToRevoke =
            tokenRes.refresh_token ?? tokenRes.access_token ?? null;

          if (tokenToRevoke) {
            await fetch("https://oauth2.googleapis.com/revoke", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token: tokenToRevoke }),
            });
          }
        } catch (error) {
          console.error("Token revocation failed:", error);
          // Continue with deletion even if revocation fails
        }
      }
    }

    await prisma.integration.delete({ where: { id: existing.id } });

    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (error) {
    console.error("Disconnect route error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
