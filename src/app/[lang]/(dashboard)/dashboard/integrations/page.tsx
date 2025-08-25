import IntegrationsClient from "@/components/dashboard/IntegrationsClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { IntegrationType } from "@prisma/client";
import { redirect } from "next/navigation";

type IntegrationsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

type ConnectedApp = {
  provider: string;
  type: IntegrationType;
  connected: boolean;
};

const IntegrationsPage = async ({ params }: IntegrationsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);
  const session = await auth();

  const userId = session?.user.id;
  if (!userId) {
    return redirect(`/${lang}/auth/login`);
  }

  const integrations = await prisma.integration.findMany({
    where: { userId },
    select: {
      provider: true,
      type: true,
      enabled: true,
      credentials: true,
    },
  });
  const connectedApps: ConnectedApp[] = integrations.map((integration) => ({
    provider: integration.provider,
    type: integration.type,
    connected: integration.enabled && !!integration.credentials,
  }));

  return <IntegrationsClient dict={dict} connectedApps={connectedApps} />;
};

export default IntegrationsPage;
