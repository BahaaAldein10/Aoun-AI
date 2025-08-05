import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { DictionaryProvider } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { ReactNode } from "react";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: SupportedLang }>;
}) {
  const { lang } = await params;

  return (
    <DictionaryProvider lang={lang as SupportedLang}>
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="flex min-h-screen flex-col"
      >
        <Header params={params} />
        {children}
        <Footer params={params} />
      </div>
    </DictionaryProvider>
  );
}
