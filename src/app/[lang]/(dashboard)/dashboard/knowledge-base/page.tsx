import KnowledgeBaseClient from "@/components/dashboard/KnowledgeBaseClient";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { getKnowledgeBase } from "@/services/knowledgeBaseService";

type KnowledgeBasePageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const KnowledgeBasePage = async ({ params }: KnowledgeBasePageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  // Replace with actual user ID from session/auth
  const kb = await getKnowledgeBase("000");

  return <KnowledgeBaseClient initialKb={kb} lang={lang} dict={dict} />;
};

export default KnowledgeBasePage;
