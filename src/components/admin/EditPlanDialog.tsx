"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updatePlan } from "@/lib/actions/plan";
import type { SupportedLang } from "@/lib/dictionaries";
import { planSchema, type PlanFormValues } from "@/lib/schemas/plan";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Plan, PlanName } from "@prisma/client";
import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import Spinner from "../shared/Spinner";

type Props = {
  plan?: Plan | null;
  isOpen: boolean;
  onClose: () => void;
  t: Record<string, string>;
  lang: SupportedLang;
};

export default function EditPlanDialog({
  plan,
  isOpen,
  onClose,
  t,
  lang,
}: Props) {
  const [loading, setLoading] = useState(false);
  const isRtl = lang === "ar";

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "FREE",
      title: "",
      description: "",
      price: "",
      priceAmount: null,
      interval: "month",
      minutesPerMonth: 0,
      agents: 0,
      features: [],
      popular: false,
    },
    mode: "onSubmit",
  });

  const {
    reset,
    setValue,
    watch,
    formState: { isValid },
  } = form;

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name as PlanName,
        title: plan.title ?? "",
        description: plan.description ?? "",
        price: plan.price ?? "",
        priceAmount: plan.priceAmount ?? null,
        interval: plan.interval ?? "month",
        minutesPerMonth: plan.minutesPerMonth ?? 0,
        agents: plan.agents ?? 0,
        features: plan.features ?? [],
        popular: plan.popular ?? false,
      });
    }
  }, [plan, reset]);

  const [newFeature, setNewFeature] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const currentFeatures = watch("features") || [];

  async function onSubmit(values: PlanFormValues) {
    if (!plan?.id) return;

    try {
      setLoading(true);
      await updatePlan({ id: plan.id, data: values, lang });
      toast.success(t.toast_updated || "Plan updated");
      onClose();
    } catch (err) {
      console.error("Plan save error", err);
      toast.error(t.save_failed);
    } finally {
      setLoading(false);
    }
  }

  function handleAddFeature() {
    const f = newFeature.trim();
    if (!f) return;

    // Check for duplicates
    if (currentFeatures.includes(f)) {
      toast.error(t.feature_already_exists || "Feature already exists");
      return;
    }

    setValue("features", [...currentFeatures, f]);
    setNewFeature("");
  }

  function handleRemoveFeature(index: number) {
    const updatedFeatures = currentFeatures.filter((_, i) => i !== index);
    setValue("features", updatedFeatures);
  }

  function handleStartEdit(index: number) {
    setEditingIndex(index);
    setEditingValue(currentFeatures[index]);
  }

  function handleSaveEdit() {
    if (editingIndex === null) return;

    const trimmedValue = editingValue.trim();
    if (!trimmedValue) {
      toast.error(t.feature_cannot_be_empty || "Feature cannot be empty");
      return;
    }

    // Check for duplicates (excluding the current item)
    const isDuplicate = currentFeatures.some(
      (feature, idx) => idx !== editingIndex && feature === trimmedValue,
    );

    if (isDuplicate) {
      toast.error(t.feature_already_exists || "Feature already exists");
      return;
    }

    const updatedFeatures = [...currentFeatures];
    updatedFeatures[editingIndex] = trimmedValue;
    setValue("features", updatedFeatures);

    setEditingIndex(null);
    setEditingValue("");
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setEditingValue("");
  }

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        lang={lang}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t.edit_plan_title ?? "Edit plan"}</DialogTitle>
          <DialogDescription>{t.plan_description ?? ""}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 p-2"
          >
            {/* Plan name (readonly for editing) */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_name ?? "Plan name"}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={
                        field.value === "FREE"
                          ? t.free
                          : field.value === "STARTER"
                            ? t.starter
                            : field.value === "PRO"
                              ? t.pro
                              : field.value === "ENTERPRISE"
                                ? t.enterprise
                                : field.value
                      }
                      readOnly
                      autoFocus={false}
                      className="aria-invalid:border-input select-none aria-invalid:ring-0 dark:aria-invalid:ring-0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_title ?? "Title"}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_description ?? "Description"}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* price (human readable) */}
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_price ?? "Price (display)"}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* priceAmount (cents) */}
            <FormField
              control={form.control}
              name="priceAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.fields_price_amount ?? "Price amount (cents)"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        setValue(
                          "priceAmount",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* interval */}
            <FormField
              control={form.control}
              name="interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_interval ?? "Interval"}</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? "month"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t.fields_interval_placeholder ?? "month / year"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">{t.month}</SelectItem>
                        <SelectItem value="year">{t.year}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* minutesPerMonth */}
            <FormField
              control={form.control}
              name="minutesPerMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.fields_minutes_per_month ?? "Minutes per month"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        setValue(
                          "minutesPerMonth",
                          e.target.value === "" ? 0 : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* agents */}
            <FormField
              control={form.control}
              name="agents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_agents ?? "Agents"}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        setValue(
                          "agents",
                          e.target.value === "" ? 0 : Number(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* features list */}
            <FormItem>
              <FormLabel>{t.fields_features ?? "Features"}</FormLabel>
              <div className="space-y-2">
                {/* input + add */}
                <div className="flex gap-2">
                  <Input
                    placeholder={t.features_add_placeholder ?? "Add feature"}
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddFeature();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddFeature}>
                    {t.add_feature ?? "Add"}
                  </Button>
                </div>

                {/* rendered chips / list */}
                <div className="flex flex-wrap gap-2">
                  {currentFeatures.map((feature, idx) => (
                    <div
                      key={`${feature}-${idx}`}
                      className="bg-secondary flex items-center gap-2 rounded-md border px-3 py-1 text-sm"
                    >
                      {editingIndex === idx ? (
                        <>
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="h-6 min-w-0 flex-1 px-1 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                handleCancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={handleSaveEdit}
                            className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                          >
                            ✓
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={handleCancelEdit}
                            className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span
                            className="cursor-pointer"
                            onClick={() => handleStartEdit(idx)}
                            title={t.click_to_edit || "Click to edit"}
                          >
                            {feature}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => handleStartEdit(idx)}
                            className="text-muted-foreground h-auto p-1 hover:text-blue-600"
                            title={t.edit || "Edit"}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => handleRemoveFeature(idx)}
                            className="text-muted-foreground hover:text-destructive h-auto p-1"
                            title={t.delete || "Delete"}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {currentFeatures.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {t.no_features ?? "No features added yet"}
                  </p>
                )}
              </div>
            </FormItem>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  onClose();
                  reset();
                }}
                disabled={loading}
              >
                {t.cancel ?? "Cancel"}
              </Button>
              <Button type="submit" disabled={loading || !isValid}>
                {loading ? (
                  <>
                    <Spinner /> {t.saving ?? "Saving"}
                  </>
                ) : (
                  (t.save ?? "Save")
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
