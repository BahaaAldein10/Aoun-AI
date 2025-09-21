import DeployClient from "@/components/dashboard/DeployClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

type DeployPageProps = {
  params: Promise<{ lang: SupportedLang; kbId: string }>;
};

export type IntegrationItem = {
  id: string;
  provider: string;
  type: string;
  credentials?: Record<string, unknown> | null;
  enabled?: boolean;
};

const DeployPage = async ({ params }: DeployPageProps) => {
  const { lang, dict } = await getLangAndDict(params);
  const { kbId } = await params;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return redirect(`/${lang}/auth/login`);
  }

  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { id: true },
  });

  if (!kb) {
    return notFound();
  }

  const integrations = (await prisma.integration.findMany({
    where: {
      userId,
      enabled: true,
    },
  })) as IntegrationItem[];

  return (
    <DeployClient
      lang={lang}
      dict={dict}
      kbId={kb.id}
      integrations={integrations}
    />
  );
};

export default DeployPage;
