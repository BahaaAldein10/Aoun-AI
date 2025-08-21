import SubscriptionsClient from "@/components/admin/SubscriptionsClient";
import { SubscriptionWithUserWithPlan } from "@/components/admin/SubscriptionsColumns";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

export default async function AdminSubscriptionsPage({ params }: PageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const subscriptions = (await prisma.subscription.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
      plan: { select: { name: true, priceAmount: true, interval: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as SubscriptionWithUserWithPlan[];

  return (
    <SubscriptionsClient
      initialSubscriptions={subscriptions}
      lang={lang}
      dict={dict}
    />
  );
}
