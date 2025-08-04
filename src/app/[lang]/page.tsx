"use client";

import FeaturesSection from "@/components/layout/FeaturesSection";
import HeroSection from "@/components/layout/HeroSection";
import HowItWorksSection from "@/components/layout/HowItWorksSection";
import TestimonialsSection from "@/components/layout/TestimonialsSection";
import { useDictionary } from "@/contexts/dictionary-context";
import { useParams } from "next/navigation";

export default function HomePage() {
  const { lang } = useParams<{ lang: string }>();
  const dict = useDictionary();
  const t = dict.home;

  return (
    <main className="flex-grow">
      <HeroSection lang={lang} t={t} />
      <FeaturesSection t={t} />
      <HowItWorksSection lang={lang} t={t} />
      <TestimonialsSection t={t} />
    </main>
    // <ChatWidget isFloating />
  );
}
