import CheckoutButton from "@/components/shared/CheckoutButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { Check } from "lucide-react";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dict } = await getLangAndDict(params);
  const t = dict.seo.pricing;
  return {
    title: t.title,
    description: t.description,
  };
}

const PricingPage = async ({ params }: Props) => {
  const { lang, dict } = await getLangAndDict(params);
  const t = dict.pricing;
  const plans = await prisma.plan.findMany();

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        {/* Title Block */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tighter md:text-5xl">
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">{t.subtitle}</p>
        </div>

        <div className="mt-16 flex flex-col items-center gap-10">
          {/* Main Plans */}
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`flex flex-col ${plan.popular ? "border-primary ring-primary ring-2" : ""}`}
              >
                <CardHeader className="rtl:text-right">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex-grow rtl:text-right">
                  <div className="mb-6 flex items-baseline rtl:flex-row-reverse rtl:justify-end">
                    <span className="text-4xl font-bold">{plan.price}</span>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 rtl:space-x-reverse"
                      >
                        <Check className="h-4 w-4" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <CheckoutButton
                    planId={plan.id}
                    lang={lang}
                    SubscribeText="Subscribe"
                    RedirectingText="Redirecting..."
                    popular={plan.popular}
                  />
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingPage;
