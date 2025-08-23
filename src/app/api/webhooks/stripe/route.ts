/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/stripe/webhook/route.ts
import { prisma } from "@/lib/prisma";
import { resolvePlanIdFromStripeSubscription } from "@/lib/stripe/resolvePlanFromStripe";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET_WH ?? "";

async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await prisma.cacheEntry.findUnique({
    where: { key: `stripe_event_${eventId}` },
  });
  return !!existing;
}

async function markEventProcessed(eventId: string) {
  await prisma.cacheEntry.upsert({
    where: { key: `stripe_event_${eventId}` },
    update: { updatedAt: new Date() },
    create: {
      key: `stripe_event_${eventId}`,
      value: { processed: true },
      type: "GENERIC",
    },
  });
}

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

function extractSubscriptionPeriod(subscription: Stripe.Subscription) {
  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;

  const sub: any = subscription;
  if (sub.current_period_start && sub.current_period_end) {
    currentPeriodStart = new Date(sub.current_period_start * 1000);
    currentPeriodEnd = new Date(sub.current_period_end * 1000);
    return { currentPeriodStart, currentPeriodEnd };
  }

  if (
    subscription.start_date &&
    subscription.items?.data?.[0]?.price?.recurring
  ) {
    const start = new Date(subscription.start_date * 1000);
    const interval = subscription.items.data[0].price.recurring.interval;
    const count =
      subscription.items.data[0].price.recurring.interval_count || 1;
    const end = new Date(start);
    switch (interval) {
      case "day":
        end.setDate(end.getDate() + count);
        break;
      case "week":
        end.setDate(end.getDate() + count * 7);
        break;
      case "month":
        end.setMonth(end.getMonth() + count);
        break;
      case "year":
        end.setFullYear(end.getFullYear() + count);
        break;
      default:
        end.setMonth(end.getMonth() + 1);
    }
    currentPeriodStart = start;
    currentPeriodEnd = end;
  }

  return { currentPeriodStart, currentPeriodEnd };
}

