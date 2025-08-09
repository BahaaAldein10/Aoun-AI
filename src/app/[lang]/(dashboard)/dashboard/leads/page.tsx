import LeadsClient from "@/components/dashboard/LeadsClient";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { getLeads } from "@/services/leadService";

type LeadsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const LeadsPage = async ({ params }: LeadsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  // TODO: Replace with real user ID from session/auth context
  const leads = await getLeads("user_placeholder_id", { limit: 20 });

  return <LeadsClient initialLeads={leads} lang={lang} dict={dict} />;
};

export default LeadsPage;
