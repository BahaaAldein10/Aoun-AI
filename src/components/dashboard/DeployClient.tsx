"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import {
  Clipboard,
  FileText,
  Globe,
  MessageSquare,
  Phone,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

/* ---------- small CodeSnippet component ---------- */
type CodeSnippetProps = { code: string; label?: string };

const CodeSnippet = ({ code, label }: CodeSnippetProps) => {
  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label ? `${label} copied` : "Copied");
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="bg-muted group relative mt-2 rounded-lg p-4" dir="ltr">
      <pre className="font-code overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => copy(code)}
        aria-label="Copy code"
      >
        <Clipboard className="h-4 w-4" />
      </Button>
    </div>
  );
};

/* ---------- DeployClient (main) ---------- */
type DeployClientProps = {
  lang: SupportedLang;
  dict: Dictionary;
};

const DeployClient = ({ lang, dict }: DeployClientProps) => {
  const t = dict.dashboard_deploy;
  const dir = lang === "ar" ? "rtl" : "ltr";

  // client-only computed values
  const [embedCode, setEmbedCode] = useState<string>("");
  const [voiceApiEndpoint, setVoiceApiEndpoint] = useState<string>("");
  const [messagingWebhookUrl, setMessagingWebhookUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;

    setEmbedCode(
      `<div id="aoun-chat-widget"></div>\n<script src="${origin}/widget.js" data-kb-id="YOUR_KB_ID" defer></script>`,
    );

    setVoiceApiEndpoint(`${origin}/api/call`);
    setMessagingWebhookUrl(`${origin}/api/messaging/webhook`);
  }, []);

  const apiRequestJson = useMemo(
    () =>
      `{
  "audio": "data:audio/webm;base64,...",
  "history": [],
  "knowledgeBase": {},
  "conversationId": "...",
  "voiceName": "Algenib"
}`,
    [],
  );

  const apiResponseJson = useMemo(
    () =>
      `{
  "text": "User's transcribed text.",
  "reply": "Bot text reply.",
  "audio": "data:audio/wav;base64,...",
  "conversationId": "voice_...",
  "source": "llm",
  "history": [...]
}`,
    [],
  );

  const copyToClipboard = async (text?: string, label?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        t.toast_success_desc?.replace("{type}", label ?? "value") ??
          `${label ?? "Value"} copied`,
      );
    } catch (err) {
      console.error(err);
      toast.error(t.toast_error_desc);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8" dir={dir}>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">{t.title_embed}</CardTitle>
          <CardDescription className="mt-1">{t.desc_embed}</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="messaging" dir={dir}>
            {/* Desktop: 5 columns (hidden on <= lg) */}
            <TabsList className="grid w-full grid-cols-5 max-lg:hidden">
              <TabsTrigger value="messaging" className="cursor-pointer">
                <MessageSquare className="mr-2" />
                {t.messaging_tab}
              </TabsTrigger>
              <TabsTrigger value="website" className="cursor-pointer">
                <Globe className="mr-2" />
                {t.website_tab}
              </TabsTrigger>
              <TabsTrigger value="api_docs" className="cursor-pointer">
                <FileText className="mr-2" />
                {t.api_docs_tab}
              </TabsTrigger>
              <TabsTrigger value="ios" className="cursor-pointer">
                <Smartphone className="mr-2" />
                {t.ios_tab}
              </TabsTrigger>
              <TabsTrigger value="android" className="cursor-pointer">
                <Phone className="mr-2" />
                {t.android_tab}
              </TabsTrigger>
            </TabsList>

            {/* Tablet / Large phones: split into two rows of 2 (visible only when lg:hidden) */}
            <TabsList className="grid w-full grid-cols-2 max-sm:hidden lg:hidden">
              <TabsTrigger value="messaging" className="cursor-pointer">
                <MessageSquare className="mr-2" />
                {t.messaging_tab}
              </TabsTrigger>
              <TabsTrigger value="website" className="cursor-pointer">
                <Globe className="mr-2" />
                {t.website_tab}
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-2 max-sm:hidden lg:hidden">
              <TabsTrigger value="api_docs" className="cursor-pointer">
                <FileText className="mr-2" />
                {t.api_docs_tab}
              </TabsTrigger>
              <TabsTrigger value="ios" className="cursor-pointer">
                <Smartphone className="mr-2" />
                {t.ios_tab}
              </TabsTrigger>
            </TabsList>

            {/* Small phones: each tab in its own full-width TabsList (visible only when lg:hidden) */}
            <TabsList className="grid w-full grid-cols-1 sm:hidden">
              <TabsTrigger value="messaging" className="cursor-pointer">
                <MessageSquare className="mr-2" />
                {t.messaging_tab}
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-1 sm:hidden">
              <TabsTrigger value="website" className="cursor-pointer">
                <Globe className="mr-2" />
                {t.website_tab}
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-1 sm:hidden">
              <TabsTrigger value="api_docs" className="cursor-pointer">
                <FileText className="mr-2" />
                {t.api_docs_tab}
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-1 sm:hidden">
              <TabsTrigger value="ios" className="cursor-pointer">
                <Smartphone className="mr-2" />
                {t.ios_tab}
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-1 sm:hidden">
              <TabsTrigger value="android" className="cursor-pointer">
                <Phone className="mr-2" />
                {t.android_tab}
              </TabsTrigger>
            </TabsList>

            {/* Messaging / Webhook */}
            <TabsContent value="messaging" className="pt-6">
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>{t.messaging_webhook_title}</AlertTitle>
                  <AlertDescription>
                    <p className="mb-4">{t.messaging_webhook_desc}</p>

                    <div className="bg-muted font-code flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
                      {messagingWebhookUrl || t.loading_placeholder}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(messagingWebhookUrl, "Webhook URL")
                        }
                        aria-label="Copy webhook url"
                      >
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>

                <p className="text-muted-foreground text-sm">{t.mobile_desc}</p>

                <div>
                  <h4 className="font-semibold">{t.api_endpoint_title}</h4>
                  <div className="bg-muted font-code mt-2 flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm">
                    POST {voiceApiEndpoint || t.loading_placeholder}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(voiceApiEndpoint, "Voice API endpoint")
                      }
                      aria-label="Copy voice api"
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Website embed */}
            <TabsContent value="website" className="pt-6">
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  {t.website_desc}
                </p>

                <CodeSnippet
                  code={embedCode || t.loading_placeholder}
                  label="Embed code"
                />

                <div>
                  <h4 className="font-semibold">{t.instructions_title}</h4>
                  <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1 text-sm">
                    <li>{t.instructions_step1}</li>
                    <li>{t.instructions_step2}</li>
                    <li>{t.instructions_step3}</li>
                  </ol>
                </div>
              </div>
            </TabsContent>

            {/* API docs */}
            <TabsContent value="api_docs" className="pt-6">
              <div className="space-y-6">
                <p className="text-muted-foreground text-sm">{t.mobile_desc}</p>

                <div>
                  <h4 className="font-semibold">{t.api_endpoint_title}</h4>
                  <div className="bg-muted font-code mt-2 flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm">
                    POST {voiceApiEndpoint || t.loading_placeholder}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(voiceApiEndpoint, "API endpoint")
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold">{t.api_request_title}</h4>
                    <CodeSnippet code={apiRequestJson} label="Request JSON" />
                  </div>

                  <div>
                    <h4 className="font-semibold">{t.api_response_title}</h4>
                    <CodeSnippet code={apiResponseJson} label="Response JSON" />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* iOS */}
            <TabsContent value="ios" className="pt-6">
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">{t.mobile_desc}</p>
                <div>
                  <h4 className="font-semibold">{t.api_endpoint_title}</h4>
                  <div className="bg-muted font-code mt-2 flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm">
                    POST {voiceApiEndpoint || t.loading_placeholder}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(voiceApiEndpoint, "API endpoint")
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <h4 className="font-semibold">{t.swift_example_title}</h4>
                <CodeSnippet
                  code={t.swift_example_code || t.example_placeholder || ""}
                  label="Swift example"
                />
              </div>
            </TabsContent>

            {/* Android */}
            <TabsContent value="android" className="pt-6">
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">{t.mobile_desc}</p>
                <div>
                  <h4 className="font-semibold">{t.api_endpoint_title}</h4>
                  <div className="bg-muted font-code mt-2 flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm">
                    POST {voiceApiEndpoint || t.loading_placeholder}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(voiceApiEndpoint, "API endpoint")
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <h4 className="font-semibold">{t.kotlin_example_title}</h4>
                <CodeSnippet
                  code={t.kotlin_example_code || t.example_placeholder || ""}
                  label="Kotlin example"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeployClient;
