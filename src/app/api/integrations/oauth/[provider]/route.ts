import { SupportedLang } from "@/lib/dictionaries";
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as "messaging" | "calendar" | "crm";
  const lang = (url.searchParams.get("lang") as SupportedLang) ?? "en";

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/callback/google`;
    const scope = [
      "openid",
      "email",
      "profile",
      // calendar scope if calendar connection
      ...(type === "calendar"
        ? ["https://www.googleapis.com/auth/calendar"]
        : []),
    ].join(" ");

    const csrf = crypto.randomBytes(24).toString("hex");
    const stateObj = { csrf, type, lang };
    const stateStr = encodeURIComponent(JSON.stringify(stateObj));

    const paramsObj = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline", // ask for refresh token
      state: stateStr,
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${paramsObj.toString()}`;
    const res = NextResponse.json({ url: authUrl });

    res.cookies.set("oauth_state", csrf, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300, // 5 minutes
    });

    return res;
  }
}
