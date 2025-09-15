import ReportsClient from "@/components/dashboard/ReportsClient";
import { getReportsData } from "@/lib/actions/getReportsData";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";

type ReportsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const ReportsPage = async ({ params }: ReportsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return redirect(`/${lang}/auth/login`);

  // Check if user has an active paid subscription
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: {
        in: [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ],
      },
    },
    include: {
      plan: true,
    },
  });

  const hasPaidPlan = !!(subscription && subscription.plan.name !== "FREE");

  // Get data only for paid users, provide empty data for free users
  const data = hasPaidPlan
    ? await getReportsData(userId)
    : {
        monthlyData: [],
        bots: [],
      };

  return (
    <ReportsClient
      lang={lang}
      dict={dict}
      monthlyData={data.monthlyData}
      bots={data.bots}
      hasPaidPlan={hasPaidPlan}
    />
  );
};

export default ReportsPage;
