import PricingClient from "@/components/admin/PricingClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { Plan } from "@prisma/client";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminPricingPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const plans = (await prisma.plan.findMany({
    where: {
      lang,
    },
    orderBy: {
      priceAmount: "asc",
    },
  })) as Plan[];

  return <PricingClient lang={lang} dict={dict} initialPlans={plans} />;
};

export default AdminPricingPage;
