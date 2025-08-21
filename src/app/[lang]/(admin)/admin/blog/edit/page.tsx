import { SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

const AdminEditPage = async ({
  params,
}: {
  params: Promise<{ lang: SupportedLang }>;
}) => {
  const { lang } = await params;

  return redirect(`/${lang}/admin/blog`);
};

export default AdminEditPage;
