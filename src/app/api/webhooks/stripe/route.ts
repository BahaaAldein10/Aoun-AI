/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET_WH ?? "";

// Helper function to map Stripe status to Prisma enum
function mapStripeStatusToPrisma(status?: string): SubscriptionStatus {
  if (!status) return SubscriptionStatus.TRIALING;

  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
    case "past-due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "cancelled":
      return SubscriptionStatus.CANCELED;
    case "trialing":
    case "trial":
      return SubscriptionStatus.TRIALING;
    case "unpaid":
      return SubscriptionStatus.UNPAID;
    case "failed":
      return SubscriptionStatus.FAILED;
    default:
      console.warn(`Unknown Stripe status: ${status}, defaulting to TRIALING`);
      return SubscriptionStatus.TRIALING;
  }
}

// Helper function to safely extract period dates from Stripe subscription
function extractSubscriptionPeriod(subscription: Stripe.Subscription) {
  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;

  // Method 1: Check if subscription has current_period fields (some webhook events include them)
  const subWithPeriod = subscription as any;
  if (subWithPeriod.current_period_start && subWithPeriod.current_period_end) {
    currentPeriodStart = new Date(subWithPeriod.current_period_start * 1000);
    currentPeriodEnd = new Date(subWithPeriod.current_period_end * 1000);
    return { currentPeriodStart, currentPeriodEnd };
  }

  // Method 2: Calculate from billing_cycle_anchor and subscription items
  if (subscription.billing_cycle_anchor && subscription.items?.data?.[0]) {
    const billingAnchor = subscription.billing_cycle_anchor;
    const item = subscription.items.data[0];

    // Get the price interval from the subscription item
    if (item.price?.recurring?.interval) {
      const interval = item.price.recurring.interval;
      const intervalCount = item.price.recurring.interval_count || 1;

      // Calculate current period based on billing cycle anchor
      const now = Math.floor(Date.now() / 1000);
      let periodStart = billingAnchor;

      // Find the current billing period
      while (periodStart < now) {
        const nextPeriod = calculateNextBillingDate(
          periodStart,
          interval,
          intervalCount,
        );
        if (nextPeriod > now) break;
        periodStart = nextPeriod;
      }

      currentPeriodStart = new Date(periodStart * 1000);
      currentPeriodEnd = new Date(
        calculateNextBillingDate(periodStart, interval, intervalCount) * 1000,
      );
    }
  }

  // Method 3: Fallback to start_date for new subscriptions
  if (!currentPeriodStart && subscription.start_date) {
    currentPeriodStart = new Date(subscription.start_date * 1000);

    // Try to calculate end based on first item's price
    if (subscription.items?.data?.[0]?.price?.recurring) {
      const interval = subscription.items.data[0].price.recurring.interval;
      const intervalCount =
        subscription.items.data[0].price.recurring.interval_count || 1;
      const startTimestamp = subscription.start_date;
      const endTimestamp = calculateNextBillingDate(
        startTimestamp,
        interval,
        intervalCount,
      );
      currentPeriodEnd = new Date(endTimestamp * 1000);
    }
  }

  return { currentPeriodStart, currentPeriodEnd };
}

// Helper function to calculate next billing date
function calculateNextBillingDate(
  startTimestamp: number,
  interval: string,
  intervalCount: number,
): number {
  const startDate = new Date(startTimestamp * 1000);

  switch (interval) {
    case "day":
      startDate.setDate(startDate.getDate() + intervalCount);
      break;
    case "week":
      startDate.setDate(startDate.getDate() + intervalCount * 7);
      break;
    case "month":
      startDate.setMonth(startDate.getMonth() + intervalCount);
      break;
    case "year":
      startDate.setFullYear(startDate.getFullYear() + intervalCount);
      break;
    default:
      // Default to 1 month if unknown interval
      startDate.setMonth(startDate.getMonth() + 1);
  }

  return Math.floor(startDate.getTime() / 1000);
}

// Helper function to find user by customer ID or metadata
async function findUserFromStripe(
  stripeCustomerId?: string | null,
  metadata?: any,
) {
  // First try to get user from metadata
  if (metadata?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: metadata.userId },
    });
    if (user) return user;
  }

  // Then try to find by stripe customer ID
  if (stripeCustomerId) {
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId },
    });
    if (user) return user;
  }

  return null;
}

