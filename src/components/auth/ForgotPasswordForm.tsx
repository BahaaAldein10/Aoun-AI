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
import { forgotPassword } from "@/lib/actions/auth";
import { SupportedLang } from "@/lib/dictionaries";
import {
  ForgotPasswordFormValues,
  forgotPasswordSchema,
} from "@/lib/schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Spinner from "../shared/Spinner";

interface ForgotPasswordFormProps {
  t: {
    email: string;
    send_reset_link: string;
    sending: string;
    back_to_login: string;
    reset_email_sent_title: string;
    reset_email_sent_message: string;
  };
  lang: SupportedLang;
}

const ForgotPasswordForm = ({ t, lang }: ForgotPasswordFormProps) => {
  const dict = useDictionary();
  const [isSuccess, setIsSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema(dict)),
    defaultValues: { email: "" },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(data: ForgotPasswordFormValues) {
    setGeneralError(null);
    clearErrors();

    try {
      const res = await forgotPassword({ ...data, lang });
      if (!res.success) {
        if (res.errors) {
          for (const [field, message] of Object.entries(res.errors)) {
            if (field === "general") {
              setGeneralError(message as string);
            } else {
              setError(field as keyof ForgotPasswordFormValues, {
                type: "server",
                message: message as string,
              });
            }
          }
        }
        return;
      }

      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      setGeneralError(dict.auth.validation.auth_error);
    }
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="rounded-lg bg-green-50 p-4">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <h3 className="mb-2 text-lg font-semibold text-green-800">
            {t.reset_email_sent_title}
          </h3>
          <p className="text-sm text-green-700">{t.reset_email_sent_message}</p>
        </div>

        <Link href={`/${lang}/auth/login`} className="block">
          <Button variant="outline" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t.back_to_login}
          </Button>
        </Link>
      </div>
    );
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.email}</FormLabel>
              <FormControl>
                <Input type="email" placeholder="user@aoun.ai" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4 animate-spin" />
              {t.sending}
            </>
          ) : (
            t.send_reset_link
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

export default ForgotPasswordForm;
