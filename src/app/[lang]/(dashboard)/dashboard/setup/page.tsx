import SetupClient from "@/components/dashboard/SetupClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { userId },
    include: { documents: true },
  });

  return <SetupClient initialKb={kb} hasKb={!!kb} lang={lang} dict={dict} />;
};

export default SetupPage;
