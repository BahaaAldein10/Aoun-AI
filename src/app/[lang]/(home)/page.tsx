import FeaturesSection from "@/components/layout/FeaturesSection";
import HeroSection from "@/components/layout/HeroSection";
import HowItWorksSection from "@/components/layout/HowItWorksSection";
import TestimonialsSection from "@/components/layout/TestimonialsSection";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function HomePage({ params }: Props) {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.home;

  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <main className="flex-grow">
      <HeroSection lang={lang} t={t} isAdmin={isAdmin} />
      <FeaturesSection t={t} />
      <HowItWorksSection lang={lang} t={t} />
      <TestimonialsSection t={t} />
    </main>
  );
}
