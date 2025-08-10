import PricingClient from "@/components/admin/PricingClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

type PlanRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  price: string;
  popular?: boolean;
  features: string[];
};

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminPricingPage = async ({ params }: PageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const plans: PlanRow[] = [
    {
      id: "plan-free",
      key: "free",
      name: "Start for Free",
      description:
        "For new users to explore the tools and get familiar with the platform without commitment.",
      price: "$0",
      popular: false,
      features: [
        "30 min/month",
        "1 agent",
        "3 daily uses",
        "Limited tools",
        "No direct support",
        "Watermark on results",
        "No credit card required",
      ],
    },
    {
      id: "plan-starter",
      key: "starter",
      name: "Starter",
      description:
        "Ideal for small businesses and individuals ready to fully automate their interactions.",
      price: "$19 / month",
      popular: false,
      features: [
        "500 min/month",
        "2 agents",
        "Everything in Free, plus:",
        "Advanced analytics",
        "Community support",
        "No watermark",
        "Overage: $0.05/min",
      ],
    },
    {
      id: "plan-pro",
      key: "pro",
      name: "Pro",
      description:
        "For growing companies needing advanced features and full support to scale.",
      price: "$49 / month",
      popular: true,
      features: [
        "2,000 min/month",
        "5 agents",
        "Everything in Starter, plus:",
        "Email & chat support",
        "Full API Access",
        "Voice Cloning (beta)",
        "Overage: $0.03/min",
      ],
    },
    {
      id: "plan-enterprise",
      key: "enterprise",
      name: "Enterprise",
      description:
        "Custom solution for large enterprises requiring integrations and dedicated support.",
      price: "Custom",
      popular: false,
      features: [
        "10,000 min/month",
        "50 agents",
        "Everything in Pro, plus:",
        "Unlimited agents & minutes",
        "Custom integrations",
        "Dedicated support manager",
        "On-premise option",
      ],
    },
  ];

  return <PricingClient lang={lang} dict={dict} initialPlans={plans} />;
};

export default AdminPricingPage;
