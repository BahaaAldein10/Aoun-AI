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
import { updateAvatar } from "@/lib/actions/user";
import type { SupportedLang } from "@/lib/dictionaries";
import { SettingsFormValues, settingsSchema } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { User } from "next-auth";
import React from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

interface AdminSettingsClientProps {
  user: User;
  dict: Dictionary;
  lang: SupportedLang;
}

const AdminSettingsClient = ({
  user,
  dict,
  lang,
}: AdminSettingsClientProps) => {
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

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Unsupported file type: ${file.type}`);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", user.id);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Upload failed");
      }

      const uploadedFile = await res.json();

      await updateAvatar(user.id, uploadedFile.url);

      toast.success("Avatar uploaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload avatar.");
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
              <CardTitle>{t.admin_profile}</CardTitle>
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
                    onClick={() => document.getElementById("avatar")?.click()}
                  >
                    {t.change_avatar}
                  </Button>
                  <Input
                    id="avatar"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
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

export default AdminSettingsClient;
