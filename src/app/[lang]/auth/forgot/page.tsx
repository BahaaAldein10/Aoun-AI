import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.forgot_password;
  return {
    title: t.title,
    description: t.description,
  };
}

const ForgotPasswordPage = async ({ params }: Props) => {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.auth;

  const session = await auth();
  const user = session?.user;

  if (user) return redirect(`/${lang}`);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Image src="/images/logo.png" width={40} height={40} alt="Logo" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {t.forgot_password_title}
          </CardTitle>
          <CardDescription>{t.forgot_password_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm t={t} lang={lang} />
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
