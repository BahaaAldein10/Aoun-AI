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

    const targetPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!targetPlan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // FREE plan handling
    if (targetPlan.name === "FREE") {
      const currentSubscription = user.subscriptions[0];
      if (currentSubscription?.stripeSubscriptionId) {
        await stripe.subscriptions.update(
          currentSubscription.stripeSubscriptionId,
          {
            cancel_at_period_end: true,
          },
        );

        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: { status: "CANCELED", updatedAt: new Date() },
        });
      }

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: targetPlan.id,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
        },
      });

      return NextResponse.json({
        url: null,
        message:
          lang === "ar"
            ? "تم التبديل إلى الخطة المجانية"
            : "Switched to free plan",
      });
    }

    // Paid plan: require a stripePriceId
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
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    };

    const checkoutSession =
      await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe create-session error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
