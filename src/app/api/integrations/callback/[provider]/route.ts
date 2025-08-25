import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { IntegrationType } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type Channel = "whatsapp" | "instagram" | "messenger";

type StateObject = {
  csrf: string;
  channel?: Channel;
  lang: SupportedLang;
  type?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  instance_url?: string;
  hub_id?: string | null;
  hub_domain?: string | null;
};

type ProviderConfig = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type Credentials = {
  channel?: string;
  scope?: string | null;
  phone_number_id?: string | null;
  instance_url?: string;
  hub_id?: string | null;
  hub_domain?: string | null;
};

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/google`,
  },
  microsoft: {
    tokenUrl: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT ?? "common"}/oauth2/v2.0/token`,
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/microsoft`,
  },
  salesforce: {
    tokenUrl: `${process.env.SALESFORCE_SANDBOX === "true" ? "https://test.salesforce.com" : "https://login.salesforce.com"}/services/oauth2/token`,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/salesforce`,
  },
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/hubspot`,
  },
};

const validateCSRF = async (
  stateParams: string | null,
): Promise<StateObject | null> => {
  if (!stateParams) return null;

  try {
    const decoded = decodeURIComponent(stateParams);
    const stateObj = JSON.parse(decoded) as StateObject;

    const cookieStore = await cookies();
    const cookie = cookieStore.get("oauth_state")?.value;

    if (!stateObj.csrf || !cookie || cookie !== stateObj.csrf) {
      console.warn("OAuth state CSRF mismatch or missing cookie");
      return null;
    }

    return stateObj;
  } catch (error) {
    console.warn("Could not parse/validate OAuth state:", error);
    return null;
  }
};

const redirectWithError = (
  lang: SupportedLang,
  error: string,
): NextResponse => {
  return NextResponse.redirect(
    new URL(
      `/${lang}/dashboard/integrations?error=${error}`,
      process.env.NEXTAUTH_URL!,
    ),
  );
};

const redirectWithSuccess = (
  lang: SupportedLang,
  provider: string,
): NextResponse => {
  const response = NextResponse.redirect(
    new URL(
      `/${lang}/dashboard/integrations?success=${provider}`,
      process.env.NEXTAUTH_URL!,
    ),
  );
  response.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
  return response;
};

const exchangeCodeForTokens = async (
  provider: string,
  code: string,
  additionalParams: Record<string, string> = {},
): Promise<TokenResponse> => {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
    grant_type: "authorization_code",
    ...additionalParams,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenRes = await response.json();

  if (tokenRes.error || !tokenRes.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenRes)}`);
  }

  return tokenRes;
};

const encryptCredentials = (credentials: Credentials): string => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY missing");
  }
  return encrypt(JSON.stringify(credentials), process.env.ENCRYPTION_KEY);
};

