import DeployClient from "@/components/dashboard/DeployClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type DeployPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const DeployPage = async ({ params }: DeployPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return redirect(`/${lang}/auth/login`);
  }

  const kb = await prisma.knowledgeBase.findFirst({
    where: {
      userId,
    },
    select: { id: true },
  });

  return <DeployClient lang={lang} dict={dict} kbId={kb?.id} />;
};

export default DeployPage;
