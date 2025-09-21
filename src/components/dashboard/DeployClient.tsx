"use client";

import { IntegrationItem } from "@/app/[lang]/(dashboard)/dashboard/deploy/[kbId]/page";
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

/* ---------- Types for integration & tokens ---------- */
type GeneratedToken = { integrationId: string | null; token: string };

/* ---------- DeployClient (main) ---------- */
type DeployClientProps = {
  lang: SupportedLang;
  dict: Dictionary;
  kbId?: string | null;
  integrations: IntegrationItem[];
};

const DeployClient = ({
  lang,
  dict,
  kbId,
  integrations,
}: DeployClientProps) => {
  const t = dict.dashboard_deploy;
  const dir = lang === "ar" ? "rtl" : "ltr";

  // client-only computed values
  const [embedCode, setEmbedCode] = useState<string>("");
  const [voiceApiEndpoint, setVoiceApiEndpoint] = useState<string>("");
  const [messagingWebhookUrl, setMessagingWebhookUrl] = useState<string>("");

  // verify token UI state
  const [verifyTokens, setVerifyTokens] = useState<GeneratedToken[] | null>(
    null,
  );
  const [verifyGenLoading, setVerifyGenLoading] = useState(false);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);

  // integrations list
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<
    string[]
  >([]);

  // generated API key (plaintext shown only after generation)
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;

    setEmbedCode(
      `<div id="aoun-chat-widget"></div>\n<script src="${origin}/widget.js" data-kb-id="${kbId ?? "YOUR_KB_ID"}" data-api-key="YOUR_API_KEY" defer></script>`,
    );

    setVoiceApiEndpoint(`${origin}/api/call`);
    setMessagingWebhookUrl(`${origin}/api/messaging/webhook`);
  }, [kbId]);

  // load user integrations so user can select which integration to link the token to
  useEffect(() => {
    if (!kbId) return;

    if (Array.isArray(integrations) && integrations.length > 0) {
      const ids = integrations.map((i) => i.id);
      setSelectedIntegrationIds([ids[0]]);
    }
  }, [integrations, kbId]);

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

  // toggle integration selection (multi-select)
  function toggleIntegration(id: string) {
    setSelectedIntegrationIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  async function generateVerifyToken() {
    if (!kbId) {
      toast.error(t.kb_not_ready ?? "KB not ready");
      return;
    }

    setVerifyGenLoading(true);
    setVerifyTokens(null);

    try {
      // Build body
      let body: Record<string, unknown> = {};
      if (applyToAll) {
        // use all integration ids
        const allIds = (integrations ?? []).map((i) => i.id);
        body.integrationIds = allIds;
      } else if (selectedIntegrationIds.length > 0) {
        body.integrationIds = selectedIntegrationIds;
      } else {
        // no integrations selected -> legacy single kb token will be generated by server
        body = {};
      }

      const payload = Object.keys(body).length
        ? JSON.stringify(body)
        : undefined;
      const options: RequestInit = { method: "POST" };
      
      if (payload) {
        options.headers = { "Content-Type": "application/json" };
        options.body = payload;
      }

      const res = await fetch(`/api/kb/${kbId}/generate-verify-token`, options);

      const json = await res.json();

      if (!res.ok) {
        toast.error(
          json?.error ??
            t.failed_generate_verify ??
            "Failed to generate verify token",
        );
        return;
      }

      // Server returns tokens: [{ integrationId, token }, ...] (or legacy token list with integrationId:null)
      const tokens: GeneratedToken[] = Array.isArray(json?.tokens)
        ? json.tokens
        : json?.tokens
          ? [json.tokens]
          : json?.tokens // fallback
            ? Array.isArray(json.tokens)
              ? json.tokens
              : []
            : json?.tokens
              ? [json.tokens]
              : json?.verifyToken
                ? [{ integrationId: null, token: json.verifyToken }]
                : [];

      // Normalize: sometimes server returns { tokens } or { tokens: [...] }
      let normalized: GeneratedToken[] = [];
      if (Array.isArray(tokens)) normalized = tokens;
      else if (json?.tokens && Array.isArray(json.tokens))
        normalized = json.tokens;
      else if (json?.verifyToken)
        normalized = [{ integrationId: null, token: json.verifyToken }];

      if (
        normalized.length === 0 &&
        json?.tokens &&
        Array.isArray(json.tokens)
      ) {
        normalized = json.tokens;
      }
      if (normalized.length === 0 && json?.token) {
        normalized = [{ integrationId: null, token: json.token }];
      }

      if (normalized.length === 0) {
        // final fallback: if backend returned { success: true, tokens: [] } or { verifyToken }
        if (json?.tokens && Array.isArray(json.tokens))
          normalized = json.tokens;
        else if (json?.verifyToken)
          normalized = [{ integrationId: null, token: json.verifyToken }];
      }

      if (normalized.length === 0) {
        // nothing returned
        toast.error(
          t.failed_generate_verify ?? "Failed to generate verify token",
        );
        return;
      }

      setVerifyTokens(normalized);
      toast.success(
        t.verify_token_generated ??
          "Verify token(s) generated — copy them into Meta dev portal now",
      );
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

                      <div className="mt-4 grid gap-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="font-medium">
                              {t.connected_integrations}
                            </div>
                          </div>

                          <div className="mt-2 space-y-2">
                            {integrations && integrations.length === 0 && (
                              <div className="text-muted-foreground text-sm">
                                {t.no_integrations ??
                                  "No integrations connected"}
                              </div>
                            )}

                            {integrations && integrations.length > 0 && (
                              <div className="grid gap-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    id="apply_all"
                                    type="checkbox"
                                    checked={applyToAll}
                                    onChange={() => setApplyToAll((s) => !s)}
                                  />
                                  <label
                                    htmlFor="apply_all"
                                    className="text-sm"
                                  >
                                    {t.apply_to_all_integrations ??
                                      "Link to all connected integrations"}
                                  </label>
                                </div>

                                {!applyToAll &&
                                  integrations.map((integ) => (
                                    <label
                                      key={integ.id}
                                      className="flex items-center gap-2 rounded border px-3 py-2"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedIntegrationIds.includes(
                                          integ.id,
                                        )}
                                        onChange={() =>
                                          toggleIntegration(integ.id)
                                        }
                                      />
                                      <div className="flex-1 text-sm">
                                        <div className="font-medium">
                                          {integ.provider} — {integ.type}
                                        </div>
                                        <div className="text-muted-foreground text-xs">
                                          {
                                            (integ.credentials
                                              ?.phone_number_id ??
                                              integ.credentials?.page_id ??
                                              integ.credentials
                                                ?.instagram_business_account_id ??
                                              "") as string
                                          }
                                        </div>
                                      </div>
                                    </label>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            onClick={generateVerifyToken}
                            disabled={verifyGenLoading}
                          >
                            {verifyGenLoading
                              ? t.generating
                              : t.generate_verify_token}
                          </Button>

                          <div className="text-muted-foreground text-sm">
                            {t.token_note}
                          </div>
                        </div>

                        {/* show generated tokens */}
                        {verifyTokens && verifyTokens.length > 0 && (
                          <div className="space-y-2">
                            <div className="font-semibold">
                              {t.generated_tokens}
                            </div>
                            <div className="grid gap-2">
                              {verifyTokens.map((tk, idx) => {
                                const integ = integrations?.find(
                                  (i) => i.id === tk.integrationId,
                                );
                                const label = tk.integrationId
                                  ? `${integ?.provider ?? "integration"} (${integ?.type ?? ""})`
                                  : "Legacy";
                                return (
                                  <div
                                    key={idx}
                                    className="bg-muted flex items-center gap-2 rounded p-2 font-mono text-sm"
                                  >
                                    <div className="flex-1">
                                      <div className="text-muted-foreground text-xs">
                                        {label}
                                      </div>
                                      <div className="break-all select-all">
                                        {tk.token}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          navigator.clipboard.writeText(
                                            tk.token,
                                          );
                                          toast.success(t.copied ?? "Copied");
                                        }}
                                        aria-label="Copy token"
                                      >
                                        <Clipboard className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="text-muted-foreground text-xs">
                              {t.verify_after_generate ??
                                "Paste each token into the corresponding Meta webhook Verify Token field."}
                            </div>
                          </div>
                        )}
                      </div>
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
