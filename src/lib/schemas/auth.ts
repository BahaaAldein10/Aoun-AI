import { Dictionary } from "@/contexts/dictionary-context";
import z from "zod";

export const loginSchema = (dict: Dictionary) =>
  z.object({
    email: z.email({ message: dict.auth.validation.email }),
    password: z
      .string()
      .min(6, { message: dict.auth.validation.passwordMin })
      .max(100, { message: dict.auth.validation.passwordMax })
      .regex(/[A-Z]/, { message: dict.auth.validation.passwordUpper })
      .regex(/[a-z]/, { message: dict.auth.validation.passwordLower })
      .regex(/[0-9]/, { message: dict.auth.validation.passwordNumber }),
  });

export type LoginFormValues = z.infer<ReturnType<typeof loginSchema>>;

export const signupSchema = (dict: Dictionary) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, { message: dict.auth.validation.nameMin })
      .max(50, { message: dict.auth.validation.nameMax }),
    email: z.email({ message: dict.auth.validation.email }),
    password: z
      .string()
      .min(6, { message: dict.auth.validation.passwordMin })
      .max(100, { message: dict.auth.validation.passwordMax })
      .regex(/[A-Z]/, { message: dict.auth.validation.passwordUpper })
      .regex(/[a-z]/, { message: dict.auth.validation.passwordLower })
      .regex(/[0-9]/, { message: dict.auth.validation.passwordNumber }),
  });

export type SignupFormValues = z.infer<ReturnType<typeof signupSchema>>;
