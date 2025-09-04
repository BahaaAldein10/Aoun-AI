// /services/crm/hubspot.ts
import { Integration, Lead } from "@prisma/client";

export async function fetchHubspotLeads(
  integration: Integration,
): Promise<Lead[]> {
  const credentials = integration.credentials as
    | { access_token?: string }
    | undefined;
  const access_token = credentials?.access_token;
  if (!access_token) throw new Error("Missing HubSpot access_token");

  const leads: Lead[] = [];
  let after: string | undefined = undefined;

  do {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/contacts");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!res.ok) {
      throw new Error(`HubSpot API error: ${res.statusText}`);
    }

    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = (data.results || []).map((c: any) => ({
      id: "", // Prisma will generate
      userId: integration.userId,
      name: `${c.properties.firstname || ""} ${c.properties.lastname || ""}`.trim(),
      email: c.properties.email || null,
      phone: c.properties.phone || null,
      status: "NEW",
      source: "HubSpot",
      capturedBy: "hubspot",
      meta: c,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    leads.push(...batch);

    after = data.paging?.next?.after;
  } while (after);

  return leads;
}
