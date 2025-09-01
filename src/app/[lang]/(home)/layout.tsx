import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import VoiceChatFloatingWidget from "@/components/shared/VoiceChatFloatingWidget";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { ReactNode } from "react";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.home;
  return {
    title: t.title,
    description: t.description,
  };
}

export default async function HomeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: SupportedLang }>;
}) {
  const { lang } = await params;

  const session = await auth();
  const userId = session?.user?.id;

  const kb = await prisma.knowledgeBase.findFirst({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  });

  return (
    <>
      <Header params={params} />
      {children}
      <Footer params={params} />
      <VoiceChatFloatingWidget lang={lang} kbId={kb?.id} />
    </>
  );
}
