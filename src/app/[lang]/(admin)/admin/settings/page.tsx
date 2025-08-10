import SettingsClient from "@/components/admin/SettingsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminSettingsPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  // Dummy initial settings (for testing only)
  const initialSettings = {
    siteTitle: "Aoun AI",
    siteDescription: "AI agents platform for business automation.",
    contactEmail: "support@aoun.ai",
    supportUrl: "https://aoun.ai/support",
    defaultLanguage: lang ?? "en",
    defaultTheme: "light",
    maintenanceMode: false,
    logoUrl: "/images/logo-square.png",
  };

  return (
    <SettingsClient lang={lang} dict={dict} initialSettings={initialSettings} />
  );
};

export default AdminSettingsPage;
