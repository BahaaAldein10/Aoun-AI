import CheckoutButton from "@/components/shared/CheckoutButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { AlertTriangle, Check, Star } from "lucide-react";
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

  const session = await auth();
  let currentSubscription = null;

  if (session?.user?.id) {
    currentSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      include: {
        plan: true,
      },
    });
  }

  const plans = await prisma.plan.findMany({
    where: { lang },
    orderBy: { priceAmount: "asc" },
  });

  const getCurrentPlanName = () => {
    return currentSubscription?.plan?.name || null;
  };

  const getButtonProps = (plan: Plan) => {
    const isFree = plan.priceAmount === 0;
    const currentPlanName = getCurrentPlanName();
    const hasActivePaidSubscription =
      currentSubscription && currentPlanName !== "FREE";

    // Free plan - always accessible
    if (isFree) {
      return {
        text: t.getStarted,
        disabled: false,
        variant: "outline" as const,
        isCurrentPlan: currentPlanName === "FREE",
        showButton: true,
      };
    }

    // Paid plans - only show if user doesn't have an active paid subscription
    if (hasActivePaidSubscription) {
      return {
        text: t.subscribe,
        disabled: true,
        variant: "outline" as const,
        isCurrentPlan: currentPlanName === plan.name,
        showButton: false, // Hide button for paid plans when user has active subscription
      };
    }

    // User has no subscription or only free - show subscribe button
    return {
      text: t.subscribe,
      disabled: false,
      variant: plan.popular ? ("default" as const) : ("outline" as const),
      isCurrentPlan: currentPlanName === plan.name,
      showButton: true,
    };
  };

  const hasActivePaidSubscription =
    currentSubscription && getCurrentPlanName() !== "FREE";

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

        {/* Show current plan info */}
        {currentSubscription && (
          <div className="mt-8 space-y-4">
            {currentSubscription.currentPeriodEnd && (
              <Alert>
                <AlertDescription>
                  <p className="inline-flex flex-wrap items-center gap-1">
                    {t.currentlyOn}{" "}
                    <span className="text-foreground font-medium">
                      {currentSubscription.plan.title}
                    </span>
                    {" - "}
                    {t.renewsOn}{" "}
                    {new Date(
                      currentSubscription.currentPeriodEnd,
                    ).toLocaleDateString()}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Show past due alert */}
            {currentSubscription.status === SubscriptionStatus.PAST_DUE && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t.pastDueWarning}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="mt-16 flex flex-col items-center gap-10">
          {/* Main Plans */}
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-3">
            {plans.map((plan) => {
              const buttonProps = getButtonProps(plan);
              const isCurrentPlan = getCurrentPlanName() === plan.name;

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    plan.popular && !isCurrentPlan
                      ? "border-primary ring-primary scale-105 ring-2"
                      : ""
                  }`}
                >
                  {/* Badges */}
                  {isCurrentPlan ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                      <div className="flex items-center gap-1 rounded-full bg-green-500 px-4 py-2 text-sm font-medium text-white">
                        <Check className="h-3 w-3" />
                        {t.currentPlan}
                      </div>
                    </div>
                  ) : plan.popular ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                      <div className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium">
                        <Star className="h-3 w-3" />
                        {t.popularBadge}
                      </div>
                    </div>
                  ) : null}

                  <CardHeader className="rtl:text-right">
                    <CardTitle className="text-2xl">{plan.title}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-grow rtl:text-right">
                    <div className="mb-6 flex items-baseline rtl:flex-row-reverse rtl:justify-end">
                      <span className="text-4xl font-bold">{plan.price}</span>
                    </div>

                    <ul className="space-y-3">
                      {plan.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 rtl:space-x-reverse"
                        >
                          <Check className="h-4 w-4" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter>
                    {buttonProps.showButton && (
                      <CheckoutButton
                        planId={plan.id}
                        lang={lang}
                        SubscribeText={buttonProps.text}
                        RedirectingText={t.redirecting_button}
                        popular={plan.popular && !isCurrentPlan}
                        disabled={buttonProps.disabled}
                        variant={buttonProps.variant}
                        hasActivePaidSubscription={!!hasActivePaidSubscription}
                      />
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingPage;
