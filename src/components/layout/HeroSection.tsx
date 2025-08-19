import { PhoneCall } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";

const HeroSection = ({
  lang,
  isAdmin = false,
  title,
  subtitle,
  getStarted,
  viewPricing,
}: {
  lang: string;
  title: string;
  subtitle: string;
  getStarted: string;
  viewPricing: string;
  isAdmin: boolean;
}) => {
  return (
    <section className="py-12 text-center md:py-16">
      <div className="container">
        <h1 className="from-primary via-accent to-primary mb-6 bg-gradient-to-r bg-clip-text text-4xl font-bold tracking-tighter text-transparent md:text-6xl">
          {title}
        </h1>
        <p className="text-muted-foreground mx-auto mb-10 max-w-3xl text-lg md:text-xl">
          {subtitle}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button size="lg" asChild className="transition hover:scale-105">
            <Link href={isAdmin ? `/${lang}/admin` : `/${lang}/dashboard`}>
              <PhoneCall className="mr-2 rtl:mr-0 rtl:ml-2" /> {getStarted}
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="transition hover:scale-105"
          >
            <Link href={`/${lang}/pricing`}>{viewPricing}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