const getIntegrationType = (
  provider: string,
  stateType?: string,
  stateChannel?: string,
): IntegrationType => {
  switch (provider) {
    case "google":
      return stateType === "calendar"
        ? IntegrationType.GOOGLE_CALENDAR
        : IntegrationType.GOOGLE_SHEETS;
    case "microsoft":
      return IntegrationType.MICROSOFT_OUTLOOK;
    case "salesforce":
      return IntegrationType.SALESFORCE;
    case "hubspot":
      return IntegrationType.HUBSPOT;
    case "facebook":
      return stateChannel === "messenger"
        ? IntegrationType.MESSENGER
        : stateChannel === "instagram"
          ? IntegrationType.INSTAGRAM
          : IntegrationType.WHATSAPP;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};

const upsertIntegration = async (
  userId: string,
  provider: string,
  type: IntegrationType,
  credentials: Credentials,
) => {
  const encrypted = encryptCredentials(credentials);

  const existing = await prisma.integration.findFirst({
    where: { userId, provider, type },
  });

  if (existing) {
    await prisma.integration.update({
      where: { id: existing.id },
      data: {
        enabled: true,
        credentials: { token: encrypted, ...credentials },
      },
    });
  } else {
    await prisma.integration.create({
      data: {
        userId,
        type,
        provider,
        enabled: true,
        credentials: { token: encrypted, ...credentials },
      },
    });
  }
};

const handleFacebookTokenExchange = async (
  code: string,
): Promise<TokenResponse> => {
  // Exchange code for short-lived token
  const shortTokenUrl = `https://graph.facebook.com/v16.0/oauth/access_token?client_id=${process.env.FACEBOOK_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${process.env.NEXTAUTH_URL}/api/integrations/callback/facebook`)}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&code=${code}`;

  const shortTokenRes = await fetch(shortTokenUrl).then((r) => r.json());

  if (shortTokenRes.error || !shortTokenRes.access_token) {
    throw new Error(
      `Facebook short token exchange error: ${JSON.stringify(shortTokenRes)}`,
    );
  }

  // Exchange short-lived for long-lived token
  const longTokenUrl = `https://graph.facebook.com/v16.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortTokenRes.access_token}`;

  const longTokenRes = await fetch(longTokenUrl).then((r) => r.json());

  if (longTokenRes.error || !longTokenRes.access_token) {
    throw new Error(
      `Facebook long token exchange error: ${JSON.stringify(longTokenRes)}`,
    );
  }

  return longTokenRes;
};

const getWhatsAppPhoneNumber = async (
  accessToken: string,
): Promise<string | null> => {
  try {
    const graphVersion = process.env.GRAPH_VERSION ?? "v16.0";
    const graphUrl = `https://graph.facebook.com/${graphVersion}/me?fields=businesses{owned_whatsapp_business_accounts{phone_numbers{display_phone_number,id}}}&access_token=${encodeURIComponent(accessToken)}`;

    const phoneInfo = await fetch(graphUrl).then((r) => r.json());

    const phoneNumber =
      phoneInfo?.businesses?.data?.[0]?.owned_whatsapp_business_accounts
        ?.data?.[0]?.phone_numbers?.data?.[0];

    return phoneNumber?.id || null;
  } catch (error) {
    console.warn(
      "Could not retrieve WhatsApp phone numbers (non-fatal):",
      error,
    );
    return null;
  }
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParams = url.searchParams.get("state");

  const stateObj = await validateCSRF(stateParams);
  const lang: SupportedLang = stateObj?.lang ?? "en";
  const channel: Channel = stateObj?.channel ?? "whatsapp";

  if (!code) {
    return redirectWithError(lang, "missing_code");
  }
  if (!stateObj) return redirectWithError("en", "invalid_state");

  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.redirect(
      new URL(`/${lang}/auth/login`, process.env.NEXTAUTH_URL!),
    );
  }

  try {
    let tokenRes: TokenResponse;
    let additionalCredentials: Credentials = {};

    if (provider === "facebook") {
      tokenRes = await handleFacebookTokenExchange(code);
      const phoneNumberId = await getWhatsAppPhoneNumber(tokenRes.access_token);
      additionalCredentials = {
        channel,
        phone_number_id: phoneNumberId,
        scope: tokenRes.scope ?? null,
      };
    } else {
      tokenRes = await exchangeCodeForTokens(provider, code);
      additionalCredentials = {
        scope: tokenRes.scope ?? null,
        ...(provider === "salesforce" && {
          instance_url: tokenRes.instance_url,
        }),
        ...(provider === "hubspot" && {
          hub_id: tokenRes.hub_id ?? null,
          hub_domain: tokenRes.hub_domain ?? null,
        }),
      };
    }

    const integrationType = getIntegrationType(provider, stateObj?.type);

    const providerToStore = provider === "facebook" ? channel : provider;
    await upsertIntegration(session.user.id, providerToStore, integrationType, {
      ...tokenRes,
      ...additionalCredentials,
    });

    return redirectWithSuccess(
      lang,
      provider === "facebook" ? channel : provider,
    );
  } catch (error) {
    console.error(`${provider} callback error:`, error);
    return redirectWithError(lang, "server_error");
  }
}
