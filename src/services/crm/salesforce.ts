// /services/crm/salesforce.ts
import { Integration, Lead } from "@prisma/client";

export async function fetchSalesforceLeads(
  integration: Integration,
): Promise<Lead[]> {
  const credentials = integration.credentials as
    | { access_token: string; instance_url: string }
    | undefined;
  const access_token = credentials?.access_token;
  const instance_url = credentials?.instance_url;

  if (!access_token || !instance_url) {
    throw new Error("Missing Salesforce credentials");
  }

  let url = `${instance_url}/services/data/v57.0/query?q=SELECT+Id,FirstName,LastName,Email,Phone+FROM+Lead`;
  const leads: Lead[] = [];

  do {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!res.ok) {
      throw new Error(`Salesforce API error: ${res.statusText}`);
    }

    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = (data.records || []).map((c: any) => ({
      id: "", // Prisma will generate
      userId: integration.userId,
      name: `${c.FirstName || ""} ${c.LastName || ""}`.trim(),
      email: c.Email || null,
      phone: c.Phone || null,
      status: "NEW",
      source: "Salesforce",
      capturedBy: "salesforce",
      meta: c,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    leads.push(...batch);

    // Salesforce pagination
    url = data.nextRecordsUrl ? `${instance_url}${data.nextRecordsUrl}` : "";
  } while (url);

  return leads;
}
