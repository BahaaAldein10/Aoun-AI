import KnowledgeBaseListClient from "@/components/dashboard/KnowledgeBaseListClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { getAgentLimitInfo } from "@/lib/subscription/checkUsageLimits";
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

  // Get agent limit info using subscription control
  const agentLimitInfo = await getAgentLimitInfo(userId);

  // Get user's subscription details
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  // Get all user's knowledge bases
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { userId },
    include: {
      documents: {
        select: { id: true },
      },
      embeddings: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Transform data to include counts
  const kbsWithCounts = knowledgeBases.map((kb) => ({
    ...kb,
    documentCount: kb.documents.length,
    embeddingCount: kb.embeddings.length,
    documents: undefined,
    embeddings: undefined,
  }));

  return (
    <KnowledgeBaseListClient
      knowledgeBases={kbsWithCounts}
      subscription={subscription}
      canCreateMore={agentLimitInfo.canCreateMore}
      maxAgents={agentLimitInfo.limit}
      lang={lang}
      dict={dict}
    />
  );
};

export default KnowledgeBaseListPage;
