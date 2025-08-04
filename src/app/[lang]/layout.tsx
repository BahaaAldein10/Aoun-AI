import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { DictionaryProvider } from "@/contexts/dictionary-context";
import { ReactNode } from "react";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <DictionaryProvider lang={lang as "en" | "ar"}>
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="flex min-h-screen flex-col"
      >
        <Header />
        {children}
        <Footer />
      </div>
    </DictionaryProvider>
  );
}