// Check if event was already processed (idempotency)
async function isEventProcessed(eventId: string): Promise<boolean> {
  const existingEvent = await prisma.cacheEntry.findUnique({
    where: { key: `stripe_event_${eventId}` },
  });
  return !!existingEvent;
}

// Mark event as processed
async function markEventProcessed(eventId: string): Promise<void> {
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

export async function POST(req: Request) {
  // Validate environment variables
  if (!endpointSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET_WH environment variable");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  // Get signature and body
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "Stripe webhook signature verification failed:",
      errorMessage,
    );
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${errorMessage}` },
      { status: 400 },
    );
  }

  // Check for duplicate events (idempotency)
  if (await isEventProcessed(event.id)) {
    console.log(`Event ${event.id} already processed, skipping`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log(`Processing Stripe webhook event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      }

      case "invoice.paid": {
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await handleSubscriptionUpdate(
          event.data.object as Stripe.Subscription,
        );
        break;
      }

      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      }

      // Handle invoice payment failures for downgrades
      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
        break;
    }

    await markEventProcessed(event.id);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error processing webhook event ${event.type}:`,
      errorMessage,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Handle checkout session completed
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  console.log("Processing checkout.session.completed");

  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  if (!stripeSubscriptionId) {
    console.warn("No subscription ID in checkout session, skipping");
    return;
  }

  // Retrieve the full subscription object with expanded data to get period info
  const subscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId,
    {
      expand: ["items.data.price", "latest_invoice"],
    },
  );

  // First try to get period from the latest invoice if available
  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;

  if (subscription.latest_invoice) {
    const invoice =
      typeof subscription.latest_invoice === "string"
        ? await stripe.invoices.retrieve(subscription.latest_invoice)
        : subscription.latest_invoice;

    // Get period from invoice line items
    if (invoice.lines?.data?.[0]?.period) {
      const period = invoice.lines.data[0].period;
      currentPeriodStart = period.start ? new Date(period.start * 1000) : null;
      currentPeriodEnd = period.end ? new Date(period.end * 1000) : null;
    }
  }

  // If we couldn't get period from invoice, try to extract from subscription
  if (!currentPeriodStart || !currentPeriodEnd) {
    const extracted = extractSubscriptionPeriod(subscription);
    currentPeriodStart = extracted.currentPeriodStart || currentPeriodStart;
    currentPeriodEnd = extracted.currentPeriodEnd || currentPeriodEnd;
  }

  // Find user
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const user = await findUserFromStripe(stripeCustomerId, session.metadata);

  if (!user) {
    console.warn("No user found for checkout session", {
      customerId: stripeCustomerId,
      metadata: session.metadata,
    });
    return;
  }

  // Extract plan info
  const planId =
    subscription.metadata?.planId || session.metadata?.planId || "";
  const status = mapStripeStatusToPrisma(subscription.status);

  // Create or update subscription
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId },
    update: {
      status,
      currentPeriodStart,
      currentPeriodEnd,
      planId,
      updatedAt: new Date(),
    },
    create: {
      userId: user.id,
      planId,
      stripeSubscriptionId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
    },
  });

  console.log(`Subscription created/updated for user ${user.id}`, {
    stripeSubscriptionId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
  });
}

// Handle invoice paid
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log("Processing invoice.paid");

  // Check for duplicate payment
  if (invoice.id) {
    const existingPayment = await prisma.payment.findFirst({
      where: { providerPaymentId: invoice.id },
    });

    if (existingPayment) {
      console.log(`Payment already exists for invoice ${invoice.id}, skipping`);
      return;
    }
  }

  // Find user by customer ID
  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  const user = await findUserFromStripe(stripeCustomerId);

  if (!user) {
    console.warn(
      `No user found for invoice ${invoice.id}, customer: ${stripeCustomerId}`,
    );
    return;
  }

  // Create payment record
  const amount = (invoice.amount_paid || 0) / 100; // Convert from cents

  // Access subscription field safely using type assertion
  const invoiceWithSubscription = invoice as any;
  const subscriptionId = invoiceWithSubscription.subscription || null;

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount,
      currency: invoice.currency || "usd",
      provider: "stripe",
      providerPaymentId: invoice.id,
      status:
        invoice.status === "paid"
          ? SubscriptionStatus.SUCCEEDED
          : SubscriptionStatus.PENDING,
      meta: {
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        subscriptionId: subscriptionId,
      },
    },
  });

  // Update subscription if this invoice is for a subscription
  const stripeSubscriptionId =
    typeof subscriptionId === "string" ? subscriptionId : null;

  if (stripeSubscriptionId) {
    // Get period info from invoice line items
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;

    if (invoice.lines?.data?.[0]?.period) {
      const period = invoice.lines.data[0].period;
      currentPeriodStart = period.start ? new Date(period.start * 1000) : null;
      currentPeriodEnd = period.end ? new Date(period.end * 1000) : null;
    }

    const updateData: any = {
      status:
        invoice.status === "paid"
          ? SubscriptionStatus.ACTIVE
          : SubscriptionStatus.PAST_DUE,
      updatedAt: new Date(),
    };

    // Only update period if we have the data
    if (currentPeriodStart) updateData.currentPeriodStart = currentPeriodStart;
    if (currentPeriodEnd) updateData.currentPeriodEnd = currentPeriodEnd;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: updateData,
    });

    console.log(`Subscription updated for invoice ${invoice.id}`, {
      stripeSubscriptionId,
      status: updateData.status,
      currentPeriodStart,
      currentPeriodEnd,
    });
  }

  console.log(`Payment recorded for user ${user.id}, amount: ${amount}`);
}

// Handle subscription updates
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  console.log(`Processing subscription update for ${subscription.id}`);

  const { currentPeriodStart, currentPeriodEnd } =
    extractSubscriptionPeriod(subscription);
  const status = mapStripeStatusToPrisma(subscription.status);

  // Find user by customer ID
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  const user = await findUserFromStripe(
    stripeCustomerId,
    subscription.metadata,
  );

  if (!user) {
    console.warn(
      `No user found for subscription ${subscription.id}, customer: ${stripeCustomerId}`,
    );
    return;
  }

  // Handle scheduled downgrades
  if (subscription.metadata?.scheduledDowngrade === "true") {
    const targetPlanId = subscription.metadata.planId;

    // Update subscription with new plan
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        planId: targetPlanId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        meta: null, // Clear the scheduled downgrade metadata
        updatedAt: new Date(),
      },
    });

    console.log(
      `Scheduled downgrade completed for subscription ${subscription.id}`,
    );
    return;
  }

  // Handle regular updates (upgrades, renewals, etc.)
  const updateData = {
    planId: subscription.metadata?.planId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    updatedAt: new Date(),
  };

  // If this is an upgrade, update the plan immediately
  if (subscription.metadata?.upgradeFrom) {
    updateData.planId = subscription.metadata.planId;
    console.log(
      `Upgrade processed: ${subscription.metadata.upgradeFrom} -> ${subscription.metadata.planId}`,
    );
  }

  const updated = await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: updateData,
  });

  if (updated.count === 0 && user) {
    // Create new subscription if none exists
    const planId = subscription.metadata?.planId || "";
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
    console.log(`New subscription created for user ${user.id}`);
  }

  console.log(`Subscription ${subscription.id} updated`, {
    status,
    currentPeriodStart,
    currentPeriodEnd,
    updatedCount: updated.count,
  });
}
// Handle subscription deletion
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Processing subscription deletion");

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: SubscriptionStatus.CANCELED,
      updatedAt: new Date(),
    },
  });

  console.log(`Subscription ${subscription.id} marked as canceled`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("Processing invoice.payment_failed");

  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  const user = await findUserFromStripe(stripeCustomerId);

  if (!user) {
    console.warn(
      `No user found for failed invoice ${invoice.id}, customer: ${stripeCustomerId}`,
    );
    return;
  }

  // Update subscription status to past due
  const subscriptionId = (invoice as any).subscription;
  if (subscriptionId) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        updatedAt: new Date(),
      },
    });

    console.log(
      `Subscription ${subscriptionId} marked as past due due to payment failure`,
    );
  }

  // Create failed payment record
  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: (invoice.amount_due || 0) / 100,
      currency: invoice.currency || "usd",
      provider: "stripe",
      providerPaymentId: invoice.id,
      status: SubscriptionStatus.FAILED,
      meta: {
        invoiceId: invoice.id,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        subscriptionId: subscriptionId,
        failureReason: "Payment failed",
      },
    },
  });
}
