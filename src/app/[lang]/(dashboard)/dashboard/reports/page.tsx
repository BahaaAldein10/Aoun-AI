import ReportsClient from "@/components/dashboard/ReportsClient";
import { getReportsData } from "@/lib/actions/getReportsData";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

type ReportsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const ReportsPage = async ({ params }: ReportsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return redirect(`/${lang}/auth/login`);

  const data = await getReportsData(userId);

  return <ReportsClient lang={lang} dict={dict} monthlyData={data.monthlyData} bots={data.bots} />;
};

export default ReportsPage;
