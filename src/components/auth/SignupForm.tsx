"use client";

import { Icons } from "@/components/shared/Icons";
import Spinner from "@/components/shared/Spinner";
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
import { signupUser } from "@/lib/actions/auth";
import { SupportedLang } from "@/lib/dictionaries";
import { SignupFormValues, signupSchema } from "@/lib/schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface SignupFormProps {
  t: {
    name: string;
    name_placeholder: string;
    email: string;
    password: string;
    signup_button: string;
    signing_up_button: string;
    or_continue_with: string;
    have_account: string;
    login_link: string;
    back_to_home: string;
  };
  lang: SupportedLang;
}

const SignupForm = ({ t, lang }: SignupFormProps) => {
  const router = useRouter();
  const dict = useDictionary();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema(dict)),
    defaultValues: { name: "", email: "", password: "" },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { isSubmitting },
  } = form;
  const [generalError, setGeneralError] = useState<string | null>(null);

  async function onSubmit(data: SignupFormValues) {
    setGeneralError(null);
    clearErrors();

    try {
      const res = await signupUser({ ...data, lang });

      if (!res.success) {
        if (res.errors) {
          for (const [field, message] of Object.entries(res.errors)) {
            if (field === "general") {
              setGeneralError(message as string);
            } else {
              setError(field as keyof SignupFormValues, {
                type: "server",
                message: message as string,
              });
            }
          }
        }
        return;
      }

      router.push(`/${lang}/dashboard`);
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

        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.name}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder={t.name_placeholder}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
              <FormLabel>{t.password}</FormLabel>
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
              {t.signing_up_button}
            </>
          ) : (
            t.signup_button
          )}
        </Button>

        {/* Or */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background text-muted-foreground px-2">
              {t.or_continue_with}
            </span>
          </div>
        </div>

        {/* Social */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            type="button"
            className="cursor-pointer"
            onClick={() =>
              signIn("google", { callbackUrl: `/${lang}/dashboard` })
            }
          >
            <Icons.Google className="mr-2 h-4 w-4 rtl:mr-0 rtl:ml-2" />
            Google
          </Button>
          <Button
            variant="outline"
            type="button"
            className="cursor-pointer"
            onClick={() =>
              signIn("facebook", { callbackUrl: `/${lang}/dashboard` })
            }
          >
            <Icons.Facebook className="mr-2 h-4 w-4 rtl:mr-0 rtl:ml-2" />
            Facebook
          </Button>
        </div>

        {/* Links */}
        <div className="mt-6 space-y-2 text-center text-sm">
          <p>
            {t.have_account}{" "}
            <Link href={`/${lang}/auth/login`} className="underline">
              {t.login_link}
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

export default SignupForm;
