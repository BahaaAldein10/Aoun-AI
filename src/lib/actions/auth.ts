"use server";

import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import z from "zod";
import { signIn } from "../auth";
import { getDictionary, SupportedLang } from "../dictionaries";
import { generateResetPasswordEmail } from "../notifier";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../schemas/auth";
import { sendTransactionalEmail } from "../sendbrevo";

interface LoginUserParams {
  email: string;
  password: string;
  lang: SupportedLang;
}

interface SignupUserParams extends LoginUserParams {
  name: string;
}

interface ForgotPasswordParams {
  email: string;
  lang: SupportedLang;
}

interface ResetPasswordParams {
  token: string;
  password: string;
  lang: SupportedLang;
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

    const isAdmin = existingUser.role === UserRole.ADMIN;

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
      callbackUrl:
        existingUser.role === "ADMIN" ? `/${lang}/admin` : `/${lang}/dashboard`,
    });
    if (res?.error) {
      return { success: false, errors: { general: res.error } };
    }

    return { success: true, isAdmin };
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

    const hashedPassword = await bcrypt.hash(password, 12);
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

export async function forgotPassword({ email, lang }: ForgotPasswordParams) {
  const dict = await getDictionary(lang);

  try {
    const parsed = forgotPasswordSchema(dict).safeParse({ email });
    if (!parsed.success) {
      return { success: false, errors: z.flattenError(parsed.error) };
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return { success: true };
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpiresAt,
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/${lang}/auth/reset?token=${resetToken}`;
    const emailHtml = generateResetPasswordEmail(user.name!, resetUrl, dict);

    await sendTransactionalEmail(
      { email: user.email, name: user.name! },
      dict.auth.reset_password_email_subject,
      emailHtml,
    );

    return { success: true };
  } catch (error) {
    console.error("[FORGOT_PASSWORD_ERROR]", error);
    return {
      success: false,
      errors: { general: dict.auth.validation.internal_error },
    };
  }
}

export async function resetPassword({
  token,
  password,
  lang,
}: ResetPasswordParams) {
  const dict = await getDictionary(lang);

  try {
    const parsed = resetPasswordSchema(dict).safeParse({
      password,
      confirmPassword: password,
    });
    if (!parsed.success) {
      return { success: false, errors: z.flattenError(parsed.error) };
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token },
    });
    if (
      !user ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt < new Date()
    ) {
      return {
        success: false,
        errors: { token: dict.auth.validation.invalid_or_expired_token },
      };
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[RESET_PASSWORD_ERROR]", error);
    return {
      success: false,
      errors: { general: dict.auth.validation.internal_error },
    };
  }
}
