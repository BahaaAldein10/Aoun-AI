"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { SupportedLang } from "@/lib/dictionaries";
import { SettingsFormValues, settingsSchema } from "@/lib/schemas/admin";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

const SettingsClient = ({
  initialSettings,
  lang,
  dict,
}: {
  initialSettings: {
    siteTitle: string;
    siteDescription?: string;
    contactEmail?: string;
    supportUrl?: string;
    logoUrl?: string | null;
  };
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.admin_settings;
  const isRtl = lang === "ar";
  const dir = isRtl ? "rtl" : "ltr";

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema(dict)),
    defaultValues: {
      siteTitle: initialSettings.siteTitle ?? "",
      siteDescription: initialSettings.siteDescription ?? "",
      contactEmail: initialSettings.contactEmail ?? "",
      supportUrl: initialSettings.supportUrl ?? "",
      logoFile: undefined,
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting },
    reset,
  } = form;

  const watchedValues = watch();
  const unChanged = useMemo(() => {
    // compare main fields only (ignore logoFile)
    return (
      watchedValues.siteTitle === (initialSettings.siteTitle ?? "") &&
      (watchedValues.siteDescription ?? "") ===
        (initialSettings.siteDescription ?? "") &&
      watchedValues.contactEmail === (initialSettings.contactEmail ?? "") &&
      (watchedValues.supportUrl ?? "") === (initialSettings.supportUrl ?? "")
    );
  }, [watchedValues, initialSettings]);

  // logo preview
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialSettings.logoUrl ?? null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      // revoke object URLs on unmount
      if (logoPreview && logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLogoChange(file?: File | null) {
    if (!file) {
      setLogoPreview(initialSettings.logoUrl ?? null);
      setValue("logoFile", undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    setValue("logoFile", file);
  }

  async function onSubmit(values: SettingsFormValues) {
    // reset previous errors (UI-only)
    try {
      // simulate saving
      await new Promise((r) => setTimeout(r, 700));

      // persist to localStorage for testing (dummy)
      const toSave = {
        siteTitle: values.siteTitle,
        siteDescription: values.siteDescription,
        contactEmail: values.contactEmail,
        supportUrl: values.supportUrl,
        // NOTE: logoFile is a File — in a real flow you'd upload to server/S3 and save URL
        logoUrl: logoPreview,
      };
      localStorage.setItem("admin_settings", JSON.stringify(toSave));

      toast.success(t.toast_success ?? "Settings saved");
      // update initialSettings-like state by resetting form default values
      reset({
        ...values,
        logoFile: undefined,
      });
    } catch (err) {
      console.error(err);
      toast.error(t.toast_error ?? "Failed to save settings");
    }
  }

  return (
    <div className={cn("space-y-6", isRtl && "rtl")}>
      <div className="space-y-2">
        <h1 className="font-headline text-2xl font-bold rtl:text-right">
          {t.title}
        </h1>
        <p className="text-muted-foreground text-sm">{t.description}</p>
      </div>

      <Card className={cn(isRtl && "rtl:text-right")}>
        <CardHeader>
          <CardTitle>{t.site_settings_title}</CardTitle>
          <CardDescription>{t.site_settings_desc}</CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
              dir={dir}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {logoPreview ? (
                    <AvatarImage
                      src={logoPreview}
                      alt={watchedValues.siteTitle || "Logo"}
                    />
                  ) : (
                    <AvatarFallback>
                      {(watchedValues.siteTitle || "A").charAt(0)}
                    </AvatarFallback>
                  )}
                </Avatar>

                <div className="flex flex-col gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t.logo_upload}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onLogoChange(null);
                      }}
                    >
                      {t.logo_remove ?? "Remove"}
                    </Button>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t.logo_help}
                  </div>
                </div>
              </div>

              <FormField
                control={control}
                name="siteTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.site_title}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.site_title_placeholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="siteDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.site_description}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.site_description_placeholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.contact_email}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t.contact_email_placeholder}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="supportUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.support_url}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t.support_url_placeholder}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={isSubmitting || unChanged}>
                  {isSubmitting
                    ? (t.saving_button ?? "Saving...")
                    : (t.save_button ?? "Save settings")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsClient;
