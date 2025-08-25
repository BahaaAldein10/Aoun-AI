import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/callback/google`;
  const code = url.searchParams.get("code");
  const stateParams = url.searchParams.get("state");

  let lang: SupportedLang = "en";

  try {
    if (!stateParams) throw new Error("Missing state params");
    const decoded = decodeURIComponent(stateParams);
    const stateObj = JSON.parse(decoded) as {
      csrf?: string;
      type?: string;
      lang?: SupportedLang;
    };

    const cookieStore = await cookies();
    const cookie = cookieStore.get("oauth_state")?.value;

    if (!stateObj.csrf || !cookie || cookie !== stateObj.csrf) {
      console.warn("OAuth state CSRF mismatch or missing cookie");
    } else {
      lang = (stateObj.lang as SupportedLang) ?? "en";
    }
  } catch (error) {
    console.warn("Could not parse/validate OAuth state:", error);
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/${lang}/dashboard/integrations?error=missing_code`,
        process.env.NEXTAUTH_URL!,
      ),
    );
  }

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.redirect(
      new URL(`/${lang}/auth/login`, process.env.NEXTAUTH_URL!),
    );
  }

  try {
    if (provider === "google") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code!,
          grant_type: "authorization_code",
        }),
      }).then((res) => res.json());

      if (tokenRes.error || !tokenRes.access_token) {
        console.error("Google token exchange error:", tokenRes);
        return NextResponse.redirect(
          new URL(
            `/${lang}/dashboard/integrations?error=token_exchange_failed`,
            process.env.NEXTAUTH_URL,
          ),
        );
      }

      // tokenRes includes access_token, refresh_token, expires_in
      const encrypted = encrypt(
        JSON.stringify(tokenRes),
        process.env.ENCRYPTION_KEY!,
      );

      const existing = await prisma.integration.findFirst({
        where: {
          userId,
          type: "GOOGLE_CALENDAR",
          provider: "google",
        },
      });

      if (existing) {
        await prisma.integration.update({
          where: { id: existing.id },
          data: {
            enabled: true,
            credentials: { token: encrypted, scope: tokenRes.scope ?? null },
          },
        });
      } else {
        await prisma.integration.create({
          data: {
            userId,
            type: "GOOGLE_CALENDAR",
            provider: "google",
            enabled: true,
            credentials: { token: encrypted, scope: tokenRes.scope ?? null },
          },
        });
      }

      const res = NextResponse.redirect(
        new URL(
          `/${lang}/dashboard/integrations?success=google`,
          process.env.NEXTAUTH_URL!,
        ),
      );
      res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
      return res;
    }
  } catch (error) {
    console.error("Integration callback error:", error);
    const res = NextResponse.redirect(
      new URL(
        `/${lang}/dashboard/integrations?error=server_error`,
        process.env.NEXTAUTH_URL,
      ),
    );
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  }
}
