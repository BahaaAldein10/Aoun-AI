// app/(dashboard)/page.tsx   (or wherever your DashboardPage file lives)
import DashboardClient, {
  UserUsage,
} from "@/components/dashboard/DashboardClient";
import EmptyState from "@/components/dashboard/EmptyState";
import { getUserUsage } from "@/lib/actions/getUserUsage";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type DashboardPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;

  let usageData: UserUsage | null = null;
  try {
    usageData = await getUserUsage(userId!);
  } catch (err) {
    console.error("Failed to load usage:", err);
    usageData = null;
  }

  if (!usageData) {
    return <EmptyState dict={dict} lang={lang} />;
  }

  return <DashboardClient usage={usageData} lang={lang} dict={dict} />;
}
