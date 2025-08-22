import { Dictionary } from "@/contexts/dictionary-context";
import z from "zod";

export const settingsSchema = (dict: Dictionary) =>
  z.object({
    siteTitle: z.string().trim().min(2, {
      message: dict.admin_settings.validation_site_title,
    }),
    siteDescription: z.string().optional(),
    contactEmail: z.email({ message: "Invalid email" }),
    supportUrl: z.url({ message: "Invalid URL" }).optional(),
    logoFile: z.any().optional(),
  });

export type SettingsFormValues = z.infer<ReturnType<typeof settingsSchema>>;

export const editUserSchema = z.object({
  name: z.string().optional(),
  email: z.email().optional(),
  role: z.enum(["USER", "ADMIN"], "Role is required").optional(),
  minutes: z
    .number({ error: "Minutes must be a number" })
    .min(0, "Minutes cannot be negative")
    .max(999999, "Minutes cannot exceed 999,999")
    .int("Minutes must be a whole number")
    .optional(),
});

export type EditUserFormValues = z.infer<typeof editUserSchema>;
