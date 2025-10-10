"use client";

import Spinner from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Dictionary } from "@/contexts/dictionary-context";
import { updateBlogPost } from "@/lib/actions/blog";
import type { SupportedLang } from "@/lib/dictionaries";
import { BlogPostSchema, BlogPostValues } from "@/lib/schemas/blog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import RichTextEditor from "../Editor/RichTextEditor";
import { BlogPostWithAuthor } from "./BlogsColumns";

function slugify(input: string) {
  try {
    return (
      String(input || "")
        .normalize?.("NFKD") // optional, safe-guard with optional chaining
        .toLowerCase()
        // remove Arabic diacritics (tashkīl) and Quranic marks
        .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
        // remove tatweel / kashida
        .replace(/\u0640/g, "")
        // remove any character that is NOT:
        // - Arabic ranges (multiple blocks)
        // - Latin letters A-Z
        // - ASCII digits 0-9
        // - spaces or hyphens
        .replace(
          /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFA-Za-z0-9\s-]/g,
          "",
        )
        // convert Arabic-Indic digits to ASCII
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        // collapse whitespace/hyphens to single dash
        .replace(/[\s-]+/g, "-")
        // trim leading/trailing dashes
        .replace(/^-+|-+$/g, "")
    );
  } catch (e) {
    // Last-resort fallback: keep only ASCII letters/numbers/hyphen
    console.error("slugify fallback:", e);
    return String(input || "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
  }
}

export default function EditBlogClient({
  lang,
  dict,
  initialPost,
}: {
  lang: SupportedLang;
  dict: Dictionary;
  initialPost: BlogPostWithAuthor;
}) {
  const router = useRouter();
  const t = dict.admin_blogs;

  const form = useForm<BlogPostValues>({
    resolver: zodResolver(BlogPostSchema),
    defaultValues: {
      title: initialPost.title,
      slug: initialPost.slug,
      excerpt: initialPost.excerpt ?? "",
      content: initialPost.content,
      coverImage: initialPost.coverImage ?? "",
      status: initialPost.status,
      featured: initialPost.featured,
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty, isValid },
  } = form;

  const title = watch("title");

  useEffect(() => {
    setValue("slug", slugify(title), { shouldValidate: true });
  }, [title, setValue]);

  async function onSubmit(values: BlogPostValues) {
    try {
      await updateBlogPost({ post: values, lang, postId: initialPost.id });
      toast.success(t.saved);
      router.push(`/${lang}/admin/blog`);
    } catch (err) {
      console.error(t.save_failed, err);
      toast.error(t.save_failed);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.create_title}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.create_description}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.back()} type="button">
              {t.back}
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !isValid || !isDirty}
            >
              {isSubmitting ? (
                <>
                  <Spinner /> {t.saving}
                </>
              ) : (
                t.update
              )}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.post_section_title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.title_label}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.placeholder_title} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="data-[error=true]:text-foreground">
                    {t.slug_label}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t.placeholder_slug}
                      readOnly
                      className="aria-invalid:border-input aria-invalid:ring-0 dark:aria-invalid:ring-0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="excerpt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.excerpt_label}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder={t.placeholder_excerpt}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.content_label}</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      content={field.value}
                      onChange={field.onChange}
                      placeholder={t.placeholder_content}
                      language={lang}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="coverImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.cover_image_label}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.placeholder_coverImage} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-4">
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.status_label}</FormLabel>
                    <FormControl>
                      <Controller
                        control={control}
                        name="status"
                        render={({ field: ctrlField }) => (
                          <Select
                            value={ctrlField.value}
                            onValueChange={ctrlField.onChange}
                          >
                            <SelectTrigger
                              className="w-[180px]"
                              dir={lang === "ar" ? "rtl" : "ltr"}
                            >
                              <SelectValue placeholder={t.status_label} />
                            </SelectTrigger>
                            <SelectContent dir={lang === "ar" ? "rtl" : "ltr"}>
                              <SelectItem value="DRAFT">
                                {t.status_draft}
                              </SelectItem>
                              <SelectItem value="PUBLISHED">
                                {t.status_published}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="featured"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.featured_label}</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value ? "true" : "false"}
                        onValueChange={(val) => field.onChange(val === "true")}
                      >
                        <SelectTrigger
                          className="w-[180px]"
                          dir={lang === "ar" ? "rtl" : "ltr"}
                        >
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent dir={lang === "ar" ? "rtl" : "ltr"}>
                          <SelectItem value="false">{t.featured_no}</SelectItem>
                          <SelectItem value="true">{t.featured_yes}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
