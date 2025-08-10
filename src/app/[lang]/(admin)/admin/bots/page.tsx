import BotsClient from "@/components/admin/BotsClient";
import { BotRow } from "@/components/admin/BotsColumns";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminBotsPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const bots: BotRow[] = [
    {
      id: "BOT-001",
      name: "Support Bot",
      status: "deployed",
      ownerId: "USER-001",
      ownerName: "John Doe",
      createdAt: new Date("2022-01-01T00:00:00.000Z"),
      updatedAt: new Date("2022-01-15T00:00:00.000Z"),
    },
    {
      id: "BOT-002",
      name: "Sales Bot",
      status: "draft",
      ownerId: "USER-002",
      ownerName: "Jane Doe",
      createdAt: new Date("2022-02-01T00:00:00.000Z"),
      updatedAt: new Date("2022-02-15T00:00:00.000Z"),
    },
    {
      id: "BOT-003",
      name: "FAQ Bot",
      status: "deployed",
      ownerId: "USER-003",
      ownerName: "Bob Smith",
      createdAt: new Date("2022-03-01T00:00:00.000Z"),
      updatedAt: new Date("2022-03-15T00:00:00.000Z"),
    },
    {
      id: "BOT-004",
      name: "Internal HR",
      status: "disabled",
      ownerId: "USER-004",
      ownerName: "Alice Johnson",
      createdAt: new Date("2022-04-01T00:00:00.000Z"),
      updatedAt: new Date("2022-04-15T00:00:00.000Z"),
    },
  ];

  const initialBots: BotRow[] = bots.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status ?? "draft",
    ownerId: b.ownerId ?? null,
    ownerName: b.ownerName ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }));

  return <BotsClient initialBots={initialBots} lang={lang} dict={dict} />;
};

export default AdminBotsPage;
