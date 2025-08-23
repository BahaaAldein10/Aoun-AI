import * as z from "zod";

export const planSchema = z.object({
  name: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.string().min(1),
  priceAmount: z.number().int().nullable().optional(),
  interval: z.string().optional(),
  minutesPerMonth: z.number().int().min(0),
  agents: z.number().int().min(0),
  features: z.array(z.string()).min(0),
  popular: z.boolean().optional(),
});

export type PlanFormValues = z.infer<typeof planSchema>;
