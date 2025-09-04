// app/api/integrations/oauth/[provider]/route.ts
import { SupportedLang } from "@/lib/dictionaries";
import crypto from "crypto";
import { NextResponse } from "next/server";

type IntegrationType = "messaging" | "calendar" | "crm";

type OAuthConfig = {
  clientId: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  additionalParams?: Record<string, string>;
  scopeSeparator?: string;
};

type StateObject = {
  csrf: string;
  type?: IntegrationType;
  lang: SupportedLang;
  channel?: string;
};

const OAUTH_CONFIGS = {
  // Google: supports calendar and sheets (crm -> sheets)
  google: (type: IntegrationType): OAuthConfig => ({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/google`,
    scope: [
      "openid",
      "email",
      "profile",
      ...(type === "calendar"
        ? ["https://www.googleapis.com/auth/calendar"]
        : []),
      ...(type === "crm"
        ? [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive.readonly", // Add this to list spreadsheets
          ]
        : []),
    ],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    additionalParams: {
      access_type: "offline",
      prompt: "consent",
    },
    scopeSeparator: " ",
  }),

  // Microsoft (Outlook / Calendar)
  microsoft: (type: IntegrationType): OAuthConfig => {
    const tenant = process.env.MICROSOFT_TENANT ?? "common";
    return {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/microsoft`,
      scope: [
        "openid",
        "profile",
        "email",
        "offline_access",
        ...(type === "calendar" ? ["Calendars.ReadWrite"] : []),
      ],
      authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      additionalParams: {
        response_mode: "query",
        prompt: "consent",
      },
      scopeSeparator: " ",
    };
  },

  // WhatsApp (Facebook login) - comma separated scopes in dialog URL recommended
  whatsapp: (_type?: IntegrationType): OAuthConfig => ({
    clientId: process.env.FACEBOOK_CLIENT_ID!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/facebook`,
    scope: [
      "pages_show_list",
      "pages_messaging",
      "business_management",
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ],
    authUrl: "https://www.facebook.com/v16.0/dialog/oauth",
    additionalParams: {
      auth_type: "rerequest",
    },
    scopeSeparator: ",",
  }),

  // Messenger (Facebook Pages / Messenger Platform)
  messenger: (_type?: IntegrationType): OAuthConfig => ({
    clientId: process.env.FACEBOOK_CLIENT_ID!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/facebook`,
    scope: [
      "pages_show_list",
      "pages_messaging",
      "pages_manage_metadata", // helpful for webhook subscriptions/config
    ],
    authUrl: "https://www.facebook.com/v16.0/dialog/oauth",
    additionalParams: {
      auth_type: "rerequest",
    },
    scopeSeparator: ",",
  }),

  // Instagram (Instagram Graph / Direct messaging)
  instagram: (_type?: IntegrationType): OAuthConfig => ({
    clientId: process.env.FACEBOOK_CLIENT_ID!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/facebook`,
    scope: [
      "pages_show_list",
      "instagram_basic",
      "instagram_manage_messages",
      "pages_manage_metadata", // required to subscribe & receive webhooks about Page/IG activity
    ],
    authUrl: "https://www.facebook.com/v16.0/dialog/oauth",
    additionalParams: {
      auth_type: "rerequest",
    },
    scopeSeparator: ",",
  }),

  // Salesforce
  salesforce: (): OAuthConfig => {
    const sandbox = process.env.SALESFORCE_SANDBOX === "true";
    const base = sandbox
      ? "https://test.salesforce.com"
      : "https://login.salesforce.com";
    return {
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/salesforce`,
      scope: ["api", "refresh_token", "openid"],
      authUrl: `${base}/services/oauth2/authorize`,
      scopeSeparator: " ",
    };
  },

  // HubSpot
  hubspot: (): OAuthConfig => ({
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/integrations/callback/hubspot`,
    scope: ["crm.objects.contacts.read", "crm.objects.contacts.write", "oauth"],
    authUrl: "https://app.hubspot.com/oauth/authorize",
    scopeSeparator: " ",
  }),
};

const generateCSRFToken = (): string => crypto.randomBytes(24).toString("hex");

const createStateObject = (
  csrf: string,
  type: IntegrationType,
  lang: SupportedLang,
  channel?: string,
): StateObject => ({
  csrf,
  type,
  lang,
  ...(channel && { channel }),
});

const buildAuthUrl = (config: OAuthConfig, state: string): string => {
  const scopeStr = config.scope.join(config.scopeSeparator ?? " ");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopeStr,
    state,
    ...config.additionalParams,
  });

  return `${config.authUrl}?${params.toString()}`;
};

const setSecureCookie = (response: NextResponse, csrf: string): void => {
  response.cookies.set("oauth_state", csrf, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300, // 5 minutes
  });
};

const handleOAuthProvider = (
  provider: string,
  type: IntegrationType,
  lang: SupportedLang,
  channel?: string,
): NextResponse => {
  const configFactory = OAUTH_CONFIGS[provider as keyof typeof OAUTH_CONFIGS];

  if (!configFactory) {
    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  }

  // configFactory is declared as function for all entries -> call with type
  const config = (configFactory as (type: IntegrationType) => OAuthConfig)(
    type,
  );
  const csrf = generateCSRFToken();
  const stateObj = createStateObject(csrf, type, lang, channel);
  const stateStr = encodeURIComponent(JSON.stringify(stateObj));
  const authUrl = buildAuthUrl(config, stateStr);

  const response = NextResponse.json({ url: authUrl });
  setSecureCookie(response, csrf);

  return response;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") as IntegrationType) ?? "messaging";
  const lang = (url.searchParams.get("lang") as SupportedLang) ?? "en";

  if (!type || !["messaging", "calendar", "crm"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid or missing type parameter" },
      { status: 400 },
    );
  }

  // For Facebook-family providers, channel is used to distinguish (facebook callback handles channel)
  // Map some provider aliases: allow `facebook` to be accepted as umbrella too
  const normalizedProvider = provider === "facebook" ? "whatsapp" : provider;

  // if provider is one of facebook family, allow channel override from path
  const channel =
    normalizedProvider === "whatsapp" ||
    normalizedProvider === "messenger" ||
    normalizedProvider === "instagram"
      ? normalizedProvider
      : undefined;

  return handleOAuthProvider(normalizedProvider, type, lang, channel);
}
