import AddBlogClient from "@/components/admin/AddBlogClient";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function AdminBlogAddPage({ params }: PageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  if (!session?.user.id || session.user.role !== UserRole.ADMIN)
    return redirect(`/${lang}`);

  return <AddBlogClient lang={lang} dict={dict} />;
}
