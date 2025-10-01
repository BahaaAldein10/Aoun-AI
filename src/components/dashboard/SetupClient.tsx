"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dictionary } from "@/contexts/dictionary-context";
import {
  createKb,
  deleteUploadedFileUrl,
  updateKb,
} from "@/lib/actions/dashboard";
import { qstash } from "@/lib/actions/qstash";
import { SupportedLang } from "@/lib/dictionaries";
import { SetupFormValues, setupSchema } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Document, KnowledgeBase } from "@prisma/client";
import isEqual from "lodash.isequal";
import {
  FileText,
  Link as LinkIcon,
  Palette,
  PlusCircle,
  Sprout,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import Spinner from "../shared/Spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { KbMetadata } from "./KnowledgeBaseClient";
import VoiceIntegrationTab, { availableVoices } from "./VoiceIntegrationTab";

type initialKb = KnowledgeBase & {
  documents: Document[];
  bot: { id: string } | null;
};

const MAX_FILES = 5;
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const SetupClient = ({
  initialKb,
  hasKb,
  lang,
  dict,
  currentUserId,
}: {
  initialKb?: initialKb | null;
  hasKb?: boolean;
  lang: SupportedLang;
  dict: Dictionary;
  currentUserId: string;
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const router = useRouter();

  const t = dict.dashboard_setup;
  const websiteDataRef = useRef<HTMLInputElement | null>(null);

  const metadata = initialKb?.metadata as KbMetadata | null;

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema(dict)),
    defaultValues: {
      botName: initialKb?.title || "",
      botDescription: initialKb?.description || "",
      agentLanguage: metadata?.language as SupportedLang,
      url: metadata?.url || "",
      personality: metadata?.personality || "",
      voice:
        availableVoices.find((v) => v.name === metadata?.voice)?.name ||
        availableVoices[0].name,
      primaryColor: metadata?.primaryColor || "#29ABE2",
      accentColor: metadata?.accentColor || "#29E2C2",
      faq: metadata?.faq || [
        {
          question: "",
          answer: "",
        },
      ],
      files: metadata?.files || [],
      allowedOrigins: metadata?.allowedOrigins || [],
    },
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, errors },
    getValues,
    setValue,
    watch,
    reset,
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "faq",
  });

  const existingFormFiles = watch("files") || [];

  const watched = watch([
    "botName",
    "botDescription",
    "agentLanguage",
    "url",
    "personality",
    "voice",
    "primaryColor",
    "accentColor",
    "faq",
    "files",
    "allowedOrigins",
  ]);

  // helper to get the "baseline" values from initialKb (or defaults)
  const getInitialSnapshot = () => {
    const meta = (initialKb?.metadata as KbMetadata) || ({} as KbMetadata);

    return {
      botName: initialKb?.title || "",
      botDescription: initialKb?.description || "",
      agentLanguage: meta?.language || (form.getValues("agentLanguage") ?? ""),
      url: meta?.url ?? "",
      personality: meta?.personality ?? "",
      voice: meta?.voice ?? availableVoices[0].name,
      primaryColor: meta?.primaryColor ?? "#29ABE2",
      accentColor: meta?.accentColor ?? "#29E2C2",
      faq: meta?.faq ?? [{ question: "", answer: "" }],
      files: meta?.files ?? [],
      allowedOrigins: meta?.allowedOrigins ?? [],
    };
  };

  useEffect(() => {
    const current = {
      botName: form.getValues("botName") ?? "",
      botDescription: form.getValues("botDescription") ?? "",
      agentLanguage: form.getValues("agentLanguage") ?? "",
      url: form.getValues("url") ?? "",
      personality: form.getValues("personality") ?? "",
      voice: form.getValues("voice") ?? availableVoices[0].name,
      primaryColor: form.getValues("primaryColor") ?? "#29ABE2",
      accentColor: form.getValues("accentColor") ?? "#29E2C2",
      faq: form.getValues("faq") ?? [{ question: "", answer: "" }],
      files: form.getValues("files") ?? [],
      allowedOrigins: form.getValues("allowedOrigins") ?? [],
    };

    const initial = getInitialSnapshot();

    const changed = !isEqual(current, initial);

    setHasChanges(changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watched)]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const combined = [...selectedFiles, ...files].slice(0, MAX_FILES);
    if (files.length > combined.length) {
      toast.error(
        t.max_files_allowed.replace("{{count}}", MAX_FILES.toString()),
      );
    }

    const tooLarge = combined.find((f) => f.size > MAX_SIZE_BYTES);
    if (tooLarge) {
      toast.error(
        t.file_too_large
          .replace("{{fileName}}", tooLarge.name)
          .replace("{{maxSize}}", MAX_SIZE_MB.toString()),
      );
      setSelectedFiles(combined.filter((f) => f.size <= MAX_SIZE_BYTES));
      return;
    }

    setSelectedFiles(combined);
  };

  const removeSelected = (index: number) => {
    const next = [...selectedFiles];
    next.splice(index, 1);
    setSelectedFiles(next);
  };

  const removeUploadedUrl = async (url: string) => {
    try {
      const deleted = await deleteUploadedFileUrl(url);

      if (deleted) {
        const files = getValues("files") || [];
        const next = files.filter((f) => f !== url);
        setValue("files", next);

        toast.success(t.file_deleted);
      }
    } catch (error) {
      console.error(error);
      toast.error(t.file_delete_failed);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error(t.select_files_first);
      return;
    }

    const totalExisting = (getValues("files") || []).length;
    if (totalExisting + selectedFiles.length > MAX_FILES) {
      toast.error(
        t.max_files_total.replace("{{maxFiles}}", MAX_FILES.toString()),
      );
      return;
    }

    const userId = currentUserId ?? initialKb?.userId;
    if (!userId) {
      toast.error(t.user_id_missing);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const uploadedUrls: string[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        // size guard
        if (file.size > MAX_SIZE_BYTES) {
          toast.error(
            t.file_exceeds_limit
              .replace("{{fileName}}", file.name)
              .replace("{{maxSize}}", MAX_SIZE_MB.toString()),
          );
          continue;
        }

        const fd = new FormData();
        fd.append("file", file);
        fd.append("userId", userId);
        fd.append("kbId", initialKb?.id ?? "");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("Upload API error", err);
          toast.error(t.upload_failed.replace("{{fileName}}", file.name));
          continue;
        }

        const data = await res.json();
        const signedUrl = data?.url ?? null;

        if (!signedUrl) {
          console.error("No URL returned from /api/upload", data);
          toast.error(
            t.upload_failed_no_url.replace("{{fileName}}", file.name),
          );
          continue;
        }

        const current = getValues("files") || [];
        const next = [...current, signedUrl];
        setValue("files", next);

        uploadedUrls.push(signedUrl);

        // update progress
        setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
        toast.success(t.uploaded_file.replace("{{fileName}}", file.name));
      }

      setSelectedFiles([]);
      if (uploadedUrls.length > 0) {
        toast.success(
          t.uploaded_files_success.replace(
            "{{count}}",
            uploadedUrls.length.toString(),
          ),
        );
      } else {
        toast.error(t.no_files_uploaded);
      }
    } catch (err) {
      console.error("Upload failed", err);
      toast.error(t.upload_failed_error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  async function onSubmit(values: SetupFormValues) {
    if (
      !values.url &&
      (!values.files || values.files.length === 0) &&
      (!values.faq ||
        values.faq.every(
          (item) => !item.question.trim() || !item.answer.trim(),
        ))
    ) {
      toast.error(t.provide_url_or_files_or_faq);
      return;
    }

    if (values.url) {
      try {
        const url = new URL(values.url);
        if (!["http:", "https:"].includes(url.protocol)) {
          toast.error(t.invalid_url_protocol);
          return;
        }
      } catch {
        toast.error(t.invalid_url);
        return;
      }
    }

    const metadata = {
      personality: values.personality,
      voice: values.voice,
      primaryColor: values.primaryColor,
      accentColor: values.accentColor,
      faq: values.faq || [],
      url: values.url || null,
      files: values.files || [],
      allowedOrigins: values.allowedOrigins || [],
      language: values.agentLanguage as SupportedLang,
    };

    try {
      let res;

      if (hasKb) {
        // Update existing knowledge base
        res = await updateKb(initialKb?.bot?.id as string, {
          ...metadata,
          title: values.botName,
          description: values.botDescription,
        });
        toast.success(t.kb_updated);
      } else {
        // Create new knowledge base
        res = await createKb({
          ...metadata,
          title: values.botName,
          description: values.botDescription,
        });
        toast.success(t.kb_created);
      }

      const unchangedUrl =
        metadata.url === (initialKb?.metadata as KbMetadata)?.url;
      const unchangedFiles = isEqual(
        metadata.files,
        (initialKb?.metadata as KbMetadata)?.files,
      );
      const unchangedFaq = isEqual(
        metadata.faq,
        (initialKb?.metadata as KbMetadata)?.faq,
      );

      if (unchangedUrl && unchangedFiles && unchangedFaq) {
        if (res?.kb) {
          const kbMeta = (res.kb.metadata as KbMetadata) || ({} as KbMetadata);

          const newDefaults: SetupFormValues = {
            botName: res.kb.title || "",
            botDescription: res.kb.description || "",
            agentLanguage: kbMeta?.language ?? "en",
            url: kbMeta?.url ?? "",
            personality: kbMeta?.personality ?? "",
            voice: kbMeta?.voice ?? availableVoices[0].name,
            primaryColor: kbMeta?.primaryColor ?? "#29ABE2",
            accentColor: kbMeta?.accentColor ?? "#29E2C2",
            faq: kbMeta?.faq ?? [{ question: "", answer: "" }],
            files: kbMeta?.files ?? [],
            allowedOrigins: kbMeta?.allowedOrigins ?? [],
          };

          reset(newDefaults);
          setHasChanges(false);
        }
        return res;
      }

      // Start processing jobs (crawling/file processing/FAQ processing)
      if (res) {
        try {
          const processingResult = await qstash(res.kb);

          // Show more specific success messages based on what's being processed
          const processingSources = [];
          if (processingResult.urlProcessing) {
            processingSources.push(t.processing_url_source || "website");
          }
          if (processingResult.filesProcessing > 0) {
            processingSources.push(
              t.processing_files_source?.replace(
                "{{count}}",
                processingResult.filesProcessing.toString(),
              ) || `${processingResult.filesProcessing} files`,
            );
          }
          if (processingResult.faqProcessing > 0) {
            processingSources.push(
              t.processing_faq_source?.replace(
                "{{count}}",
                processingResult.faqProcessing.toString(),
              ) || `${processingResult.faqProcessing} FAQ items`,
            );
          }

          if (processingSources.length > 0) {
            const sourcesText = processingSources.join(", ");
            toast.success(
              t.processing_multiple_sources?.replace(
                "{{sources}}",
                sourcesText,
              ) || `Processing: ${sourcesText}`,
              { duration: 6000 },
            );
          }
        } catch (processingError) {
          console.error(
            "Failed to start background processing:",
            processingError,
          );
          toast.error(t.processing_failed);
        }
      }

      // Make form pristine with saved values
      if (res?.kb) {
        const kbMeta = (res.kb.metadata as KbMetadata) || ({} as KbMetadata);

        const newDefaults: SetupFormValues = {
          botName: res.kb.title || "",
          botDescription: res.kb.description || "",
          agentLanguage: kbMeta?.language ?? "en",
          url: kbMeta?.url ?? "",
          personality: kbMeta?.personality ?? "",
          voice: kbMeta?.voice ?? availableVoices[0].name,
          primaryColor: kbMeta?.primaryColor ?? "#29ABE2",
          accentColor: kbMeta?.accentColor ?? "#29E2C2",
          faq: kbMeta?.faq ?? [{ question: "", answer: "" }],
          files: kbMeta?.files ?? [],
          allowedOrigins: kbMeta?.allowedOrigins ?? [],
        };

        reset(newDefaults);
        setHasChanges(false);
      }

      router.push(`/${lang}/dashboard/knowledge-base/${res.kb.id}`);

      return res;
    } catch (error: unknown) {
      console.error("Failed to create/update Knowledge Base:", error);

      if (error instanceof Error) {
        // Show more user-friendly error messages
        if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          toast.error(t.network_error);
        } else if (
          error.message.includes("validation") ||
          error.message.includes("invalid")
        ) {
          toast.error(t.validation_error);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error(t.unexpected_error);
      }
    }
  }

  const addFaq = () => append({ question: "", answer: "" });
  const removeFaq = (i: number) => remove(i);

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className={cn(lang === "ar" && "rtl:text-right")}>
          <CardTitle className="font-headline flex items-center gap-2">
            <Sprout className="text-primary" /> {t.title}
          </CardTitle>
          <CardDescription>{t.description}</CardDescription>

          {errors.root?.message && (
            <div className="text-red-500">{errors.root.message}</div>
          )}
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
              dir={dir}
              aria-live="polite"
            >
              {/* hidden input to receive website data later if server returns it */}
              <input type="hidden" name="websiteData" ref={websiteDataRef} />

              <Tabs defaultValue="url" dir={dir}>
                {/* Desktop: 5 columns (hidden on <= lg) */}
                <TabsList className="grid w-full grid-cols-5 max-lg:hidden">
                  <TabsTrigger value="url" className="cursor-pointer">
                    <LinkIcon className="mr-2" />
                    {t.generate_from_url}
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="cursor-pointer">
                    <Upload className="mr-2" />
                    {t.upload_documents}
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="cursor-pointer">
                    <FileText className="mr-2" />
                    {t.manual_qa}
                  </TabsTrigger>
                  <TabsTrigger value="appearance" className="cursor-pointer">
                    <Palette className="mr-2" />
                    {t.appearance_tab}
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="cursor-pointer">
                    <Wand2 className="mr-2" />
                    {t.custom_voice_tab}
                  </TabsTrigger>
                </TabsList>

                {/* Tablet / Large phones: split into two rows of 2 (visible only when lg:hidden) */}
                <TabsList className="grid w-full grid-cols-2 max-sm:hidden lg:hidden">
                  <TabsTrigger value="url" className="cursor-pointer">
                    <LinkIcon className="mr-2" />
                    {t.generate_from_url}
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="cursor-pointer">
                    <Upload className="mr-2" />
                    {t.upload_documents}
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid w-full grid-cols-3 max-sm:hidden lg:hidden">
                  <TabsTrigger value="manual" className="cursor-pointer">
                    <FileText className="mr-2" />
                    {t.manual_qa}
                  </TabsTrigger>
                  <TabsTrigger value="appearance" className="cursor-pointer">
                    <Palette className="mr-2" />
                    {t.appearance_tab}
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="cursor-pointer">
                    <Wand2 className="mr-2" />
                    {t.custom_voice_tab}
                  </TabsTrigger>
                </TabsList>

                {/* Small phones: each tab in its own full-width TabsList (visible only when lg:hidden) */}
                <TabsList className="grid w-full grid-cols-1 sm:hidden">
                  <TabsTrigger value="url" className="cursor-pointer">
                    <LinkIcon className="mr-2" />
                    {t.generate_from_url}
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid w-full grid-cols-1 sm:hidden">
                  <TabsTrigger value="upload" className="cursor-pointer">
                    <Upload className="mr-2" />
                    {t.upload_documents}
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid w-full grid-cols-1 sm:hidden">
                  <TabsTrigger value="manual" className="cursor-pointer">
                    <FileText className="mr-2" />
                    {t.manual_qa}
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid w-full grid-cols-1 sm:hidden">
                  <TabsTrigger value="appearance" className="cursor-pointer">
                    <Palette className="mr-2" />
                    {t.appearance_tab}
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid w-full grid-cols-1 sm:hidden">
                  <TabsTrigger value="voice" className="cursor-pointer">
                    <Wand2 className="mr-2" />
                    {t.custom_voice_tab}
                  </TabsTrigger>
                </TabsList>

                {/* -- url tab -- */}
                <TabsContent value="url" className="pt-6">
                  <div
                    className={cn(
                      lang === "ar" && "rtl:text-right",
                      "space-y-4",
                    )}
                  >
                    <FormField
                      control={control}
                      name="botName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.bot_name}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t.bot_name_placeholder}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="botDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.bot_description}</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder={t.bot_description_placeholder}
                              rows={4}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.website_url}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder={t.website_url_placeholder}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="allowedOrigins"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.allowed_origins}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://clientsite.com, https://another.com"
                              value={field.value?.join(", ") ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="personality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.bot_personality}</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value ?? ""}
                              placeholder={t.bot_personality_placeholder}
                              rows={4}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="agentLanguage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.agent_language}</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t.agent_language_placeholder}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="en">
                                  {t.agent_language_english}
                                </SelectItem>
                                <SelectItem value="ar">
                                  {t.agent_language_arabic}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* -- upload tab -- */}
                <TabsContent value="upload" className="pt-6">
                  <div className="rounded-lg border-2 border-dashed p-6 text-center">
                    <p className="text-muted-foreground mb-4">
                      {t.upload_desc}
                    </p>

                    <Input
                      type="file"
                      accept=".pdf,.docx,.doc"
                      multiple
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />

                    {/* Selected (not-yet-uploaded) files */}
                    {selectedFiles.length > 0 && (
                      <div className="mt-3 text-sm">
                        <div className="mb-2 font-medium">
                          {t.selected_files}
                        </div>
                        <ul className="space-y-2">
                          {selectedFiles.map((f, idx) => (
                            <li
                              key={f.name + idx}
                              className="flex items-center justify-between"
                            >
                              <span
                                className="truncate max-lg:max-w-100 max-sm:max-w-50"
                                title={f.name}
                              >
                                {f.name.substring(0, 50)} (
                                {(f.size / (1024 * 1024)).toFixed(2)} MB)
                              </span>
                              <Trash2
                                className="size-4 cursor-pointer text-red-500"
                                onClick={() => removeSelected(idx)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex flex-col items-center gap-2">
                      <Button
                        type="button"
                        size="lg"
                        onClick={handleUpload}
                        disabled={uploading || selectedFiles.length === 0}
                      >
                        {uploading ? (
                          <>
                            <Spinner /> {t.processing}... ({uploadProgress}%)
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2" /> {t.upload_button}
                          </>
                        )}
                      </Button>

                      <div className="mt-3 w-full">
                        <div className="mb-2 font-medium">
                          {t.uploaded_files}
                        </div>
                        <ul className="space-y-1 text-xs break-all">
                          {existingFormFiles.length === 0 && (
                            <li className="text-muted-foreground">
                              {t.no_files_uploaded_yet}
                            </li>
                          )}
                          {existingFormFiles.map((u: string) => (
                            <li
                              key={u}
                              className="flex items-center justify-between"
                            >
                              <Link
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate max-lg:max-w-100 max-sm:max-w-50"
                                title={u}
                              >
                                {u.length > 50
                                  ? u.substring(0, 30) + "..." + u.slice(-15)
                                  : u}
                              </Link>
                              <Trash2
                                className="size-4 cursor-pointer text-red-500"
                                onClick={() => removeUploadedUrl(u)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-muted-foreground mt-2 text-xs">
                        {t.max_files_size_info
                          .replace("{{maxFiles}}", MAX_FILES.toString())
                          .replace("{{maxSize}}", MAX_SIZE_MB.toString())}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* -- manual / appearance / voice tabs unchanged -- */}
                <TabsContent value="manual" className="pt-6">
                  <div className="space-y-4 rtl:text-right">
                    <CardHeader className="p-0">
                      <CardTitle>{t.manual_qa_title}</CardTitle>
                      <CardDescription>{t.manual_qa_desc}</CardDescription>
                    </CardHeader>

                    {fields.map((f, idx) => (
                      <div
                        key={f.id}
                        className="flex flex-col gap-4 rounded-lg border p-4"
                      >
                        <div className="space-y-2">
                          <FormField
                            control={control}
                            name={`faq.${idx}.question` as const}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t.question_label}</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t.question_placeholder}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="space-y-2">
                          <FormField
                            control={control}
                            name={`faq.${idx}.answer` as const}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t.answer_label}</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    placeholder={t.answer_placeholder}
                                    rows={1}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => removeFaq(idx)}
                          disabled={fields.length <= 1}
                          className="w-fit"
                        >
                          <span>{t.remove_qa_button}</span>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addFaq()}
                    >
                      <PlusCircle className="mr-2" /> {t.add_qa_button}
                    </Button>
                  </div>
                </TabsContent>

                {/* Appearance Tab */}
                <TabsContent value="appearance" className="pt-6">
                  <div className="space-y-6 rtl:text-right">
                    <CardHeader className="p-0">
                      <CardTitle className="flex items-center gap-2">
                        <Palette className="text-primary" />{" "}
                        {t.widget_colors_title}
                      </CardTitle>
                      <CardDescription>{t.widget_colors_desc}</CardDescription>
                    </CardHeader>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={control}
                        name="primaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.primary_color}</FormLabel>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                {...field}
                                className="h-10 w-10 rounded-lg border p-1"
                              />
                              <FormControl>
                                <Input
                                  value={field.value}
                                  onChange={(e) =>
                                    field.onChange(e.target.value)
                                  }
                                  placeholder="#29ABE2"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="accentColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.accent_color}</FormLabel>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                {...field}
                                className="h-10 w-10 rounded-lg border p-1"
                              />
                              <FormControl>
                                <Input
                                  value={field.value}
                                  onChange={(e) =>
                                    field.onChange(e.target.value)
                                  }
                                  placeholder="#29E2C2"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Voice Tab */}
                <TabsContent value="voice" className="pt-6">
                  <VoiceIntegrationTab control={control} dir={dir} t={t} />
                </TabsContent>
              </Tabs>

              <CardFooter className="px-0 pt-6">
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !hasChanges}>
                    {isSubmitting ? (
                      <>
                        <Spinner /> {hasKb ? t.updating : t.generating}
                      </>
                    ) : hasKb ? (
                      t.update_button
                    ) : (
                      t.generate_button
                    )}
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupClient;
