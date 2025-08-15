import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs"; // prefer nodejs for stripe in serverless env

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
    });
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Look up plan in DB
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan)
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    if (plan.name === "FREE") {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days example
        },
      });
      return NextResponse.json({ url: null });
    }

    const stripePriceId = plan.stripePriceId;
    if (!stripePriceId) {
      return NextResponse.json(
        { error: "Plan not configured with Stripe price" },
        { status: 500 },
      );
    }

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
      line_items: [{ price: stripePriceId, quantity: 1 }], // <- Stripe price id from DB
      subscription_data: {
        metadata: { userId: user.id, planId: plan.id },
      },
    };

    const checkoutSession =
      await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("stripe create-session error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
