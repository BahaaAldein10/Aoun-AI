import AdminShell from "@/components/admin/AdminShell";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import React from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: SupportedLang }>;
}

export async function generateMetadata({
  params,
}: AdminLayoutProps): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const title = dict.seo.admin.title;
  const description = dict.seo.admin.description;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { lang } = await params;
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return redirect(`/${lang}/auth/login`);
  }

  if (user.role !== UserRole.ADMIN) {
    return redirect(`/${lang}`);
  }

  const userProps = {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "USER",
    image: user.image ?? null,
  };

  return (
    <AdminShell lang={lang} user={userProps}>
      {children}
    </AdminShell>
  );
}
