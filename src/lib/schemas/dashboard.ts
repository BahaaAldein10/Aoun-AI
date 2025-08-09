import { Dictionary } from "@/contexts/dictionary-context";
import z from "zod";

export const settingsSchema = (dict: Dictionary) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, { message: dict.auth.validation.nameMin })
      .max(50, { message: dict.auth.validation.nameMax }),
  });

export type SettingsFormValues = z.infer<ReturnType<typeof settingsSchema>>;

export const setupSchema = (dict: Dictionary) =>
  z.object({
    botName: z.string().min(2, {
      message: dict.dashboard_setup.bot_name_placeholder,
    }),
    url: z.string().optional().nullable(),
    personality: z.string().optional().nullable(),
    voice: z.string().optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    faq: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .optional(),
  });

export type SetupFormValues = z.infer<ReturnType<typeof setupSchema>>;
