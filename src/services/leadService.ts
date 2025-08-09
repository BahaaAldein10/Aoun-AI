export type Lead = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  status: string;
  source?: string;
  createdAt: string;
};

export async function getLeads(
  userId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<Lead[]> {
  // Placeholder: replace with DB query (Prisma or Mongo) that fetches leads belonging to userId
  return [
    {
      id: "1",
      name: "Ahmed",
      email: "a@example.com",
      phone: "+2012345",
      status: "new",
      source: "whatsapp",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      name: "Fatima",
      email: "f@example.com",
      status: "contacted",
      source: "website",
      createdAt: new Date().toISOString(),
    },
  ];
}
