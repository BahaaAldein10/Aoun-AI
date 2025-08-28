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
    botName: z.string().min(1, "Bot name is required"),
    url: z.url().optional().or(z.literal("")),
    personality: z.string().optional(),
    voice: z.string().min(1, "Please select a voice"),
    primaryColor: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i, "Invalid color"),
    accentColor: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i, "Invalid color"),
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        }),
      )
      .optional(),
    files: z.array(z.url()).optional(),
  });

export type SetupFormValues = z.infer<ReturnType<typeof setupSchema>>;
