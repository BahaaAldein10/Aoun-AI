import * as z from "zod";

export const planSchema = z.object({
  name: z.enum(["MAINTENANCE", "FREE", "STARTER", "PRO", "ENTERPRISE"]),
  titleEn: z.string().min(1, "English title is required"),
  titleAr: z.string().min(1, "العنوان بالعربية مطلوب"),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  priceEn: z.string().min(1, "English price is required"),
  priceAr: z.string().min(1, "السعر بالعربية مطلوب"),
  priceAmount: z.number().int().nullable().optional(),
  interval: z.string().optional(),
  stripePriceId: z.string().optional(),
  minutesPerMonth: z.number().int().min(0),
  agents: z.number().int().min(0),
  featuresEn: z.array(z.string()).min(0),
  featuresAr: z.array(z.string()).min(0),
  popular: z.boolean().optional(),
});

export type PlanFormValues = z.infer<typeof planSchema>;
