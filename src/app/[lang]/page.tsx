import FeaturesSection from "@/components/layout/FeaturesSection";
import HeroSection from "@/components/layout/HeroSection";
import HowItWorksSection from "@/components/layout/HowItWorksSection";
import TestimonialsSection from "@/components/layout/TestimonialsSection";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import type { Metadata } from "next";

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

export default async function HomePage({ params }: Props) {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.home;

  return (
    <main className="flex-grow">
      <HeroSection lang={lang} t={t} />
      <FeaturesSection t={t} />
      <HowItWorksSection lang={lang} t={t} />
      <TestimonialsSection t={t} />
    </main>
  );
}
