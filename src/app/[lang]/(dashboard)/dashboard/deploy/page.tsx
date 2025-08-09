import DeployClient from "@/components/dashboard/DeployClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type DeployPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const DeployPage = async ({ params }: DeployPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  return <DeployClient lang={lang} dict={dict} />;
};

export default DeployPage;
