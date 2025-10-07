// app/[lang]/(dashboard)/dashboard/page.tsx
import DashboardClient, {
  UserUsage,
} from "@/components/dashboard/DashboardClient";
import EmptyState from "@/components/dashboard/EmptyState";
import { getUserUsage } from "@/lib/actions/getUserUsage";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

type DashboardPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  // Redirect to login if not authenticated
  if (!userId) {
    redirect(`/${lang}/auth/login`);
  }

  let usageData: UserUsage | null = null;
  try {
    usageData = await getUserUsage(userId);
  } catch (err) {
    console.error("Failed to load usage:", err);
    usageData = null;
  }

  // Show empty state if no usage data available
  if (!usageData) {
    return <EmptyState dict={dict} lang={lang} />;
  }

  return <DashboardClient usage={usageData} lang={lang} dict={dict} />;
}
