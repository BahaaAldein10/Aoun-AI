import KnowledgeBaseClient from "@/components/dashboard/KnowledgeBaseClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

type KnowledgeBasePageProps = {
  params: Promise<{ lang: SupportedLang; kbId: string }>;
};

const KnowledgeBasePage = async ({ params }: KnowledgeBasePageProps) => {
  const { lang, dict } = await getLangAndDict(params);
  const { kbId } = await params;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return redirect(`/${lang}/auth/login`)
  }

  const kb = await prisma.knowledgeBase.findUnique({
    where: { userId, id: kbId },
    include: { documents: true, embeddings: true },
  });

  if (!kb) return notFound();

  return <KnowledgeBaseClient initialKb={kb} lang={lang} dict={dict} />;
};

export default KnowledgeBasePage;
