import KnowledgeBaseListClient from "@/components/dashboard/KnowledgeBaseListClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type KnowledgeBaseListPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const KnowledgeBaseListPage = async ({
  params,
}: KnowledgeBaseListPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/${lang}/auth/login`);
  }

  // Get user's subscription to check limits
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "TRIALING"] },
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  // Get all user's knowledge bases
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

  // Transform data to include counts
  const kbsWithCounts = knowledgeBases.map((kb) => ({
    ...kb,
    documentCount: kb.documents.length,
    embeddingCount: kb.embeddings.length,
    documents: undefined, // Remove the full documents array
    embeddings: undefined, // Remove the full embeddings array
  }));

  const allowedKnowledgeBases = subscription?.plan?.agents || 1; // Default to 1 if no subscription
  const canCreateMore = kbsWithCounts.length < allowedKnowledgeBases;

  return (
    <KnowledgeBaseListClient
      knowledgeBases={kbsWithCounts}
      subscription={subscription}
      canCreateMore={canCreateMore}
      lang={lang}
      dict={dict}
    />
  );
};

export default KnowledgeBaseListPage;
