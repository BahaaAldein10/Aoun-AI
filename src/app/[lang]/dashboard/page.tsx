import { auth } from "@/lib/auth";
import { SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";

interface DashboardPageProps {
  params: Promise<{
    lang: SupportedLang;
  }>;
}

const DashboardPage = async ({ params }: DashboardPageProps) => {
  const { lang } = await params;

  const session = await auth();
  const user = session?.user;

  if (!user) return redirect(`/${lang}/auth/login`);

  return (
    <div>
      {user.email} | {user.name} | {user.role}
    </div>
  );
};

export default DashboardPage;
