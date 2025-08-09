import IntegrationsClient from "@/components/dashboard/IntegrationsClient";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";

type IntegrationsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const IntegrationsPage = async ({ params }: IntegrationsPageProps) => {
  const { dict } = await getLangAndDict(params);

  return <IntegrationsClient dict={dict} />;
};

export default IntegrationsPage;
