import KnowledgeBasesClient from "@/components/admin/KnowledgeBasesClient";
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminKnowledgeBasesPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const kbs = await prisma.knowledgeBase.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const initialKbs = kbs.map((kb) => ({
    ...kb,
    status: (kb.metadata as KbMetadata)?.url
      ? "URL"
      : ("UPLOAD" as "URL" | "UPLOAD"),
  }));

  return (
    <KnowledgeBasesClient initialKbs={initialKbs} lang={lang} dict={dict} />
  );
};

export default AdminKnowledgeBasesPage;
