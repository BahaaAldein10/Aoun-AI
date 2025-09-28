// app/api/integrations/facebook-delete/route.ts
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { NextResponse } from "next/server";

type FacebookSignedRequest = {
  user_id: string;
  issued_at: number;
};

/**
 * Decode and verify Facebook's signed request
 * Format: base64url(signature).base64url(payload)
 */
function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): FacebookSignedRequest | null {
  try {
    const [encodedSignature, encodedPayload] = signedRequest.split(".");

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    // Verify signature
    const expectedSig = crypto
      .createHmac("sha256", appSecret)
      .update(encodedPayload)
      .digest("base64url");

    const actualSig = Buffer.from(encodedSignature, "base64url").toString(
      "base64url",
    );

    if (expectedSig !== actualSig) {
      console.error("Facebook signed request signature mismatch");
      return null;
    }

    return payload as FacebookSignedRequest;
  } catch (error) {
    console.error("Error parsing Facebook signed request:", error);
    return null;
  }
}

/**
 * Delete all Facebook-related data for a user
 */
async function deleteUserFacebookData(
  facebookUserId: string,
): Promise<boolean> {
  try {
    const providers = ["whatsapp", "messenger", "instagram", "facebook"];

    const candidates = await prisma.integration.findMany({
      where: { provider: { in: providers } },
      select: { id: true, credentials: true },
    });

    const integrations = candidates.filter((integration) => {
      const credentials = integration.credentials as Record<string, unknown>;

      return credentials && credentials.facebook_user_id === facebookUserId;
    });

    if (integrations.length === 0) {
      console.log(`No Facebook integrations found for user ${facebookUserId}`);
      return true; // Not an error - user might not have any integrations
    }

    // Delete all Facebook-family integrations for this Facebook user
    const deleteResults = await prisma.integration.deleteMany({
      where: {
        id: {
          in: integrations.map((i) => i.id),
        },
      },
    });

    console.log(
      `Deleted ${deleteResults.count} Facebook integrations for Facebook user ${facebookUserId}`,
    );
    return true;
  } catch (error) {
    console.error("Error deleting Facebook user data:", error);
    return false;
  }
}

/**
 * Handle Facebook Data Deletion Request
 * Called when user requests data deletion via Facebook
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { signed_request } = body;

    if (!signed_request) {
      return NextResponse.json(
        { error: "Missing signed_request" },
        { status: 400 },
      );
    }

    const appSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!appSecret) {
      console.error("FACEBOOK_CLIENT_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Parse and verify the signed request
    const requestData = parseSignedRequest(signed_request, appSecret);
    if (!requestData) {
      return NextResponse.json(
        { error: "Invalid signed_request" },
        { status: 400 },
      );
    }

    // Delete user's Facebook data
    const deleted = await deleteUserFacebookData(requestData.user_id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete user data" },
        { status: 500 },
      );
    }

    // Return confirmation response
    return NextResponse.json({
      url: `${process.env.NEXTAUTH_URL}/api/integrations/facebook-delete/status?id=${requestData.user_id}`,
      confirmation_code: crypto.randomBytes(16).toString("hex"),
    });
  } catch (error) {
    console.error("Facebook data deletion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Handle GET requests for deletion status
 * Users can check if their data was deleted
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("id");

  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
  }

  const providers = ["whatsapp", "messenger", "instagram", "facebook"];

  // Check if user still has Facebook integrations
  const candidates = await prisma.integration.findMany({
    where: { provider: { in: providers } },
    select: { id: true, credentials: true },
  });

  const remainingIntegrations = candidates.filter((integration) => {
    const credentials = integration.credentials as Record<string, unknown>;

    return credentials && credentials.facebook_user_id === userId;
  }).length;

  return NextResponse.json({
    deleted: remainingIntegrations === 0,
    message:
      remainingIntegrations === 0
        ? "All Facebook data has been deleted"
        : "Data deletion in progress",
  });
}
