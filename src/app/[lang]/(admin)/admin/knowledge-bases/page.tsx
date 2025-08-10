// app/[lang]/admin/knowledge-bases/page.tsx
import KnowledgeBasesClient from "@/components/admin/KnowledgeBasesClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type KBRow = {
  id: string;
  name: string | null;
  status: "published" | "draft" | "archived";
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminKnowledgeBasesPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const kbs = [
    {
      id: "KB-001",
      name: "Support Knowledge Base",
      status: "published",
      owner: { id: "USER-001", name: "John Doe" },
      createdAt: new Date("2023-02-01T10:00:00.000Z"),
      updatedAt: new Date("2023-02-20T12:00:00.000Z"),
    },
    {
      id: "KB-002",
      name: "Sales FAQ",
      status: "draft",
      owner: { id: "USER-002", name: "Jane Doe" },
      createdAt: new Date("2023-03-05T09:00:00.000Z"),
      updatedAt: new Date("2023-03-07T14:30:00.000Z"),
    },
    {
      id: "KB-003",
      name: "HR Internal Policies",
      status: "archived",
      owner: { id: "USER-003", name: "Alice Smith" },
      createdAt: new Date("2022-10-10T08:00:00.000Z"),
      updatedAt: new Date("2023-01-12T11:45:00.000Z"),
    },
  ];

  const initialKbs: KBRow[] = kbs.map((k) => ({
    id: k.id,
    name: k.name,
    status: k.status as KBRow["status"],
    ownerId: k.owner?.id ?? null,
    ownerName: k.owner?.name ?? null,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));

  return (
    <KnowledgeBasesClient initialKbs={initialKbs} lang={lang} dict={dict} />
  );
};

export default AdminKnowledgeBasesPage;
