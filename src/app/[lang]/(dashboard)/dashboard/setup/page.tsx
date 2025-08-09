import SetupClient from "@/components/dashboard/SetupClient";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  return <SetupClient lang={lang} dict={dict} />;
};

export default SetupPage;
