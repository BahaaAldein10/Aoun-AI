import LeadsClient from "@/components/dashboard/LeadsClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type LeadsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const LeadsPage = async ({ params }: LeadsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;

  if (!userId) {
    return redirect(`/${lang}/auth/login`);
  }

  const leads = await prisma.lead.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const integrations = await prisma.integration.findMany({
    where: {
      userId: session.user.id,
      enabled: true,
    },
  });

  return (
    <LeadsClient
      initialLeads={leads}
      lang={lang}
      dict={dict}
      integrations={integrations}
    />
  );
};

export default LeadsPage;
