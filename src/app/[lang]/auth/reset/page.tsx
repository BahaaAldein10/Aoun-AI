import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
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
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.reset_password;
  return {
    title: t.title,
    description: t.description,
  };
}

const ResetPasswordPage = async ({ params, searchParams }: Props) => {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.auth;
  const { token } = await searchParams;

  const session = await auth();
  const user = session?.user;

  if (!user) return redirect(`/${lang}`);

  if (!token) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <Image src="/images/logo.png" width={40} height={40} alt="Logo" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-600">
              {t.invalid_reset_link_title}
            </CardTitle>
            <CardDescription>{t.invalid_reset_link_desc}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link
              href={`/${lang}/auth/forgot`}
              className="text-primary underline"
            >
              {t.request_new_reset_link}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Image src="/images/logo.png" width={40} height={40} alt="Logo" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {t.reset_password_title}
          </CardTitle>
          <CardDescription>{t.reset_password_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm
            t={t}
            lang={lang}
            token={token}
            email={user?.email as string}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
