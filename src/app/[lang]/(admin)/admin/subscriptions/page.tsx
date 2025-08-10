import SubscriptionsClient from "@/components/admin/SubscriptionsClient";
import { Subscription } from "@/components/admin/SubscriptionsColumns";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type PageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function AdminSubscriptionsPage({ params }: PageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const subs: Subscription[] = [
    {
      id: "SUBS-001",
      userId: "USER-001",
      userName: "John Doe",
      userEmail: "john@example.com",
      plan: "Pro",
      price: 49,
      currency: "USD",
      billingCycle: "monthly",
      status: "active",
      startedAt: new Date("2024-01-15T08:00:00Z"),
      expiresAt: new Date("2024-02-15T08:00:00Z"),
    },
    {
      id: "SUBS-002",
      userId: "USER-002",
      userName: "Jane Smith",
      userEmail: "jane@example.com",
      plan: "Starter",
      price: 0,
      currency: "USD",
      billingCycle: "monthly",
      status: "trialing",
      startedAt: new Date("2024-04-01T10:00:00Z"),
      expiresAt: new Date("2024-04-15T10:00:00Z"),
    },
    {
      id: "SUBS-003",
      userId: "USER-003",
      userName: "Acme Corp",
      userEmail: "billing@acme.com",
      plan: "Enterprise",
      price: 499,
      currency: "USD",
      billingCycle: "yearly",
      status: "past_due",
      startedAt: new Date("2023-06-01T12:00:00Z"),
      expiresAt: new Date("2024-06-01T12:00:00Z"),
    },
    {
      id: "SUBS-004",
      userId: "USER-004",
      userName: "Alice Johnson",
      userEmail: "alice@example.com",
      plan: "Starter",
      price: 0,
      currency: "USD",
      billingCycle: "monthly",
      status: "canceled",
      startedAt: new Date("2022-08-01T12:00:00Z"),
      expiresAt: null,
    },
  ];

  return (
    <>
      <SubscriptionsClient
        initialSubscriptions={subs}
        lang={lang}
        dict={dict}
      />
    </>
  );
}
