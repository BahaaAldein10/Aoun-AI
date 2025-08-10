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
