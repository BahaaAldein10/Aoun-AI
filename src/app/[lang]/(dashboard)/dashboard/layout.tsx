import DashboardShell from "@/components/dashboard/DashboardShell";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
  params: Promise<{ lang: SupportedLang }>;
}

type Props = { params: Promise<{ lang: SupportedLang }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const title = dict.seo.dashboard.title;
  const description = dict.seo.dashboard.description;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
  const { lang } = await params;
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return redirect(`/${lang}/auth/login`);
  }

  const userProps = {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "USER",
    image: user.image ?? null,
  };

  return (
    <DashboardShell lang={lang} user={userProps}>
      {children}
    </DashboardShell>
  );
}
