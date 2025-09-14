"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useDictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import {
  ResetPasswordFormValues,
  resetPasswordSchema,
} from "@/lib/schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Spinner from "../shared/Spinner";
import { resetPassword } from "@/lib/actions/auth";

interface ResetPasswordFormProps {
  t: {
    new_password: string;
    confirm_password: string;
    reset_password: string;
    resetting: string;
    back_to_login: string;
  };
  lang: SupportedLang;
  token: string;
}

const ResetPasswordForm = ({
  t,
  lang,
  token,
}: ResetPasswordFormProps) => {
  const dict = useDictionary();
  const router = useRouter();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema(dict)),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(data: ResetPasswordFormValues) {
    setGeneralError(null);
    clearErrors();

    try {
      const res = await resetPassword({
        token,
        password: data.password,
        lang,
      });

      if (!res.success) {
        if (res.errors) {
          for (const [field, message] of Object.entries(res.errors)) {
            if (field === "general" || field === "token") {
              setGeneralError(message as string);
            } else {
              setError(field as keyof ResetPasswordFormValues, {
                type: "server",
                message: message as string,
              });
            }
          }
        }
        return;
      }

      // Redirect to login with success message
      router.push(`/${lang}/auth/login?reset=success`);
    } catch (error) {
      console.error(error);
      setGeneralError(dict.auth.validation.auth_error);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-6"
      >
        {generalError && (
          <div className="mb-2 text-sm text-red-500">{generalError}</div>
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.new_password}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.confirm_password}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4 animate-spin" />
              {t.resetting}
            </>
          ) : (
            t.reset_password
          )}
        </Button>

        <div className="text-center">
          <Link href={`/${lang}/auth/login`} className="text-sm underline">
            {t.back_to_login}
          </Link>
        </div>
      </form>
    </Form>
  );
};

export default ResetPasswordForm;
