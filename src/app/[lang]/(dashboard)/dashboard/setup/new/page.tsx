import SetupClient from "@/components/dashboard/SetupClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { checkAgentLimit } from "@/lib/subscription/checkUsageLimits";
import { redirect } from "next/navigation";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return redirect(`/${lang}/auth/login`);

  // Check if user can create more agents using subscription control
  const agentCheck = await checkAgentLimit(userId);

  if (!agentCheck.allowed) {
    return redirect(`/${lang}/dashboard/setup`);
  }

  return <SetupClient lang={lang} dict={dict} currentUserId={userId!} />;
};

export default SetupPage;
