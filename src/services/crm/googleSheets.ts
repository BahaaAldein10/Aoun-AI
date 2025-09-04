// /services/crm/googleSheets.ts
import { Integration, Lead } from "@prisma/client";
import { google } from "googleapis";

export async function fetchGoogleSheetLeads(
  integration: Integration,
): Promise<Lead[]> {
  // Validate credentials and spreadsheet ID
  const credentials = integration.credentials as
    | { access_token: string; refresh_token?: string }
    | undefined;
  const spreadsheetId = (integration.meta as { spreadsheetId?: string })
    ?.spreadsheetId;

  if (!credentials?.access_token || !spreadsheetId) {
    throw new Error("Missing Google Sheets credentials or spreadsheetId");
  }

  // Setup Google OAuth2
  const auth = new google.auth.OAuth2();
  auth.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Fetch the data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Leads!A2:D", // assumes: Name | Email | Phone | Source
  });

  const rows = res.data.values || [];

  // Map rows to Lead type
  return rows.map((row: string[]) => ({
    id: "", // Prisma will generate new id on create
    userId: integration.userId, // assign the userId who owns the integration
    name: row[0] || null,
    email: row[1] || null,
    phone: row[2] || null,
    status: "NEW",
    source: row[3] || "Google Sheets",
    capturedBy: "google_sheets",
    meta: { raw: row },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}
