import SignupForm from "@/components/auth/SignupForm";
import { Icons } from "@/components/shared/Icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.signup;
  return {
    title: t.title,
    description: t.description,
  };
}

const SignupPage = async ({ params }: Props) => {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.auth;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Icons.Logo className="text-primary h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold">{t.signup_title}</CardTitle>
          <CardDescription>{t.signup_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm t={t} lang={lang} />
        </CardContent>
      </Card>
    </div>
  );
};

export default SignupPage;
