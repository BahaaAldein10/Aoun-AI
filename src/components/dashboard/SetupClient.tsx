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
import { createKb, saveFileToDB, updateKb } from "@/lib/actions/dashboard";
import { qstash } from "@/lib/actions/qstash";
import { SupportedLang } from "@/lib/dictionaries";
import { SetupFormValues, setupSchema } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Document, KnowledgeBase } from "@prisma/client";
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
import React, { useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import Spinner from "../shared/Spinner";
import VoiceIntegrationTab, { availableVoices } from "./VoiceIntegrationTab";

type initialKb = KnowledgeBase & {
  documents: Document[];
};

type KbMetadata = {
  personality?: string | null;
  voice?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  faq?: { question: string; answer: string }[] | null;
  url?: string | null;
  files?: string[] | null;
} | null;

const SetupClient = ({
  initialKb,
  hasKb,
  lang,
  dict,
}: {
  initialKb: initialKb | null;
  hasKb: boolean;
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");

  const t = dict.dashboard_setup;
  const websiteDataRef = useRef<HTMLInputElement | null>(null);

  const metadata = initialKb?.metadata as KbMetadata | null;

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema(dict)),
    defaultValues: {
      botName: initialKb?.title || "",
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
    },
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, errors },
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "faq",
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
    } else {
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    const MAX_SIZE_MB = 5;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    if (file.size > MAX_SIZE_BYTES) {
      alert(`File is too large! Please select a file under ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);

    try {
      // 1) Upload file to storage endpoint
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Upload API error", err);
        toast.error("Upload failed (server).");
        return;
      }

      const data = await res.json();
      const downloadURL = data?.url;
      if (!downloadURL) {
        console.error("No URL returned from /api/upload", data);
        toast.error("Upload failed (no URL).");
        return;
      }

      // Keep URL for UI
      setUrl(downloadURL);
      form.setValue("files", [downloadURL]);

      // 2) Persist uploadedFile record in DB (server action)
      const result = await saveFileToDB({
        fileUrl: downloadURL,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        lang,
      });

      if (!result?.success || !result.file?.id) {
        console.error("Failed to save file metadata:", result);
        toast.error("Uploaded but failed to save file info.");
        return;
      }

      toast.success("Upload saved. Ingestion will start shortly.");
      setFile(null);
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Upload failed. See console for details.");
    } finally {
      setUploading(false);
    }
  };

  async function onSubmit(values: SetupFormValues) {
    if (!values.url && (!values.files || values.files.length === 0)) {
      toast.error("Provide a URL or upload at least one file");
      return;
    }

    const metadata = {
      personality: values.personality,
      voice: values.voice,
      primaryColor: values.primaryColor,
      accentColor: values.accentColor,
      faq: values.faq || [],
      url: values.url || null,
      files: values.files || [],
    };

    try {
      if (hasKb) {
        const res = await updateKb({ ...metadata, title: values.botName });
        toast.success("Knowledge Base updated.");
        return res;
      } else {
        const res = await createKb({ ...metadata, title: values.botName });
        toast.success("Knowledge Base created.");

        await qstash(res);
        
        return res;
      }
    } catch (error: unknown) {
      console.error("Failed to create/update Knowledge Base", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An unexpected error occurred");
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
                      accept=".pdf,.docx"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                    {file && <p className="mt-2 text-sm">{file.name}</p>}

                    <Button
                      type="button"
                      size="lg"
                      onClick={handleUpload}
                      disabled={uploading}
                      className="mt-4"
                    >
                      {uploading ? (
                        <>
                          {/* <Spinner /> {t.uploading ?? "Uploading..."} */}
                          <Spinner /> {"Uploading..."}
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2" /> {t.upload_button}
                        </>
                      )}
                    </Button>

                    {url && (
                      <p className="mt-3 text-xs break-all">
                        Uploaded URL:{" "}
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      </p>
                    )}
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
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner /> {t.generate_button}
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
