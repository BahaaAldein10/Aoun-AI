// app/[lang]/admin/knowledge-bases/page.tsx
import KnowledgeBasesClient from "@/components/admin/KnowledgeBasesClient";
import { KBWithOwner } from "@/components/admin/KnowledgeBasesColumns";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { KnowledgeBaseSource } from "@prisma/client";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminKnowledgeBasesPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const kbs = (await prisma.knowledgeBase.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  }));

  const initialKbs = kbs.map((kb) => ({
    ...kb,
    status: (kb.source as KnowledgeBaseSource) ?? "MANUAL",
  }));

  return (
    <KnowledgeBasesClient initialKbs={initialKbs} lang={lang} dict={dict} />
  );
};

export default AdminKnowledgeBasesPage;
