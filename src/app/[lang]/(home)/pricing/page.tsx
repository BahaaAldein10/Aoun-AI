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
import { getSiteContent } from "@/lib/actions/siteContent";
import { auth } from "@/lib/auth";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { Plan, Subscription, SubscriptionStatus } from "@prisma/client";
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

  const isRtl = lang === "ar";

  const session = await auth();
  let currentSubscription: (Subscription & { plan?: Plan }) | null = null;

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
    orderBy: { priceAmount: "asc" },
  });

  const contactEmail = await getSiteContent({ lang }).then(
    (res) => res?.footer?.contactEmail ?? "",
  );

  const hasSubscription = !!currentSubscription;
  const currentPlanAmount = currentSubscription?.plan?.priceAmount ?? 0;
  const currentPlanId = currentSubscription?.plan?.id ?? null;

  const getButtonProps = (plan: Plan) => {
    const isEnterprise = plan.name.toUpperCase() === "ENTERPRISE";
    const isCurrentPlan = currentPlanId === plan.id;

    // If no subscription: all buttons enabled (subscribe)
    if (!hasSubscription) {
      if (isEnterprise) {
        return {
          text: t.contactUs || "Contact Us",
          variant: "default" as const,
          isCurrentPlan: false,
          showButton: true,
          isEnterprise: true,
          disabled: false,
        };
      }

      return {
        text: t.subscribe,
        variant: plan.popular ? ("default" as const) : ("outline" as const),
        isCurrentPlan: false,
        showButton: true,
        isEnterprise: false,
        disabled: false,
      };
    }

    // If user has a subscription:
    // Enterprise: contact (still enabled)
    if (isEnterprise) {
      return {
        text: t.contactUs || "Contact Us",
        variant: "default" as const,
        isCurrentPlan: false,
        showButton: true,
        isEnterprise: true,
        disabled: false,
      };
    }

    // If it's the current plan -> disabled and marked as current
    if (isCurrentPlan) {
      return {
        text: t.currentPlan,
        variant: "outline" as const,
        isCurrentPlan: true,
        showButton: true,
        isEnterprise: false,
        disabled: true,
      };
    }

    // Determine if plan is lower-or-equal than current -> disable (no downgrades)
    const isLowerOrEqual = (plan.priceAmount ?? 0) <= (currentPlanAmount ?? 0);
    if (isLowerOrEqual) {
      return {
        text: t.switchPlan || "Switch Plan",
        variant: plan.popular ? ("default" as const) : ("outline" as const),
        isCurrentPlan: false,
        showButton: true,
        isEnterprise: false,
        disabled: true,
      };
    }

    // Otherwise it's strictly higher -> allow switching/upgrading
    return {
      text: t.switchPlan || "Switch Plan",
      variant: plan.popular ? ("default" as const) : ("outline" as const),
      isCurrentPlan: false,
      showButton: true,
      isEnterprise: false,
      disabled: false,
    };
  };

  const hasActivePaidSubscription = !!currentSubscription;

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
                      {isRtl
                        ? currentSubscription?.plan?.titleAr
                        : currentSubscription?.plan?.titleEn}
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
              const isCurrentPlan = currentPlanId === plan.id;

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
                    <CardTitle className="text-2xl">
                      {isRtl ? plan.titleAr : plan.titleEn}
                    </CardTitle>
                    <CardDescription>
                      {isRtl ? plan.descriptionAr : plan.descriptionEn}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-grow rtl:text-right">
                    <div className="mb-6 flex items-baseline rtl:flex-row-reverse rtl:justify-end">
                      <span className="text-4xl font-bold">
                        {isRtl ? plan.priceAr : plan.priceEn}
                      </span>
                    </div>

                    <ul className="space-y-3">
                      {(isRtl ? plan.featuresAr : plan.featuresEn).map(
                        (feature, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-2 rtl:space-x-reverse"
                          >
                            <Check className="h-4 w-4" />
                            <span>{feature}</span>
                          </li>
                        ),
                      )}
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
                        hasActivePaidSubscription={hasActivePaidSubscription}
                        hasUserId={!!session?.user.id}
                        isEnterprise={buttonProps.isEnterprise}
                        isCurrentPlan={buttonProps.isCurrentPlan}
                        contactEmail={contactEmail ?? ""}
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
