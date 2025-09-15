import SetupClient from "@/components/dashboard/SetupClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  return <SetupClient lang={lang} dict={dict} currentUserId={userId!} />;
};

export default SetupPage;
