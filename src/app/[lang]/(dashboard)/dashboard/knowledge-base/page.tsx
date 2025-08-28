import KnowledgeBaseClient from "@/components/dashboard/KnowledgeBaseClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

type KnowledgeBasePageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const KnowledgeBasePage = async ({ params }: KnowledgeBasePageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { userId },
    include: { documents: true, embeddings: true },
  });

  return <KnowledgeBaseClient initialKb={kb} lang={lang} dict={dict} />;
};

export default KnowledgeBasePage;
