import IntegrationsClient from "@/components/admin/IntegrationsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type IntegrationRow = {
  id: string;
  type: "calendar" | "crm" | "messaging" | "social";
  provider: string;
  label: string;
  status: "connected" | "disconnected";
  createdAt: Date;
  updatedAt: Date;
};

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminIntegrationsPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const integrations: IntegrationRow[] = [
    {
      id: "int-google-calendar",
      type: "calendar",
      provider: "google",
      label: "Google Calendar",
      status: "connected",
      createdAt: new Date("2023-02-01T10:00:00Z"),
      updatedAt: new Date("2023-02-21T10:00:00Z"),
    },
    {
      id: "int-outlook",
      type: "calendar",
      provider: "microsoft",
      label: "Microsoft Outlook",
      status: "disconnected",
      createdAt: new Date("2023-02-10T09:00:00Z"),
      updatedAt: new Date("2023-02-10T09:00:00Z"),
    },
    {
      id: "int-salesforce",
      type: "crm",
      provider: "salesforce",
      label: "Salesforce",
      status: "disconnected",
      createdAt: new Date("2023-03-01T08:30:00Z"),
      updatedAt: new Date("2023-03-01T08:30:00Z"),
    },
    {
      id: "int-whatsapp",
      type: "messaging",
      provider: "whatsapp",
      label: "WhatsApp Business",
      status: "connected",
      createdAt: new Date("2023-01-15T12:00:00Z"),
      updatedAt: new Date("2023-02-02T16:30:00Z"),
    },
    {
      id: "int-messenger",
      type: "messaging",
      provider: "messenger",
      label: "Facebook Messenger",
      status: "disconnected",
      createdAt: new Date("2023-01-20T11:00:00Z"),
      updatedAt: new Date("2023-01-20T11:00:00Z"),
    },
  ];

  return (
    <IntegrationsClient
      initialIntegrations={integrations}
      lang={lang}
      dict={dict}
    />
  );
};

export default AdminIntegrationsPage;