export async function POST(req: Request) {
  if (!endpointSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET_WH env var");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Stripe signature verification failed:", errMsg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip if processed
  if (await isEventProcessed(event.id)) {
    console.log(`Skipping already processed event ${event.id}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log(`Processing Stripe event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // If session.subscription is a string id, retrieve the subscription
        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;

        if (!stripeSubscriptionId) {
          console.warn("checkout.session.completed without subscription id");
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          {
            expand: ["items.data.price", "latest_invoice"],
          },
        );

        const { currentPeriodStart, currentPeriodEnd } =
          subscription.latest_invoice &&
          typeof subscription.latest_invoice !== "string"
            ? (() => {
                const invoice = subscription.latest_invoice as Stripe.Invoice;
                if (invoice.lines?.data?.[0]?.period) {
                  const p = invoice.lines.data[0].period;
                  return {
                    currentPeriodStart: p.start
                      ? new Date(p.start * 1000)
                      : null,
                    currentPeriodEnd: p.end ? new Date(p.end * 1000) : null,
                  };
                }
                return { currentPeriodStart: null, currentPeriodEnd: null };
              })()
            : extractSubscriptionPeriod(subscription);

        // Find user by session.customer or session.metadata
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : null;
        let user = null;
        if (session.metadata?.userId) {
          user = await prisma.user.findUnique({
            where: { id: session.metadata.userId },
          });
        }
        if (!user && stripeCustomerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId } });
        }
        if (!user) {
          console.warn("No user found for checkout session", {
            stripeCustomerId,
            metadata: session.metadata,
          });
          break;
        }

        // Resolve planId robustly
        const planId = await resolvePlanIdFromStripeSubscription(subscription);
        if (!planId) {
          console.warn("No planId resolved for subscription", subscription.id);
          break;
        }

        // Cancel any other active subscriptions (safety)
        await prisma.subscription.updateMany({
          where: {
            userId: user.id,
            status: { in: ["ACTIVE", "TRIALING"] },
            stripeSubscriptionId: { not: stripeSubscriptionId },
          },
          data: { status: "CANCELED" },
        });

        // Upsert subscription record
        await prisma.subscription.upsert({
          where: { stripeSubscriptionId },
          update: {
            status: mapStripeStatusToPrisma(subscription.status),
            planId,
            currentPeriodStart,
            currentPeriodEnd,
            updatedAt: new Date(),
          },
          create: {
            userId: user.id,
            planId,
            stripeSubscriptionId,
            status: mapStripeStatusToPrisma(subscription.status),
            currentPeriodStart,
            currentPeriodEnd,
          },
        });

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Avoid duplicate payments
        if (invoice.id) {
          const existing = await prisma.payment.findFirst({
            where: { providerPaymentId: invoice.id },
          });
          if (existing) {
            console.log(`Payment for invoice ${invoice.id} already recorded`);
            break;
          }
        }

        const stripeCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : null;
        let user = null;
        if (invoice.metadata?.userId) {
          user = await prisma.user.findUnique({
            where: { id: invoice.metadata.userId },
          });
        }
        if (!user && stripeCustomerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId } });
        }
        if (!user) {
          console.warn("No user found for invoice.paid", invoice.id, {
            stripeCustomerId,
            metadata: invoice.metadata,
          });
          break;
        }

        const amount = (invoice.amount_paid || 0) / 100;
        const subscriptionId = (invoice as any).subscription || null;

        await prisma.payment.create({
          data: {
            userId: user.id,
            amount,
            currency: invoice.currency ?? "usd",
            provider: "stripe",
            providerPaymentId: invoice.id,
            status: invoice.status === "paid" ? "SUCCEEDED" : "PENDING",
            meta: {
              invoiceId: invoice.id,
              amountPaid: invoice.amount_paid,
              currency: invoice.currency,
              subscriptionId,
            },
          },
        });

        if (subscriptionId) {
          // Extract period from invoice lines if possible
          let currentPeriodStart: Date | null = null;
          let currentPeriodEnd: Date | null = null;
          if (invoice.lines?.data?.[0]?.period) {
            const p = invoice.lines.data[0].period;
            currentPeriodStart = p.start ? new Date(p.start * 1000) : null;
            currentPeriodEnd = p.end ? new Date(p.end * 1000) : null;
          }

          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: {
              status: invoice.status === "paid" ? "ACTIVE" : "PAST_DUE",
              currentPeriodStart,
              currentPeriodEnd,
              updatedAt: new Date(),
            },
          });
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const { currentPeriodStart, currentPeriodEnd } =
          extractSubscriptionPeriod(subscription);
        const status = mapStripeStatusToPrisma(subscription.status);
        const stripeCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : null;

        // Find user
        let user = null;
        if (subscription.metadata?.userId) {
          user = await prisma.user.findUnique({
            where: { id: subscription.metadata.userId },
          });
        }
        if (!user && stripeCustomerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId } });
        }
        if (!user) {
          console.warn(
            "No user found for subscription update",
            subscription.id,
            { metadata: subscription.metadata, stripeCustomerId },
          );
          break;
        }

        const planId = await resolvePlanIdFromStripeSubscription(subscription);
        if (!planId) {
          console.warn(
            "No planId resolved for subscription update",
            subscription.id,
          );
          break;
        }

        const updateData: any = {
          planId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          updatedAt: new Date(),
        };

        const updated = await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: updateData,
        });

        if (updated.count === 0) {
          await prisma.subscription.create({
            data: {
              userId: user.id,
              planId,
              stripeSubscriptionId: subscription.id,
              status,
              currentPeriodStart,
              currentPeriodEnd,
            },
          });
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "CANCELED", updatedAt: new Date() },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription || null;
        const stripeCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : null;

        let user = null;
        if (invoice.metadata?.userId)
          user = await prisma.user.findUnique({
            where: { id: invoice.metadata.userId },
          });
        if (!user && stripeCustomerId)
          user = await prisma.user.findFirst({ where: { stripeCustomerId } });

        if (subscriptionId) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: "PAST_DUE", updatedAt: new Date() },
          });
        }

        if (user) {
          await prisma.payment.create({
            data: {
              userId: user.id,
              amount: (invoice.amount_due || 0) / 100,
              currency: invoice.currency ?? "usd",
              provider: "stripe",
              providerPaymentId: invoice.id,
              status: "FAILED",
              meta: {
                invoiceId: invoice.id,
                amountDue: invoice.amount_due,
                currency: invoice.currency,
                subscriptionId,
                failureReason: "Payment failed",
              },
            },
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }

    await markEventProcessed(event.id);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing webhook event ${event.type}:`, message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
