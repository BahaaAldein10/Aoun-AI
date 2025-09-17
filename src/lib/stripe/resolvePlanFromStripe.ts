import { prisma } from "@/lib/prisma";
import { PlanName } from "@prisma/client";
import Stripe from "stripe";

/**
 * Resolve a Plan ID (your DB plan.id) from a Stripe subscription object.
 * Resolution order:
 *  1) subscription.metadata.planId
 *  2) first subscription item price id -> prisma.plan.stripePriceId
 *  3) subscription.metadata.planName -> lookup by name only (no lang)
 *  4) existing local subscription row that matches stripeSubscriptionId
 */
export async function resolvePlanIdFromStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // 1) price id from first item (most reliable)
  const firstItem = subscription.items?.data?.[0];
  const priceObj = firstItem?.price;
  let priceId: string | null = null;

  if (typeof priceObj === "string") {
    priceId = priceObj;
  } else if (priceObj && typeof priceObj === "object" && "id" in priceObj) {
    priceId = (priceObj as Stripe.Price).id;
  }

  if (priceId) {
    const p = await prisma.plan.findFirst({
      where: { stripePriceId: priceId },
    });
    if (p) return p.id;
  }

  // 2) metadata.planId (fallback)
  const planIdFromMeta = subscription.metadata?.planId as string | undefined;
  if (planIdFromMeta) {
    const p = await prisma.plan.findUnique({ where: { id: planIdFromMeta } });
    if (p) return p.id;
  }

  // 3) metadata.planName only (fallback)
  const planName = subscription.metadata?.planName as PlanName;
  if (planName) {
    const p = await prisma.plan.findUnique({
      where: { name: planName },
    });
    if (p) return p.id;
  }

  // 4) fallback: existing subscription entry
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    include: { plan: true },
  });
  if (existing?.planId) return existing.planId;

  return null;
}
