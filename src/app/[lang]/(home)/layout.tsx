import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { SupportedLang } from "@/lib/dictionaries";
import { ReactNode } from "react";

export default async function HomeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: SupportedLang }>;
}) {
  return (
    <>
      <Header params={params} />
      {children}
      <Footer params={params} />
    </>
  );
}
