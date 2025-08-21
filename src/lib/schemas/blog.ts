import { z } from "zod";

export const BlogPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  excerpt: z.string().optional(),
  content: z.any(),
  status: z.preprocess(
    (val: "DRAFT" | "PUBLISHED") => val ?? "DRAFT",
    z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  ),
  featured: z.preprocess(
    (val: boolean) => val ?? false,
    z.boolean().optional().default(false),
  ),
  coverImage: z.url().optional(),
});

export type BlogPostValues = z.infer<typeof BlogPostSchema>;
