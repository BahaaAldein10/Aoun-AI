import ReportsClient from "@/components/admin/ReportsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type BotStat = {
  id: string;
  name: string;
  interactions: number;
  accuracy: number; // percent
  status: "Active" | "Inactive" | "Disabled";
};

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminReportsPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  // dummy metrics
  const stats = {
    totalUsers: 1234,
    totalBots: 24,
    totalLeads: 512,
    totalKnowledgeBases: 37,
  };

  const monthlySeries = [
    { month: "Jan", interactions: 1200, users: 300 },
    { month: "Feb", interactions: 2100, users: 420 },
    { month: "Mar", interactions: 800, users: 190 },
    { month: "Apr", interactions: 1600, users: 360 },
    { month: "May", interactions: 1900, users: 400 },
    { month: "Jun", interactions: 2300, users: 520 },
  ];

  const topBots: BotStat[] = [
    {
      id: "BOT-001",
      name: "Support Bot",
      interactions: 1250,
      accuracy: 95,
      status: "Active",
    },
    {
      id: "BOT-002",
      name: "Sales Bot",
      interactions: 870,
      accuracy: 92,
      status: "Active",
    },
    {
      id: "BOT-003",
      name: "FAQ Bot",
      interactions: 2100,
      accuracy: 98,
      status: "Active",
    },
    {
      id: "BOT-004",
      name: "Internal HR",
      interactions: 450,
      accuracy: 88,
      status: "Inactive",
    },
  ];

  return (
    <ReportsClient
      lang={lang}
      dict={dict}
      stats={stats}
      monthlySeries={monthlySeries}
      topBots={topBots}
    />
  );
};

export default AdminReportsPage;
