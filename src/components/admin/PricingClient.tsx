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
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Edit3, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

type PlanRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  price: string;
  popular?: boolean;
  features: string[];
};

const PricingClient = ({
  initialPlans,
  dict,
}: {
  initialPlans: PlanRow[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.admin_pricing;
  const [plans, setPlans] = useState<PlanRow[]>(initialPlans ?? []);

  const togglePopular = (id: string) => {
    setPlans((p) =>
      p.map((pl) => (pl.id === id ? { ...pl, popular: !pl.popular } : pl)),
    );
    toast.success(t.toast_toggled_popular);
  };

  const handleEdit = (id: string) => {
    toast.success(t.toast_edit_placeholder);
  };

  const handleDelete = (id: string) => {
    if (!confirm(t.confirm_delete)) return;
    setPlans((p) => p.filter((pl) => pl.id !== id));
    toast.success(t.toast_deleted);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground">{t.description}</p>
        </div>
        <div>
          <Button onClick={() => toast(t.toast_create_placeholder)}>
            {t.create_button}
          </Button>
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
                    {plan.name}
                    {plan.popular && (
                      <Badge variant="default">
                        {t.popular_badge ?? "Popular"}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="text-muted-foreground mt-2 text-sm">
                    {plan.description}
                  </div>
                </div>
                {plan.popular && <Star className="text-yellow-400" />}
              </CardHeader>

              <CardContent>
                <div className="mb-3 text-2xl font-bold">{plan.price}</div>
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f, i) => (
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
                      onClick={() => handleEdit(plan.id)}
                    >
                      <Edit3 className="mr-2 h-4 w-4" /> {t.edit_button}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePopular(plan.id)}
                    >
                      {plan.popular ? t.unmark_popular : t.mark_popular}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(plan.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> {t.delete_button}
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default PricingClient;
