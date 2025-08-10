import AdminDashboardClient from "@/components/admin/AdminDashboardClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

interface AdminOverviewPageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminOverviewPage = async ({ params }: AdminOverviewPageProps) => {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  // TODO: replace these placeholders with real server calls (Prisma / Mongo / APIs)
  const stats = {
    totalUsers: 312,
    totalBots: 28,
    totalLeads: 1_240,
    totalKnowledgeBases: 52,
  };

  // Example recent items (placeholders)
  const recentUsers = [
    {
      id: "u_1",
      name: "Sami Farah",
      email: "sami@company.com",
      createdAt: new Date().toISOString(),
    },
    {
      id: "u_2",
      name: "Lina Ahmed",
      email: "lina@company.com",
      createdAt: new Date().toISOString(),
    },
  ];

  const recentLeads = [
    {
      id: "l_1",
      name: "Acme Ltd",
      contact: "contact@acme.com",
      status: "new",
      createdAt: new Date().toISOString(),
    },
    {
      id: "l_2",
      name: "Beta Co",
      contact: "+96650000000",
      status: "contacted",
      createdAt: new Date().toISOString(),
    },
  ];

  return (
    <AdminDashboardClient
      lang={lang}
      dict={dict}
      stats={stats}
      recentUsers={recentUsers}
      recentLeads={recentLeads}
    />
  );
};

export default AdminOverviewPage;
