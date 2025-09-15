import DeployListClient from "@/components/dashboard/DeployListClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type DeployListPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const DeployListPage = async ({ params }: DeployListPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return redirect(`/${lang}/auth/login`);
  }

  // Get all user's knowledge bases with document and embedding counts
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { userId },
    include: {
      documents: {
        select: { id: true }, // Just count documents
      },
      embeddings: {
        select: { id: true }, // Just count embeddings
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Transform data to include counts and remove the full arrays
  const kbsWithCounts = knowledgeBases.map((kb) => ({
    ...kb,
    documentCount: kb.documents.length,
    embeddingCount: kb.embeddings.length,
    documents: undefined, // Remove the full documents array
    embeddings: undefined, // Remove the full embeddings array
  }));

  return (
    <DeployListClient knowledgeBases={kbsWithCounts} lang={lang} dict={dict} />
  );
};

export default DeployListPage;
