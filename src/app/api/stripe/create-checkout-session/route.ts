import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Plan, Subscription } from "@prisma/client";
import { SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { planId, lang } = body;

    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        subscriptions: {
          where: {
            status: {
              in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
            },
          },
          include: { plan: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Look up target plan in DB
    const targetPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!targetPlan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Get current active subscription
    const currentSubscription = user.subscriptions[0];

    // Handle FREE plan signup (new users or downgrades to free)
    if (targetPlan.name === "FREE") {
      if (currentSubscription?.stripeSubscriptionId) {
        // Cancel current Stripe subscription
        await stripe.subscriptions.update(
          currentSubscription.stripeSubscriptionId,
          {
            cancel_at_period_end: true,
          },
        );

        // Update local subscription to cancel at period end
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: { cancelAtPeriodEnd: true },
        });
      } else {
        // Create free subscription for new users
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: targetPlan.id,
            status: "ACTIVE",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
          },
        });
      }
      return NextResponse.json({ url: null });
    }

    const stripePriceId = targetPlan.stripePriceId;
    if (!stripePriceId) {
      return NextResponse.json(
        { error: "Plan not configured with Stripe price" },
        { status: 500 },
      );
    }

    // Ensure user has Stripe customer ID
    let stripeCustomerId = user.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    // Handle upgrade/downgrade logic
    if (currentSubscription?.stripeSubscriptionId) {
      return handleSubscriptionChange(
        currentSubscription,
        targetPlan,
        stripeCustomerId,
      );
    } else {
      // New subscription
      return handleNewSubscription(targetPlan, stripeCustomerId, user.id, lang);
    }
  } catch (error) {
    console.error("Stripe create-session error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleSubscriptionChange(
  currentSubscription: Subscription & { plan: Plan },
  targetPlan: Plan,
  stripeCustomerId: string,
) {
  const currentPlanAmount = currentSubscription.plan.priceAmount || 0;
  const targetPlanAmount = targetPlan.priceAmount || 0;

  if (targetPlanAmount > currentPlanAmount) {
    // UPGRADE - immediate change with proration
    return handleUpgrade(currentSubscription, targetPlan);
  } else if (targetPlanAmount < currentPlanAmount) {
    // DOWNGRADE - schedule change at period end
    return handleDowngrade(currentSubscription, targetPlan);
  } else {
    // Same price - shouldn't happen but handle gracefully
    return NextResponse.json(
      {
        error: "You are already on this plan",
      },
      { status: 400 },
    );
  }
}

async function handleUpgrade(
  currentSubscription: Subscription & { plan: Plan },
  targetPlan: Plan,
) {
  try {
    if (!currentSubscription.stripeSubscriptionId)
      throw new Error("Missing Stripe subscription ID");
    if (!targetPlan.stripePriceId) throw new Error("Missing Stripe price ID");
    const subId = currentSubscription.stripeSubscriptionId;
    const priceId = targetPlan.stripePriceId;
    const itemId = (await stripe.subscriptions.retrieve(subId)).items.data[0]
      .id;
    await stripe.subscriptions.update(subId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
      metadata: {
        userId: currentSubscription.userId,
        planId: targetPlan.id,
        upgradeFrom: currentSubscription.planId,
      },
    });

    // Update local subscription
    await prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        planId: targetPlan.id,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      url: null,
      message: "Upgrade successful! Your new plan is active immediately.",
    });
  } catch (error) {
    console.error("Upgrade error:", error);
    throw error;
  }
}

async function handleDowngrade(
  currentSubscription: Subscription & { plan: Plan },
  targetPlan: Plan,
) {
  try {
    if (!currentSubscription.stripeSubscriptionId)
      throw new Error("Missing Stripe subscription ID");
    if (!targetPlan.stripePriceId) throw new Error("Missing Stripe price ID");
    const subId = currentSubscription.stripeSubscriptionId;
    const priceId = targetPlan.stripePriceId;
    const itemId = (await stripe.subscriptions.retrieve(subId)).items.data[0]
      .id;
    await stripe.subscriptions.update(subId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "none", // No proration for downgrades
      metadata: {
        userId: currentSubscription.userId,
        planId: targetPlan.id,
        downgradeFrom: currentSubscription.planId,
        scheduledDowngrade: "true",
      },
    });

    // Update local subscription to reflect the scheduled change
    await prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        // Keep current plan until period ends
        meta: {
          scheduledDowngrade: {
            targetPlanId: targetPlan.id,
            effectiveDate: currentSubscription.currentPeriodEnd,
          },
        },
        updatedAt: new Date(),
      },
    });

    const effectiveDate = currentSubscription.currentPeriodEnd
      ? new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()
      : "period end";
    return NextResponse.json({
      url: null,
      message: `Downgrade scheduled! Your plan will change to ${targetPlan.title} on ${effectiveDate}.`,
    });
  } catch (error) {
    console.error("Downgrade error:", error);
    throw error;
  }
}

async function handleNewSubscription(
  targetPlan: Plan,
  stripeCustomerId: string,
  userId: string,
  lang: string,
) {
  if (!targetPlan.stripePriceId) throw new Error("Missing Stripe price ID");
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    success_url:
      lang === "en"
        ? process.env.STRIPE_SUCCESS_URL_EN!
        : process.env.STRIPE_SUCCESS_URL_AR!,
    cancel_url:
      lang === "en"
        ? process.env.STRIPE_CANCEL_URL_EN!
        : process.env.STRIPE_CANCEL_URL_AR!,
    payment_method_types: ["card"],
    customer: stripeCustomerId,
    line_items: [{ price: targetPlan.stripePriceId, quantity: 1 }],
    subscription_data: {
      metadata: {
        userId: userId,
        planId: targetPlan.id,
        subscriptionType: "new",
      },
    },
  };

  const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.json({ url: checkoutSession.url });
}
