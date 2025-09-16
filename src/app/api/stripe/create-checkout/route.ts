// app/api/stripe/create-checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { planId, lang } = body as { planId: string; lang: string };

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
              in: [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.TRIALING,
                SubscriptionStatus.PAST_DUE,
              ],
            },
          },
          include: { plan: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!targetPlan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Enterprise plan handling - should not reach here as it's handled on frontend
    if (targetPlan.name.toUpperCase() === "ENTERPRISE") {
      return NextResponse.json(
        { error: "Enterprise plans require direct contact" },
        { status: 400 },
      );
    }

    const currentSubscription = user.subscriptions[0];

    // All plans now require a stripePriceId since there's no FREE plan
    const stripePriceId = targetPlan.stripePriceId;
    if (!stripePriceId) {
      console.error("Plan missing stripePriceId", { planId: targetPlan.id });
      return NextResponse.json(
        { error: "Plan not configured with Stripe price" },
        { status: 500 },
      );
    }

    // Ensure Stripe customer exists for user
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

    const subscriptionMetadata = {
      userId: user.id,
      planId: targetPlan.id,
      planName: targetPlan.name,
    };

    // Handle subscription updates vs new subscriptions
    let sessionParams: Stripe.Checkout.SessionCreateParams;

    if (currentSubscription?.stripeSubscriptionId) {
      // User has existing subscription - create checkout for subscription update
      sessionParams = {
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
        line_items: [{ price: stripePriceId, quantity: 1 }],
        subscription_data: {
          metadata: subscriptionMetadata,
        },
        // Add metadata to identify this as a plan change
        metadata: {
          userId: user.id,
          planId: targetPlan.id,
          oldSubscriptionId: currentSubscription.stripeSubscriptionId,
          action: "change_plan",
        },
      };
    } else {
      // New subscription
      sessionParams = {
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
        line_items: [{ price: stripePriceId, quantity: 1 }],
        subscription_data: {
          metadata: subscriptionMetadata,
        },
        metadata: {
          userId: user.id,
          planId: targetPlan.id,
          action: "new_subscription",
        },
      };
    }

    const checkoutSession =
      await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe create-session error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
