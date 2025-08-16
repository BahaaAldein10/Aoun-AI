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
import { ArrowDown, ArrowUp, Check, Clock, Star } from "lucide-react";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ lang: SupportedLang }>;
};

// Type for the subscription meta field
interface SubscriptionMeta {
  scheduledDowngrade?: {
    targetPlanId: string;
    effectiveDate: string;
    scheduledAt: string;
  };
  lastUpgrade?: {
    from: string;
    to: string;
    timestamp: string;
  };
  [key: string]: unknown;
}

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
    orderBy: { priceAmount: "asc" },
  });

  // Helper function to safely parse meta
  const getSubscriptionMeta = (meta: unknown): SubscriptionMeta | null => {
    if (!meta || typeof meta !== "object") return null;
    return meta as SubscriptionMeta;
  };

  const getButtonProps = (plan: Plan) => {
    const isCurrentPlan = currentSubscription?.planId === plan.id;
    const isFree = plan.priceAmount === 0;
    const currentPlanAmount = currentSubscription?.plan?.priceAmount || 0;
    const targetPlanAmount = plan.priceAmount || 0;
    const meta = getSubscriptionMeta(currentSubscription?.meta);

    if (isCurrentPlan) {
      // Check for scheduled downgrades
      const scheduledDowngrade = meta?.scheduledDowngrade;
      if (scheduledDowngrade) {
        return {
          text: `${t.currentPlan || "Current Plan"} (${t.downgradingOn || "Downgrading on"} ${new Date(scheduledDowngrade.effectiveDate).toLocaleDateString()})`,
          disabled: true,
          variant: "secondary" as const,
          isCurrentPlan: true,
        };
      }

      return {
        text: t.currentPlan || "Current Plan",
        disabled: true,
        variant: "secondary" as const,
        isCurrentPlan: true,
      };
    }

    if (isFree) {
      if (currentSubscription) {
        return {
          text: t.downgrade || "Downgrade",
          disabled: false,
          variant: "outline" as const,
          isDowngrade: true,
        };
      }
      return {
        text: t.getStarted || "Get Started",
        disabled: false,
        variant: plan.popular ? ("default" as const) : ("outline" as const),
      };
    }

    // Check if user is downgrading or upgrading
    if (currentSubscription?.plan) {
      if (targetPlanAmount > currentPlanAmount) {
        return {
          text: t.upgrade || "Upgrade",
          disabled: false,
          variant: plan.popular ? ("default" as const) : ("outline" as const),
          isUpgrade: true,
        };
      } else if (targetPlanAmount < currentPlanAmount) {
        return {
          text: t.downgrade || "Downgrade",
          disabled: false,
          variant: "outline" as const,
          isDowngrade: true,
        };
      }
    }

    return {
      text: t.subscribe || "Subscribe",
      disabled: false,
      variant: plan.popular ? ("default" as const) : ("outline" as const),
    };
  };

  const meta = getSubscriptionMeta(currentSubscription?.meta);
  const hasScheduledDowngrade = meta?.scheduledDowngrade;

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
            <div className="bg-muted rounded-lg p-4">
              <p className="text-muted-foreground text-sm">
                {t.currentlyOn || "You're currently on"}:{" "}
                <span className="text-foreground font-medium">
                  {currentSubscription.plan.title}
                </span>
                {currentSubscription.currentPeriodEnd && (
                  <span>
                    {" "}
                    - {t.renewsOn || "Renews on"}{" "}
                    {new Date(
                      currentSubscription.currentPeriodEnd,
                    ).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>

            {/* Show scheduled downgrade alert */}
            {hasScheduledDowngrade && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  {t.scheduledDowngrade || "You have a scheduled plan change."}
                  Your plan will change to{" "}
                  <strong>
                    {
                      plans.find(
                        (p) => p.id === hasScheduledDowngrade.targetPlanId,
                      )?.title
                    }
                  </strong>{" "}
                  on{" "}
                  {new Date(
                    hasScheduledDowngrade.effectiveDate,
                  ).toLocaleDateString()}
                  .
                </AlertDescription>
              </Alert>
            )}

            {/* Show past due alert */}
            {currentSubscription.status === SubscriptionStatus.PAST_DUE && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t.pastDueWarning ||
                    "Your subscription payment is past due. Please update your payment method to continue using the service."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="mt-16 flex flex-col items-center gap-10">
          {/* Main Plans */}
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-3">
            {plans.map((plan) => {
              const buttonProps = getButtonProps(plan);
              const isCurrentPlan = currentSubscription?.planId === plan.id;
              const currentPlanAmount =
                currentSubscription?.plan?.priceAmount || 0;
              const targetPlanAmount = plan.priceAmount || 0;
              const isUpgrade =
                currentSubscription && targetPlanAmount > currentPlanAmount;
              const isDowngrade =
                currentSubscription &&
                targetPlanAmount < currentPlanAmount &&
                targetPlanAmount >= 0;

              return (
                <Card
                  key={plan.name}
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
                        {t.currentPlan || "Current Plan"}
                      </div>
                    </div>
                  ) : plan.popular ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                      <div className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium">
                        <Star className="h-3 w-3" />
                        {t.popularBadge || "Most Popular"}
                      </div>
                    </div>
                  ) : isUpgrade ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                      <div className="flex items-center gap-1 rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white">
                        <ArrowUp className="h-3 w-3" />
                        {t.upgrade || "Upgrade"}
                      </div>
                    </div>
                  ) : isDowngrade ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                      <div className="flex items-center gap-1 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white">
                        <ArrowDown className="h-3 w-3" />
                        {t.downgrade || "Downgrade"}
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
                    <CheckoutButton
                      planId={plan.id}
                      lang={lang}
                      SubscribeText={buttonProps.text}
                      RedirectingText={t.redirecting_button || "Redirecting..."}
                      popular={plan.popular && !isCurrentPlan}
                      disabled={buttonProps.disabled}
                      variant={buttonProps.variant}
                      isCurrentPlan={buttonProps.isCurrentPlan}
                      isUpgrade={buttonProps.isUpgrade}
                      isDowngrade={buttonProps.isDowngrade}
                    />
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
