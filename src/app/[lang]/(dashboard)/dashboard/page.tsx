import DashboardClient from "@/components/dashboard/DashboardClient";
import EmptyState from "@/components/dashboard/EmptyState";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { getUserUsage, type UserUsage } from "@/services/usageService";

type DashboardPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  const usageData: UserUsage | null = await getUserUsage("user_placeholder_id");
  // const usageData: UserUsage | null = null;

  if (!usageData) {
    return <EmptyState dict={dict} lang={lang} />;
  }

  return <DashboardClient usage={usageData} lang={lang} dict={dict} />;
}
