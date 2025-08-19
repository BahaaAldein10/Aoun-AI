import FeaturesSection from "@/components/layout/FeaturesSection";
import HeroSection from "@/components/layout/HeroSection";
import HowItWorksSection from "@/components/layout/HowItWorksSection";
import TestimonialsSection from "@/components/layout/TestimonialsSection";
import { getSiteContent } from "@/lib/actions/siteContent";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { UserRole } from "@prisma/client";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export const revalidate = false;

export default async function HomePage({ params }: Props) {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.home;

  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === UserRole.ADMIN;

  const content = await getSiteContent({ lang });

  return (
    <main className="flex-grow">
      <HeroSection
        lang={lang}
        isAdmin={isAdmin}
        title={content?.hero?.title as string}
        subtitle={content?.hero?.subtitle as string}
        getStarted={content?.hero?.button1 as string}
        viewPricing={content?.hero?.button2 as string}
      />
      <FeaturesSection
        featuresTitle={content?.features?.title as string}
        featuresSubtitle={content?.features?.subtitle as string}
        features={content?.features?.features as { title: string }[]}
      />
      <HowItWorksSection
        lang={lang}
        howItWorksTitle={content?.howItWorks?.title as string}
        steps={content?.howItWorks?.steps as { title: string; text: string }[]}
      />
      <TestimonialsSection
        testimonialsTitle={content?.testimonials?.title as string}
        testimonialsSubtitle={content?.testimonials?.subtitle as string}
        testimonialsPill={content?.testimonials?.pill as string}
        testimonialsItems={
          content?.testimonials?.items as {
            avatarInitial: string;
            title: string;
            name: string;
            text: string;
          }[]
        }
      />
    </main>
  );
}
