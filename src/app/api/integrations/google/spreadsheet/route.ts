// app/api/integrations/google/spreadsheet/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { spreadsheetId, spreadsheetName } = await req.json();

    if (!spreadsheetId || !spreadsheetName) {
      return NextResponse.json(
        { error: "spreadsheetId and spreadsheetName are required" },
        { status: 400 },
      );
    }

    // Update the Google Sheets integration with the selected spreadsheet
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

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        meta: {
          ...(integration.meta as object),
          spreadsheetId,
          spreadsheetName,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Spreadsheet configured successfully",
    });
  } catch (error) {
    console.error("Error saving spreadsheet configuration:", error);
    return NextResponse.json(
      { error: "Failed to save spreadsheet configuration" },
      { status: 500 },
    );
  }
}
