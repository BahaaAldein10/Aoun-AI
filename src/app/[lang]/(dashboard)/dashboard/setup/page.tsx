import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import SetupListClient from "@/components/dashboard/SetupListClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type SetupListPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SetupListPage = async ({ params }: SetupListPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return redirect(`/${lang}/auth/login`);

  // Get user's subscription to check limits
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "TRIALING"] },
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  // Get all user's knowledge bases/agents
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { userId },
    include: {
      documents: {
        select: {
          id: true,
          filename: true,
          createdAt: true,
        },
      },
      embeddings: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Transform data to include counts and metadata
  const agentsWithDetails = knowledgeBases.map((kb) => {
    const metadata = kb.metadata as KbMetadata;
    return {
      ...kb,
      documentCount: kb.documents.length,
      embeddingCount: kb.embeddings.length,
      hasUrl: !!metadata?.url,
      hasFiles: (metadata?.files || []).length > 0,
      language: metadata?.language || "en",
      voice: metadata?.voice || "alloy",
      lastUpdated: kb.updatedAt,
      // Remove full arrays to keep payload smaller
      documents: undefined,
      embeddings: undefined,
    };
  });

  const allowedAgents = subscription?.plan?.agents || 1;
  const canCreateMore = agentsWithDetails.length < allowedAgents;

  return (
    <SetupListClient
      agents={agentsWithDetails}
      subscription={subscription}
      canCreateMore={canCreateMore}
      maxAgents={allowedAgents}
      lang={lang}
      dict={dict}
    />
  );
};

export default SetupListPage;
