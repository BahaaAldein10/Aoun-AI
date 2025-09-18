import SetupClient from "@/components/dashboard/SetupClient";
import { canCreateMoreAgents } from "@/lib/actions/agent";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  const canCreateMore = await canCreateMoreAgents();

  if (!userId) return redirect(`/${lang}/auth/login`);
  if (!canCreateMore) return redirect(`/${lang}/dashboard/setup`);

  return <SetupClient lang={lang} dict={dict} currentUserId={userId!} />;
};

export default SetupPage;
