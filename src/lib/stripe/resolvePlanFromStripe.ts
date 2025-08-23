import { prisma } from "@/lib/prisma";
import type { PlanName } from "@prisma/client";
import Stripe from "stripe";

/**
 * Resolve a Plan ID (your DB plan.id) from a Stripe subscription object.
 * Resolution order:
 *  1) subscription.metadata.planId
 *  2) first subscription item price id -> prisma.plan.stripePriceId
 *  3) subscription.metadata.planName + planLang -> composite lookup
 *  4) existing local subscription row that matches stripeSubscriptionId
 */
export async function resolvePlanIdFromStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // 1) metadata.planId
  const planIdFromMeta = subscription.metadata?.planId as string | undefined;
  if (planIdFromMeta) {
    const p = await prisma.plan.findUnique({ where: { id: planIdFromMeta } });
    if (p) return p.id;
  }

  // 2) price id from first item (most reliable)
  const priceId =
    subscription.items?.data?.[0]?.price?.id ??
    // defensive fallback shapes
    (subscription.items?.data?.[0]?.price as Stripe.Price) ??
    null;

  if (priceId) {
    const p = await prisma.plan.findFirst({
      where: { stripePriceId: priceId },
    });
    if (p) return p.id;
  }

  // 3) metadata.planName + planLang
  const planName = subscription.metadata?.planName as PlanName | undefined;
  const planLang = subscription.metadata?.planLang as string | undefined;
  if (planName && planLang) {
    const p = await prisma.plan.findUnique({
      where: { name_lang: { name: planName, lang: planLang } },
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
