"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Dictionary } from "@/contexts/dictionary-context";
import { togglePlanPopular } from "@/lib/actions/plan";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Plan } from "@prisma/client";
import { Edit3, Star } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import Spinner from "../shared/Spinner";
import EditPlanDialog from "./EditPlanDialog";

const PricingClient = ({
  initialPlans: plans,
  dict,
  lang,
}: {
  initialPlans: Plan[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.admin_pricing;
  const [isOpen, setIsOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  const isRtl = lang === "ar";

  const togglePopular = async (id: string) => {
    try {
      setLoading(true);
      await togglePlanPopular(id, lang);
      toast.success(t.toast_toggled_popular);
    } catch (error) {
      console.log(error);
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plan: Plan) => {
    setPlan(plan);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground">{t.description}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {plans.length === 0 ? (
          <div className="text-muted-foreground col-span-full text-center">
            {t.empty_state}
          </div>
        ) : (
          plans.map((plan) => (
            <Card
              key={plan.id}
              className={cn(plan.popular ? "ring-primary ring-2" : "")}
            >
              <CardHeader className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {isRtl ? plan.titleAr : plan.titleEn}
                    {plan.popular && (
                      <Badge variant="default">
                        {t.popular_badge ?? "Popular"}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="text-muted-foreground mt-2 text-sm">
                    {isRtl ? plan.descriptionAr : plan.descriptionEn}
                  </div>
                </div>
                {plan.popular && <Star className="text-yellow-400" />}
              </CardHeader>

              <CardContent>
                <div className="mb-3 text-2xl font-bold">
                  {isRtl ? plan.priceAr : plan.priceEn}
                </div>
                <ul className="space-y-2 text-sm">
                  {(isRtl ? plan.featuresAr : plan.featuresEn).map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col gap-2">
                <div className="flex w-full items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(plan)}
                    >
                      <Edit3 className="mr-2 h-4 w-4" /> {t.edit_button}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePopular(plan.id)}
                      disabled={loading}
                    >
                      {loading ? (
                        <Spinner />
                      ) : plan.popular ? (
                        t.unmark_popular
                      ) : (
                        t.mark_popular
                      )}
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      <EditPlanDialog
        isOpen={isOpen}
        plan={plan}
        onClose={() => setIsOpen(false)}
        lang={lang}
        t={t}
      />
    </div>
  );
};

export default PricingClient;
