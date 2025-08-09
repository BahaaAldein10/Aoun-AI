import SettingsClient from "@/components/dashboard/SettingsClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

type SettingsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const SettingsPage = async ({ params }: SettingsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return redirect(`/${lang}/auth/login`);
  }

  const userPublic = {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    image: user.image ?? null,
    role: user.role ?? "USER",
  };

  return <SettingsClient lang={lang} dict={dict} user={userPublic} />;
};

export default SettingsPage;
