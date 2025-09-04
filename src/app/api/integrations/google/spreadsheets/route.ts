// app/api/integrations/google/spreadsheets/route.ts
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { IntegrationType } from "@prisma/client";
import { google } from "googleapis";
import { NextResponse } from "next/server";

type GoogleFile = {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the Google Sheets integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        type: IntegrationType.GOOGLE_SHEETS,
        enabled: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: "Google Sheets integration not found" },
        { status: 404 },
      );
    }

    // Decrypt credentials
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error("ENCRYPTION_KEY missing");
    }

    const decryptedToken = decrypt(
      (integration.credentials as { token: string }).token,
      process.env.ENCRYPTION_KEY,
    );
    const credentials = JSON.parse(decryptedToken);

    // Setup Google Auth
    const googleAuth = new google.auth.OAuth2();
    googleAuth.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
    });

    // Get Google Drive instance
    const drive = google.drive({ version: "v3", auth: googleAuth });

    // List spreadsheets (Google Sheets files)
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id,name,createdTime,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: 50,
    });

    const files: GoogleFile[] =
      response.data.files?.map((file) => ({
        id: file.id!,
        name: file.name!,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!,
      })) || [];

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Error listing Google Spreadsheets:", error);
    return NextResponse.json(
      { error: "Failed to list spreadsheets" },
      { status: 500 },
    );
  }
}
