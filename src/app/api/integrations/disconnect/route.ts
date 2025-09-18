import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { IntegrationType } from "@prisma/client";
import { NextResponse } from "next/server";

type Channel = "whatsapp" | "messenger" | "instagram";

type DisconnectRequest = {
  type: IntegrationType;
  provider: string;
  channel?: Channel;
};

type TokenData = {
  access_token?: string;
  refresh_token?: string;
};

type RevocationHandler = (tokenData: TokenData) => Promise<void>;

const createErrorResponse = (error: string, status: number = 400) => {
  return NextResponse.json({ ok: false, error }, { status });
};

const createSuccessResponse = () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
  return response;
};

const getDecryptedTokens = (encryptedToken: string): TokenData => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY missing");
  }

  const decrypted = decrypt(encryptedToken, process.env.ENCRYPTION_KEY);
  return JSON.parse(decrypted);
};

const facebookRevoke: RevocationHandler = async (tokenData) => {
  if (!tokenData.access_token) return;
  await fetch(
    `https://graph.facebook.com/me/permissions?access_token=${encodeURIComponent(
      tokenData.access_token,
    )}`,
    { method: "DELETE" },
  );
};

const revocationHandlers: Record<string, RevocationHandler> = {
  google: async (tokenData: TokenData) => {
    const tokenToRevoke = tokenData.refresh_token ?? tokenData.access_token;
    if (!tokenToRevoke) return;

    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokenToRevoke }),
    });
  },

  microsoft: async (tokenData: TokenData) => {
    if (!tokenData.access_token) return;

    // Best-effort: call Microsoft Graph to revoke sign-in sessions
    await fetch("https://graph.microsoft.com/v1.0/me/revokeSignInSessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
  },

  // map facebook + channel keys to same handler:
  facebook: facebookRevoke,
  whatsapp: facebookRevoke,
  messenger: facebookRevoke,
  instagram: facebookRevoke,

  salesforce: async (tokenData: TokenData) => {
    const tokenToRevoke = tokenData.refresh_token ?? tokenData.access_token;
    if (!tokenToRevoke) return;

    const sandbox = process.env.SALESFORCE_SANDBOX === "true";
    const baseUrl = sandbox
      ? "https://test.salesforce.com"
      : "https://login.salesforce.com";

    await fetch(`${baseUrl}/services/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokenToRevoke }),
    });
  },
};

const revokeProviderAccess = async (
  provider: string,
  encryptedToken: string,
): Promise<void> => {
  const handler = revocationHandlers[provider];
  if (!handler) {
    console.warn(`No revocation handler for provider: ${provider}`);
    return;
  }

  try {
    const tokenData = getDecryptedTokens(encryptedToken);
    await handler(tokenData);
  } catch (error) {
    console.error(`Token revocation failed for ${provider}:`, error);
    // Continue with deletion even if revocation fails
  }
};

const findUserIntegration = async (
  userId: string,
  provider: string,
  type: IntegrationType,
) => {
  return await prisma.integration.findUnique({
    where: { userId_provider_type: { userId, provider, type } },
  });
};

const deleteIntegration = async (integrationId: string): Promise<void> => {
  await prisma.integration.delete({ where: { id: integrationId } });
};

const disableIntegration = async (integrationId: string): Promise<void> => {
  await prisma.integration.update({
    where: { id: integrationId },
    data: { enabled: false, credentials: null },
  });
};

const handleIntegrationRemoval = async (
  integrationId: string,
  provider: string,
): Promise<void> => {
  try {
    await deleteIntegration(integrationId);
  } catch (error) {
    console.warn(
      `Failed to delete ${provider} integration, falling back to disable:`,
      error,
    );
    await disableIntegration(integrationId);
  }
};

const validateRequest = (
  body: DisconnectRequest,
): body is DisconnectRequest => {
  return (
    body && typeof body.provider === "string" && typeof body.type === "string"
  );
};

const authenticateUser = async () => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("not_authenticated");
  }

  return userId;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!validateRequest(body)) {
      return createErrorResponse("invalid_request_body");
    }

    const { provider, type } = body;
    const userId = await authenticateUser();

    const integration = await findUserIntegration(userId, provider, type);
    if (!integration) {
      return createErrorResponse("integration_not_found", 404);
    }

    // Attempt to revoke tokens at provider level
    const encryptedToken = (integration.credentials as { token?: string })
      ?.token;
    if (encryptedToken) {
      await revokeProviderAccess(provider, encryptedToken);
    }

    // Handle special case for HubSpot (no reliable revoke endpoint)
    if (provider === "hubspot") {
      await handleIntegrationRemoval(integration.id, provider);
      return createSuccessResponse();
    }

    // Remove integration from database
    await deleteIntegration(integration.id);
    return createSuccessResponse();
  } catch (error) {
    console.error("Disconnect route error:", error);

    if (error instanceof Error && error.message === "not_authenticated") {
      return createErrorResponse("not_authenticated", 401);
    }

    return createErrorResponse("server_error", 500);
  }
}
