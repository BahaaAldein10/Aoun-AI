import AdminSettingsClient from "@/components/admin/AdminSettingsClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminSettingsPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const user = session?.user;

  if (!user) return redirect(`/${lang}/auth/login`);
  if (!user.role || user.role !== "ADMIN") return redirect(`/${lang}`);

  const adminPublic = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };

  return <AdminSettingsClient lang={lang} dict={dict} user={adminPublic} />;
};

export default AdminSettingsPage;
