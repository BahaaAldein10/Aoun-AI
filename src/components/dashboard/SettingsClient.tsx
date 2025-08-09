"use client";

import Spinner from "@/components/shared/Spinner";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/contexts/dictionary-context";
import { updateSettingsName } from "@/lib/actions/dashboard";
import type { SupportedLang } from "@/lib/dictionaries";
import { SettingsFormValues, settingsSchema } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { User } from "next-auth";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

interface SettingsClientProps {
  user: User;
  dict: Dictionary;
  lang: SupportedLang;
}

const SettingsClient = ({ user, dict, lang }: SettingsClientProps) => {
  const t = dict.dashboard_settings;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema(dict)),
    defaultValues: {
      name: user.name ?? "",
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = form;

  const unChanged = watch("name").trim() === (user.name?.trim() ?? "");

  async function onSubmit(values: SettingsFormValues) {
    clearErrors();

    try {
      const res = await updateSettingsName({
        name: values.name,
        lang,
        userId: user.id,
        dict,
      });

      if (!res?.success) {
        if (res?.errors) {
          for (const [field, message] of Object.entries(res.errors)) {
            setError(field as keyof SettingsFormValues, {
              type: "server",
              message: message as string,
            });
          }
        }
        return;
      }

      toast.success(t.toast_success_title);
    } catch (error) {
      toast.error(t.toast_error_title);
      console.error(error);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold rtl:text-right">
        {t.title}
      </h1>

      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card className={cn(lang === "ar" && "rtl:text-right")}>
            <CardHeader>
              <CardTitle>{t.user_profile}</CardTitle>
              <CardDescription>{t.user_profile_desc}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={user.image ?? "/images/avatar.png"}
                    alt={user.name ?? "User avatar"}
                  />
                </Avatar>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toast.success(t.avatar_upload_success)}
                  >
                    {t.change_avatar}
                  </Button>
                  <div className="text-muted-foreground text-xs">
                    {t.avatar_help}
                  </div>
                </div>
              </div>

              {/* Name field */}
              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.name}</FormLabel>
                    <FormControl>
                      <Input id="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email (read-only) */}
              <div className="space-y-2">
                <FormLabel>{t.email}</FormLabel>
                <Input value={user.email ?? ""} readOnly disabled />
              </div>
            </CardContent>

            <CardFooter>
              <Button type="submit" disabled={isSubmitting || unChanged}>
                {isSubmitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4 animate-spin" />
                    {t.saving_button}
                  </>
                ) : (
                  t.save_profile
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
};

export default SettingsClient;
