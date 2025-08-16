import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // Handle FREE plan signup (new users or cancellation to free)
    if (targetPlan.name === "FREE") {
      if (currentSubscription?.stripeSubscriptionId) {
        // Cancel current Stripe subscription immediately
        await stripe.subscriptions.cancel(
          currentSubscription.stripeSubscriptionId,
        );

        // Update local subscription to canceled
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            status: SubscriptionStatus.CANCELED,
            updatedAt: new Date(),
          },
        });

        // Create new free subscription
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: targetPlan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
          },
        });
      } else {
        // Create free subscription for new users
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: targetPlan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
          },
        });
      }
      return NextResponse.json({
        url: null,
        message: "Successfully switched to free plan!",
      });
    }

    // Check if user already has an active paid subscription
    if (currentSubscription && currentSubscription.plan.name !== "FREE") {
      return NextResponse.json(
        {
          error:
            "You already have an active subscription. Please cancel your current subscription before subscribing to a new plan.",
        },
        { status: 400 },
      );
    }

    // Handle new paid subscription
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

    // Create new Stripe checkout session
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
      line_items: [{ price: targetPlan.stripePriceId!, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId: user.id,
          planId: targetPlan.id,
          subscriptionType: "new",
        },
      },
    };

    const checkoutSession =
      await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe create-session error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
