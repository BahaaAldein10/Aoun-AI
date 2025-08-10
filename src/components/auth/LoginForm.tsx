"use client";

import { Icons } from "@/components/shared/Icons";
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
import { loginUser } from "@/lib/actions/auth";
import { SupportedLang } from "@/lib/dictionaries";
import { LoginFormValues, loginSchema } from "@/lib/schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Spinner from "../shared/Spinner";

interface LoginFormProps {
  t: {
    email: string;
    password: string;
    login_button: string;
    logging_in_button: string;
    forgot_password: string;
    or_continue_with: string;
    no_account: string;
    signup_link: string;
    back_to_home: string;
  };
  lang: SupportedLang;
}

const LoginForm = ({ t, lang }: LoginFormProps) => {
  const router = useRouter();
  const dict = useDictionary();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema(dict)),
    defaultValues: { email: "", password: "" },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = form;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<
    "google" | "facebook" | null
  >(null);

  // const handleForgotPassword = () => {
  //   router.push(`/${lang}/forgot-password`);
  // };

  const handleProviderLogin = async (provider: "google" | "facebook") => {
    try {
      setActiveProvider(provider);
      await signIn(provider, { callbackUrl: `/${lang}/dashboard` });
    } finally {
      setActiveProvider(null);
    }
  };

  async function onSubmit(data: LoginFormValues) {
    setGeneralError(null);
    clearErrors();

    try {
      const res = await loginUser({ ...data, lang });
      if (!res.success) {
        if (res.errors) {
          for (const [field, message] of Object.entries(res.errors)) {
            if (field === "general") {
              setGeneralError(message as string);
            } else {
              setError(field as keyof LoginFormValues, {
                type: "server",
                message: message as string,
              });
            }
          }
        }
        return;
      }

      router.push(res.isAdmin ? `/${lang}/admin` : `/${lang}/dashboard`);
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
        <input type="hidden" name="lang" value={lang} />
        {/* General error message */}
        {generalError && (
          <div className="mb-2 text-sm text-red-500">{generalError}</div>
        )}

        {/* Email */}
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

        {/* Password */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex justify-between">
                <FormLabel>{t.password}</FormLabel>
                <Link
                  href={`/${lang}/auth/forgot`}
                  className="text-sm underline"
                >
                  {t.forgot_password}
                </Link>
              </div>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <Button
          type="submit"
          className="w-full cursor-pointer"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4 animate-spin" />
              {t.logging_in_button}
            </>
          ) : (
            t.login_button
          )}
        </Button>

        {/* Or */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card text-muted-foreground px-2">
              {t.or_continue_with}
            </span>
          </div>
        </div>

        {/* Social */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            type="button"
            className="disabled:cursor-not-allowed"
            onClick={() => handleProviderLogin("google")}
            disabled={!!activeProvider || isSubmitting}
          >
            {activeProvider === "google" ? (
              <>
                <Spinner className="mr-2 rtl:mr-0 rtl:ml-2" />
                Google
              </>
            ) : (
              <>
                <Icons.Google className="mr-2 rtl:mr-0 rtl:ml-2" />
                Google
              </>
            )}
          </Button>

          <Button
            variant="outline"
            type="button"
            className="disabled:cursor-not-allowed"
            onClick={() => handleProviderLogin("facebook")}
            disabled={!!activeProvider || isSubmitting}
          >
            {activeProvider === "facebook" ? (
              <>
                <Spinner className="mr-2 rtl:mr-0 rtl:ml-2" />
                Facebook
              </>
            ) : (
              <>
                <Icons.Facebook className="mr-2 rtl:mr-0 rtl:ml-2" />
                Facebook
              </>
            )}
          </Button>
        </div>

        {/* Links */}
        <div className="mt-6 space-y-2 text-center text-sm">
          <p>
            {t.no_account}{" "}
            <Link href={`/${lang}/auth/signup`} className="underline">
              {t.signup_link}
            </Link>
          </p>
          <Link href={`/${lang}`} className="text-muted-foreground underline">
            {t.back_to_home}
          </Link>
        </div>
      </form>
    </Form>
  );
};

export default LoginForm;
