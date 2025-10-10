import ReportsClient from "@/components/dashboard/ReportsClient";
import { getReportsData } from "@/lib/actions/getReportsData";
import { auth } from "@/lib/auth";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { PlanName, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";

type ReportsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

const ReportsPage = async ({ params }: ReportsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return redirect(`/${lang}/auth/login`);

  // Check if user has an active subscription with report access
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
    orderBy: {
      createdAt: "desc",
    },
  });

  const isAdmin = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { role: true },
    })
    .then((user) => user?.role === "ADMIN")
    .catch(() => false);

  // Determine if user has access to reports
  // Reports are available for STARTER, PRO, and ENTERPRISE plans
  // Not available for FREE and MAINTENANCE plans
  const hasReportAccess =
    !!(
      subscription &&
      subscription.plan.name !== PlanName.FREE &&
      subscription.plan.name !== PlanName.MAINTENANCE
    ) || isAdmin;

  // Get data only for users with report access, provide empty data otherwise
  const data = hasReportAccess
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
      hasPaidPlan={hasReportAccess}
    />
  );
};

export default ReportsPage;
