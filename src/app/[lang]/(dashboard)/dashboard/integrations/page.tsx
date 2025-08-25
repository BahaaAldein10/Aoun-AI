import IntegrationsClient from "@/components/dashboard/IntegrationsClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

type IntegrationsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const IntegrationsPage = async ({ params }: IntegrationsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;

  if (!userId) return redirect(`/${lang}/auth/login`);

  const connectedApps = await prisma.integration.findMany({
    where: { userId },
  });

  const apps = connectedApps.map((app) => ({
    provider: app.provider,
    connected: app.enabled && !!app.credentials,
  }));

  return <IntegrationsClient dict={dict} connectedApps={apps} />;
};

export default IntegrationsPage;
