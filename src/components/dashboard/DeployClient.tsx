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
  kbId?: string | null;
};

const DeployClient = ({ lang, dict, kbId }: DeployClientProps) => {
  const t = dict.dashboard_deploy;
  const dir = lang === "ar" ? "rtl" : "ltr";

  // client-only computed values
  const [embedCode, setEmbedCode] = useState<string>("");
  const [voiceApiEndpoint, setVoiceApiEndpoint] = useState<string>("");
  const [messagingWebhookUrl, setMessagingWebhookUrl] = useState<string>("");

  // deploy config
  const [allowedOriginsRaw, setAllowedOriginsRaw] = useState<string>(""); // comma separated
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [verifyTokenPlain, setVerifyTokenPlain] = useState<string | null>(null);
  const [verifyGenLoading, setVerifyGenLoading] = useState(false);

  // generated API key (plaintext shown only after generation)
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;

    setEmbedCode(
      `<div id="aoun-chat-widget"></div>\n<script src="${origin}/widget.js" data-kb-id="${kbId ?? "YOUR_KB_ID"}" defer></script>`,
    );

    setVoiceApiEndpoint(`${origin}/api/call`);
    setMessagingWebhookUrl(`${origin}/api/messaging/webhook`);
  }, [kbId]);

  // load deploy config for this KB (allowedOrigins, isPublic)
  useEffect(() => {
    if (!kbId) return;
    setLoadingConfig(true);
    fetch(`/api/kb/${kbId}/deploy-config`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.allowedOrigins && Array.isArray(json.allowedOrigins)) {
          setAllowedOriginsRaw(json.allowedOrigins.join(", "));
        } else {
          setAllowedOriginsRaw("");
        }
        setIsPublic(false);
      })
      .catch((err) => {
        console.warn("Failed to load deploy config:", err);
      })
      .finally(() => setLoadingConfig(false));
  }, [kbId]);

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

  async function generateVerifyToken() {
    if (!kbId) {
      toast.error(t.kb_not_ready ?? "KB not ready");
      return;
    }
    setVerifyGenLoading(true);
    try {
      const res = await fetch(`/api/kb/${kbId}/generate-verify-token`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json?.verifyToken) {
        setVerifyTokenPlain(json.verifyToken);
        toast.success(
          t.verify_token_generated ??
            "Verify token generated — copy it into Meta dev portal now",
        );
      } else {
        toast.error(
          json?.error ??
            t.failed_generate_verify ??
            "Failed to generate verify token",
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(t.network_error ?? "Network error");
    } finally {
      setVerifyGenLoading(false);
    }
  }

  // generate/regenerate API key
  async function generateApiKey() {
    if (!kbId) {
      toast.error(t.kb_not_available ?? "KB not available");
      return;
    }
    setGenLoading(true);
    setGeneratedApiKey(null);
    try {
      const resp = await fetch(`/api/kb/${kbId}/generate-api-key`, {
        method: "POST",
      });
      const json = await resp.json();
      if (resp.ok && json?.apiKey) {
        setGeneratedApiKey(json.apiKey);
        toast.success(t.api_key_generated ?? "API key generated — copy it now");
      } else {
        toast.error(
          json?.error ?? t.failed_generate_key ?? "Failed to generate key",
        );
      }
    } catch (err) {
      console.error("generateApiKey error:", err);
      toast.error(t.failed_generate_key ?? "Failed to generate key");
    } finally {
      setGenLoading(false);
    }
  }

  // open preview (owner-only preview)
  function openPreview() {
    if (!kbId) {
      toast.error(t.kb_not_available ?? "KB not available");
      return;
    }
    // open a small popup window for preview
    const url = `/widget/frame?kbid=${encodeURIComponent(kbId)}&preview=true`;
    window.open(url, "aoun_widget_preview", "width=420,height=640");
  }

  return (
    <div className="grid grid-cols-1 gap-8" dir={dir}>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">{t.title_embed}</CardTitle>
          <CardDescription className="mt-1">{t.desc_embed}</CardDescription>
        </CardHeader>

        <CardContent>
          {/* top row: KB id, preview */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-muted-foreground text-sm">
                {t.kb_id_label}
              </div>
              <div className="mt-1 font-mono text-sm">
                {kbId ?? t.kb_not_created}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={openPreview} disabled={!kbId}>
                {t.preview_widget}
              </Button>
            </div>
          </div>

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
                          copyToClipboard(messagingWebhookUrl, t.webhook_url)
                        }
                        aria-label={t.copy_webhook_url}
                      >
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-4">
                      <h4 className="font-semibold">
                        {t.webhook_verify_token_title}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t.webhook_verify_token_desc}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          onClick={generateVerifyToken}
                          disabled={verifyGenLoading}
                        >
                          {verifyGenLoading
                            ? t.generating
                            : t.generate_verify_token}
                        </Button>

                        {verifyTokenPlain && (
                          <div className="bg-muted flex items-center gap-2 rounded p-2 font-mono text-sm">
                            <span className="select-all">
                              {verifyTokenPlain}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(verifyTokenPlain);
                                toast.success(t.copied);
                              }}
                            >
                              <Clipboard className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <p className="text-muted-foreground mt-2 text-xs">
                        {t.token_note}
                      </p>
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
                        copyToClipboard(voiceApiEndpoint, t.voice_api_endpoint)
                      }
                      aria-label={t.copy_voice_api}
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
                  label={t.embed_code}
                />

                <Alert>
                  <AlertTitle>{t.api_key_title}</AlertTitle>
                  <AlertDescription>
                    {t.api_key_desc}

                    <div className="mt-2 flex items-center gap-2">
                      <Button onClick={generateApiKey} disabled={genLoading}>
                        {genLoading ? t.generating : t.generate_api_key}
                      </Button>

                      {generatedApiKey && (
                        <div className="bg-muted flex items-center gap-2 rounded p-2 font-mono text-sm">
                          <span className="select-all">{generatedApiKey}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              copyToClipboard(generatedApiKey, t.api_key)
                            }
                          >
                            <Clipboard className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <p className="text-muted-foreground mt-2 text-xs">
                      {t.api_key_warning}
                    </p>
                  </AlertDescription>
                </Alert>

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
                        copyToClipboard(voiceApiEndpoint, t.api_endpoint)
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold">{t.api_request_title}</h4>
                    <CodeSnippet code={apiRequestJson} label={t.request_json} />
                  </div>

                  <div>
                    <h4 className="font-semibold">{t.api_response_title}</h4>
                    <CodeSnippet
                      code={apiResponseJson}
                      label={t.response_json}
                    />
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
                        copyToClipboard(voiceApiEndpoint, t.api_endpoint)
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <h4 className="font-semibold">{t.swift_example_title}</h4>
                <CodeSnippet
                  code={t.swift_example_code || t.example_placeholder || ""}
                  label={t.swift_example}
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
                        copyToClipboard(voiceApiEndpoint, t.api_endpoint)
                      }
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <h4 className="font-semibold">{t.kotlin_example_title}</h4>
                <CodeSnippet
                  code={t.kotlin_example_code || t.example_placeholder || ""}
                  label={t.kotlin_example}
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
