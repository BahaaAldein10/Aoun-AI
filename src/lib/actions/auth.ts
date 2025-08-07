"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import z from "zod";
import { signIn } from "../auth";
import { getDictionary, SupportedLang } from "../dictionaries";
import { loginSchema, signupSchema } from "../schemas/auth";

interface LoginUserParams {
  email: string;
  password: string;
  lang: SupportedLang;
}
interface SignupUserParams extends LoginUserParams {
  name: string;
}

export async function loginUser({ email, password, lang }: LoginUserParams) {
  const dict = await getDictionary(lang);

  try {
    const parsed = loginSchema(dict).safeParse({ email, password });
    if (!parsed.success) {
      return { success: false, errors: z.flattenError(parsed.error) };
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      return {
        success: false,
        errors: { email: dict.auth.validation.no_account },
      };
    }

    const isValidPassword = await bcrypt.compare(
      password,
      existingUser.password || "",
    );
    if (!isValidPassword) {
      return {
        success: false,
        errors: { password: dict.auth.validation.invalid_password },
      };
    }

    const res = await signIn("credentials", {
      redirect: false,
      email: email,
      password: password,
      callbackUrl: `/${lang}/dashboard`,
    });
    if (res?.error) {
      return { success: false, errors: { general: res.error } };
    }

    return { success: true };
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);
    return {
      success: false,
      errors: { general: dict.auth.validation.internal_error },
    };
  }
}

export async function signupUser({
  name,
  email,
  password,
  lang,
}: SignupUserParams) {
  const dict = await getDictionary(lang);

  try {
    const parsed = signupSchema(dict).safeParse({ name, email, password });
    if (!parsed.success) {
      return { success: false, errors: z.flattenError(parsed.error) };
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return {
        success: false,
        errors: { email: dict.auth.validation.email_in_use },
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const res = await signIn("credentials", {
      redirect: false,
      email: email,
      password: password,
      callbackUrl: `/${lang}/dashboard`,
    });

    if (res?.error) {
      return { success: false, errors: { general: res.error } };
    }

    return { success: true };
  } catch (error) {
    console.error("[SIGNUP_ERROR]", error);
    return {
      success: false,
      errors: { general: dict.auth.validation.internal_error },
    };
  }
}
