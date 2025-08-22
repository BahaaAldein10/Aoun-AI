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
import { updateUser } from "@/lib/actions/user";
import { SupportedLang } from "@/lib/dictionaries";
import { EditUserFormValues, editUserSchema } from "@/lib/schemas/admin";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserRole } from "@prisma/client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import Spinner from "../shared/Spinner";
import { UserWithSubscriptionWithUsage } from "./UsersColumns";

type Props = {
  user: UserWithSubscriptionWithUsage | null;
  isOpen: boolean;
  onClose: () => void;
  t: Record<string, string>;
};

/** Simple helper to sum usage minutes */
function sumUsageMinutes(usage?: { minutes?: number | null }[]) {
  if (!usage || usage.length === 0) return 0;
  return usage.reduce((acc, u) => acc + (Number(u?.minutes ?? 0) || 0), 0);
}

export default function EditUserDialog({ user, isOpen, onClose, t }: Props) {
  const [loading, setLoading] = useState(false);
  const params = useParams();
  const lang = params.lang as SupportedLang;
  const isRtl = lang === "ar";

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "USER",
      minutes: 0,
    },
    mode: "onSubmit",
  });

  // Reset form values when user changes
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name as string,
        email: user.email as string,
        role: user.role as UserRole,
        minutes: sumUsageMinutes(user.usage),
      });
    }
  }, [user, form]);

  if (!user) return null;

  async function onSubmit(values: EditUserFormValues) {
    try {
      setLoading(true);

      await updateUser({
        email: values.email as string,
        role: values.role as UserRole,
        minutes: Number(values.minutes ?? 0),
        lang,
      });

      toast.success(t.toast_updated);
      onClose();
    } catch (error) {
      console.error("Update user error", error);
      toast.error(t.save_failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent dir={isRtl ? "rtl" : "ltr"} lang={lang}>
        <DialogHeader>
          <DialogTitle>{t.edit_user_title}</DialogTitle>
          <DialogDescription>{t.edit_user_description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 p-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_name}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      readOnly
                      autoFocus={false}
                      className="aria-invalid:border-input aria-invalid:ring-0 dark:aria-invalid:ring-0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_email}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      readOnly
                      autoFocus={false}
                      className="aria-invalid:border-input aria-invalid:ring-0 dark:aria-invalid:ring-0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_role}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t.fields_role_placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">{t.role_admin}</SelectItem>
                        <SelectItem value="USER">{t.role_user}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields_minutes}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={loading}
              >
                {t.cancel}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner /> {t.saving}
                  </>
                ) : (
                  t.save
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
