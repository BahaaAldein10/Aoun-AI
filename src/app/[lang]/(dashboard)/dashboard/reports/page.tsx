import ReportsClient from "@/components/dashboard/ReportsClient";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";

type ReportsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const ReportsPage = async ({ params }: ReportsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  return <ReportsClient lang={lang} dict={dict} />;
};

export default ReportsPage;
