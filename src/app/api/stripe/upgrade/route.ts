// app/api/stripe/upgrade/route.ts
import { auth } from "@/lib/auth";
import { SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

function mapStripeStatusToPrisma(status?: string) {
  if (!status) return "TRIALING";
  const s = status.toLowerCase();
  switch (s) {
    case "active":
      return "ACTIVE";
    case "past_due":
    case "past-due":
      return "PAST_DUE";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    case "trialing":
    case "trial":
      return "TRIALING";
    case "unpaid":
      return "UNPAID";
    case "failed":
      return "FAILED";
    default:
      return "TRIALING";
  }
}

type Body = {
  planId: string;
  lang: SupportedLang;
};

export async function POST(req: Request) {
  try {
    const { planId, lang } = (await req.json()) as Body;

    if (!planId || !lang) {
      return NextResponse.json(
        { error: "Missing planId or lang" },
        { status: 400 },
      );
    }

    const session = await auth();
    const userId = session?.user.id;

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        subscriptions: {
          where: {
            status: {
              in: ["ACTIVE", "TRIALING", "PAST_DUE"],
            },
          },
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
    if (!targetPlan.stripePriceId) {
      return NextResponse.json(
        { error: "Plan not configured with Stripe price" },
        { status: 500 },
      );
    }

    const currentSubscription = user.subscriptions?.[0];
    if (!currentSubscription?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription to upgrade" },
        { status: 400 },
      );
    }

    // Ensure Stripe customer exists
    let stripeCustomerId = user.stripeCustomerId;
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

    const subscription = await stripe.subscriptions.retrieve(
      currentSubscription.stripeSubscriptionId,
      {
        expand: ["items.data.price", "latest_invoice"],
      },
    );

    if (!subscription || !subscription.items?.data?.length) {
      return NextResponse.json(
        { error: "Invalid subscription" },
        { status: 400 },
      );
    }

    const subscriptionItemId = subscription.items.data[0].id;
    const newPriceId = targetPlan.stripePriceId;

    // Perform the subscription update (swap price on the existing subscription)
    const updated = await stripe.subscriptions.update(subscription.id, {
      items: [{ id: subscriptionItemId, price: newPriceId, quantity: 1 }],
      proration_behavior: "create_prorations",
      metadata: {
        ...(subscription.metadata ?? {}),
        planId: targetPlan.id,
        planName: targetPlan.name,
      },
      expand: ["latest_invoice", "items.data.price"],
    });

    const latestInvoice = updated.latest_invoice as Stripe.Invoice | undefined;

    // Check if payment is required
    if (
      latestInvoice &&
      typeof latestInvoice !== "string" &&
      latestInvoice.status !== "paid" &&
      latestInvoice.hosted_invoice_url
    ) {
      // Payment required - redirect to hosted invoice
      return NextResponse.json({
        status: "payment_required",
        invoiceUrl: latestInvoice.hosted_invoice_url,
      });
    }

    // Payment succeeded or no payment required - upgrade complete
    return NextResponse.json({
      status: "success",
      message: "Upgrade completed successfully",
      subscription: {
        id: updated.id,
        status: mapStripeStatusToPrisma(updated.status),
        planId: targetPlan.id,
      },
    });
  } catch (error) {
    console.log("[UPGRADE_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
