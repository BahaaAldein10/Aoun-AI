import SetupClient from "@/components/dashboard/SetupClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type SetupPageProps = {
  params: Promise<{ lang: SupportedLang; kbId: string }>;
};

const SetupPage = async ({ params }: SetupPageProps) => {
  const { lang, dict } = await getLangAndDict(params);
  const { kbId } = await params;

  const session = await auth();
  const userId = session?.user?.id;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { userId, id: kbId },
    include: { documents: true },
  });

  if (!kb) return notFound();

  return (
    <SetupClient
      initialKb={kb}
      hasKb={!!kb}
      lang={lang}
      dict={dict}
      currentUserId={userId!}
    />
  );
};

export default SetupPage;
