import UsersClient from "@/components/admin/UsersClient";
import { UserWithSubscriptionWithUsage } from "@/components/admin/UsersColumns";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

type UsersPageProps = { params: Promise<{ lang: SupportedLang }> };

export default async function UsersPage({ params }: UsersPageProps) {
  const { lang, dict } = await getLangAndDict(params);

  const users = (await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      image: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: {
            select: {
              name: true,
              priceAmount: true,
              interval: true,
              minutesPerMonth: true,
            },
          },
        },
      },
      usage: {
        select: {
          minutes: true,
        },
      },
    },
  })) as UserWithSubscriptionWithUsage[];

  return <UsersClient lang={lang} dict={dict} initialUsers={users} />;
}
