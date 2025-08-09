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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { SetupFormValues, setupSchema } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileText,
  Link as LinkIcon,
  Mic,
  Palette,
  PlusCircle,
  Sprout,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";

/* --- voices (UI only) --- */
const availableVoices = [
  { name: "Algenib", gender: "Female" },
  { name: "Andromeda", gender: "Male" },
  { name: "Perseus", gender: "Male" },
  { name: "Sirius", gender: "Female" },
];

const SetupClient = ({
  lang,
  dict,
}: {
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.dashboard_setup;
  // const [isCrawling, setIsCrawling] = useState(false);
  // const [isTestingVoice, startVoiceTestTransition] = useTransition();
  const websiteDataRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema(dict)),
    defaultValues: {
      botName: "Aoun",
      url: "",
      personality: "",
      voice: availableVoices[0].name,
      primaryColor: "#29ABE2",
      accentColor: "#29E2C2",
      faq: [{ question: "", answer: "" }],
    },
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "faq",
  });

  const handleTestVoice = () => {};

  async function onSubmit() {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    toast.success("Success");
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
                <TabsList className="grid w-full grid-cols-2 lg:hidden">
                  <TabsTrigger value="url" className="cursor-pointer">
                    <LinkIcon className="mr-2" />
                    {t.generate_from_url}
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="cursor-pointer">
                    <Upload className="mr-2" />
                    {t.upload_documents}
                  </TabsTrigger>
                </TabsList>

                <TabsList className="grid w-full grid-cols-2 lg:hidden">
                  <TabsTrigger value="manual" className="cursor-pointer">
                    <FileText className="mr-2" />
                    {t.manual_qa}
                  </TabsTrigger>
                  <TabsTrigger value="appearance" className="cursor-pointer">
                    <Palette className="mr-2" />
                    {t.appearance_tab}
                  </TabsTrigger>
                </TabsList>

                {/* Small phones: single full-width row for the last tab (visible only when lg:hidden) */}
                <TabsList className="grid w-full grid-cols-1 lg:hidden">
                  <TabsTrigger value="voice" className="cursor-pointer">
                    <Wand2 className="mr-2" />
                    {t.custom_voice_tab}
                  </TabsTrigger>
                </TabsList>

                {/* URL Tab */}
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

                {/* Upload Tab (UI only) */}
                <TabsContent value="upload" className="pt-6">
                  <div className="rounded-lg border-2 border-dashed p-6 text-center">
                    <p className="text-muted-foreground mb-4">
                      {t.upload_desc}
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => toast(t.upload_button + " — Coming soon")}
                    >
                      <Upload className="mr-2" /> {t.upload_button}
                    </Button>
                  </div>
                </TabsContent>

                {/* Manual Q&A Tab */}
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
                  <div className="space-y-4 rtl:text-right">
                    <CardHeader className="mb-4 p-0 rtl:text-right">
                      <CardTitle className="flex items-center gap-2">
                        <Wand2 className="text-primary" /> {t.voice_clone_title}
                      </CardTitle>
                      <CardDescription>{t.voice_clone_desc}</CardDescription>
                    </CardHeader>

                    <FormField
                      control={control}
                      name="voice"
                      render={() => (
                        <FormItem>
                          <FormLabel>{t.bot_voice}</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Controller
                                control={control}
                                name="voice"
                                render={({ field: cField }) => (
                                  <Select
                                    value={cField.value}
                                    onValueChange={cField.onChange}
                                    dir={dir}
                                  >
                                    <SelectTrigger
                                      id="voice"
                                      className="min-w-[180px] cursor-pointer"
                                    >
                                      <SelectValue
                                        placeholder={t.bot_voice_placeholder}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableVoices.map((v) => (
                                        <SelectItem key={v.name} value={v.name}>
                                          <div className="flex items-center gap-2">
                                            <span>{v.name}</span>
                                            <span className="text-muted-foreground text-xs">
                                              ({v.gender})
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </FormControl>

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleTestVoice}
                              // disabled={isTestingVoice}
                            >
                              <Volume2 className="h-4 w-4 rtl:scale-x-[-1] rtl:transform" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="rounded-lg border-2 border-dashed p-6 text-center">
                      <p className="text-muted-foreground mb-4">
                        {t.voice_clone_prompt}
                      </p>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() =>
                          toast(t.voice_clone_record_button + " — Coming soon")
                        }
                      >
                        <Mic className="mr-2" /> {t.voice_clone_record_button}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <CardFooter className="px-0 pt-6">
                <div className="flex justify-end">
                  {/* <Button type="submit" disabled={isSubmitting || isCrawling}>
                    {isCrawling
                      ? (t.crawling_button ?? "Reading website...")
                      : (t.generate_button ?? "Create Knowledge Base")}
                  </Button> */}
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? (t.crawling_button ?? "Reading website...")
                      : (t.generate_button ?? "Create Knowledge Base")}
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
