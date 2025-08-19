import z from "zod";

export const FeatureSchema = z.object({ title: z.string().optional() });
export const StepSchema = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
});
export const TestimonialSchema = z.object({
  text: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  avatarInitial: z.string().optional(),
});
export const FAQItemSchema = z.object({
  question: z.string().optional(),
  answer: z.string().optional(),
});

export const SiteContentSchema = z.object({
  hero: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      button1: z.string().optional(),
      button2: z.string().optional(),
    })
    .optional(),

  features: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      features: z.array(FeatureSchema).optional(),
    })
    .optional(),

  howItWorks: z
    .object({
      title: z.string().optional(),
      steps: z.array(StepSchema).optional(),
    })
    .optional(),

  testimonials: z
    .object({
      pill: z.string().optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      items: z.array(TestimonialSchema).optional(),
    })
    .optional(),

  contact: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      emailCardTitle: z.string().optional(),
      emailCardDesc: z.string().optional(),
      phoneCardTitle: z.string().optional(),
      phoneCardDesc: z.string().optional(),
      addressCardTitle: z.string().optional(),
      chatCardTitle: z.string().optional(),
      chatCardDesc: z.string().optional(),
      chatButtonText: z.string().optional(),
    })
    .optional(),

  faq: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      items: z.array(FAQItemSchema).optional(),
    })
    .optional(),

  footer: z
    .object({
      aboutText: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
      contactAddress: z.string().optional(),
      social: z
        .object({
          facebook: z.string().optional(),
          twitter: z.string().optional(),
          instagram: z.string().optional(),
        })
        .optional(),
      copyright: z.string().optional(),
    })
    .optional(),
});

export type SiteContent = z.infer<typeof SiteContentSchema>;
