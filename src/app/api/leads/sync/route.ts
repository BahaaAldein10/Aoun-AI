// /app/api/leads/sync/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGoogleSheetLeads } from "@/services/crm/googleSheets";
import { fetchHubspotLeads } from "@/services/crm/hubspot";
import { fetchSalesforceLeads } from "@/services/crm/salesforce";
import { Lead } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // Get the single CRM integration
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      type: { in: ["HUBSPOT", "SALESFORCE", "GOOGLE_SHEETS"] },
      enabled: true,
    },
  });

  if (!integration) {
    return NextResponse.json({ leads: [], message: "No CRM connected" });
  }

  let leads: Lead[] = [];

  try {
    switch (integration.type) {
      case "HUBSPOT":
        leads = await fetchHubspotLeads(integration);
        break;
      case "SALESFORCE":
        leads = await fetchSalesforceLeads(integration);
        break;
      case "GOOGLE_SHEETS":
        leads = await fetchGoogleSheetLeads(integration);
        break;
    }

    for (const lead of leads) {
      const existing = await prisma.lead.findFirst({
        where: {
          email: lead.email,
          userId,
        },
      });

      if (existing) {
        await prisma.lead.update({
          where: { id: existing.id },
          data: { ...lead, userId },
        });
      } else {
        await prisma.lead.create({ data: { ...lead, userId } });
      }
    }

    return NextResponse.json({ leads });
  } catch (err: unknown) {
    console.error(
      "CRM sync error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 },
    );
  }
}
