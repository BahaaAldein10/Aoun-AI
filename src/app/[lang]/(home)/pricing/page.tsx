import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
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
  const { dict } = await getLangAndDict(params);
  const t = dict.pricing;
  const plans = Object.values(t.plans);

  const getButtonText = (planName: string) => {
    if (planName === "free") return t.cta_free;
    if (planName === "enterprise") return t.cta_contact_sales;
    return t.cta;
  };

  const mainPlans = plans.filter((p) => p.name !== "enterprise");
  const enterprise = plans.find((p) => p.name === "enterprise");

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        {/* Title Block */}
        <div className="mx-auto max-w-3xl text-center rtl:text-right">
          <h1 className="text-4xl font-bold tracking-tighter md:text-5xl">
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">{t.subtitle}</p>
        </div>

        <div className="mt-16 flex flex-col items-center gap-10">
          {/* Main Plans */}
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-3">
            {mainPlans.map((plan) => (
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
                  <Button
                    className="w-full cursor-pointer"
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {getButtonText(plan.name)}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Enterprise Plan */}
          {enterprise && (
            <div className="w-full max-w-6xl">
              <Card className="flex flex-col items-start p-6 md:flex-row">
                <div className="w-full md:w-1/3 rtl:md:text-right">
                  <CardHeader className="p-0">
                    <CardTitle>{enterprise.name}</CardTitle>
                    <CardDescription>{enterprise.description}</CardDescription>
                  </CardHeader>
                  <div className="my-6 text-4xl font-bold">
                    {enterprise.price}
                  </div>
                  <CardFooter className="p-0">
                    <Button variant="outline">
                      {getButtonText(enterprise.name)}
                    </Button>
                  </CardFooter>
                </div>

                <CardContent className="w-full pt-6 md:w-2/3 md:pt-0 md:pl-12 rtl:text-right rtl:md:pr-12 rtl:md:pl-0">
                  <ul className="columns-1 space-y-3 md:columns-2">
                    {enterprise.features.map((feature) => (
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
              </Card>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default PricingPage;
