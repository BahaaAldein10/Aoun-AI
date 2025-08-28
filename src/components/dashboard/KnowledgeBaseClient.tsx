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
import { Dictionary } from "@/contexts/dictionary-context";
import { deleteKb } from "@/lib/actions/dashboard";
import { SupportedLang } from "@/lib/dictionaries";
import { Document, Embedding, KnowledgeBase } from "@prisma/client";
import {
  Clipboard,
  FileText,
  HelpCircle,
  Sprout,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";

type initialKb = KnowledgeBase & {
  documents: Document[];
  embeddings: Embedding[];
};

export type KbMetadata = {
  personality?: string | null;
  voice?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  faq?: { question: string; answer: string }[] | null;
  url?: string | null;
  files?: string[] | null;
} | null;

type KnowledgeBaseClientProps = {
  initialKb: initialKb | null;
  lang: SupportedLang;
  dict: Dictionary;
};

const KnowledgeBaseClient = ({
  initialKb,
  lang,
  dict,
}: KnowledgeBaseClientProps) => {
  const [kb, setKb] = useState<initialKb | null>(initialKb);
  const router = useRouter();
  const t = dict.dashboard_knowledge_base;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  const metadata = kb?.metadata as KbMetadata;
  const personality = metadata?.personality ?? "";
  const voice = metadata?.voice ?? "";
  const primaryColor = metadata?.primaryColor ?? "";
  const accentColor = metadata?.accentColor ?? "";
  const faq = Array.isArray(metadata?.faq) ? metadata.faq : [];
  const sourceUrl = metadata?.url ?? null;
  const files = Array.isArray(metadata?.files) ? metadata.files : [];

  const documents = kb?.documents ?? [];
  const embeddings = kb?.embeddings ?? [];

  const safeJson = {
    title: kb?.title,
    description: kb?.description,
    metadata: kb?.metadata,
    documents: kb?.documents.map((d) => ({
      filename: d.filename,
      mimeType: d.mimeType,
      sourceUrl: d.sourceUrl,
      createdAt: d.createdAt,
    })),
    createdAt: new Date(kb?.createdAt ?? "").toLocaleString("en-US"),
  };

  const handleEdit = () => {
    router.push(`/${lang}/dashboard/setup`);
  };

  const handleCopy = () => {
    if (!kb) return;
    navigator.clipboard.writeText(JSON.stringify(safeJson, null, 2));
    toast.success(t.copy_json_success ?? "Copied JSON to clipboard");
  };

  const handleDownloadJson = () => {
    if (!kb) return;
    try {
      const content = JSON.stringify(safeJson, null, 2);
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aoun-kb-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t.download_json_success ?? "Downloaded JSON");
    } catch (err) {
      console.error(err);
      toast.error(t.download_json_error ?? "Failed to download");
    }
  };

  const handleDelete = async () => {
    if (!kb) return;

    const ok = await Swal.fire({
      text: t.delete_kb_confirm ?? "Delete knowledge base?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t.delete,
      cancelButtonText: t.cancel,
      focusCancel: true, // 👈 ensures Cancel is focused by default
      reverseButtons: true, // 👈 places Cancel on the left, safer UX
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
    });

    if (ok.isConfirmed) {
      try {
        await deleteKb(kb.userId);
        toast.success(t.delete_kb_success ?? "Knowledge base deleted");
        setKb(null);
        router.push(`/${lang}/dashboard`);
      } catch (error: unknown) {
        console.error("Failed to delete KB:", error);
        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          toast.error(t.delete_kb_failed ?? "Failed to delete knowledge base");
        }
      }
    }
  };

  // No KB view
  if (!kb) {
    return (
      <div className="space-y-6">
        <h1 className="font-headline text-2xl font-bold rtl:text-right">
          {t.title}
        </h1>
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>{t.no_kb_title}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3">
              <p>{t.no_kb_desc}</p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/${lang}/dashboard/setup`}>
                    {t.no_kb_button}
                  </Link>
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // KB present view
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleEdit}>
            <Sprout className="mr-2" /> {t.update_button}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            {t.delete_kb ?? "Delete"}
          </Button>
          <Button variant="outline" onClick={handleDownloadJson}>
            {t.download_json ?? "Download JSON"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className={isRtl ? "rtl:text-right" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sprout className="text-primary h-5 w-5" /> {t.bot_profile_title}
            </CardTitle>
            <CardDescription>{t.bot_profile_desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              <strong>{t.kb_title_label ?? "KB Title"}:</strong> {kb.title}
            </p>

            {kb.description && (
              <p>
                <strong>{t.kb_description_label ?? "Description"}:</strong>{" "}
                {kb.description}
              </p>
            )}

            {sourceUrl && (
              <p>
                <strong>{t.kb_source_label ?? "Source"}:</strong>{" "}
                <Link
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer noopenner"
                  className="text-primary underline"
                >
                  {sourceUrl}
                </Link>
              </p>
            )}

            {personality && (
              <p>
                <strong>{t.bot_personality ?? "Personality"}:</strong>{" "}
                <span className="italic">&quot;{personality}&quot;</span>
              </p>
            )}

            {voice && (
              <p>
                <strong>{t.bot_voice ?? "Voice"}:</strong> {voice}
              </p>
            )}

            <div className="flex items-center gap-4">
              <div>
                <div className="text-muted-foreground text-xs">
                  {t.documents_count}
                </div>
                <div className="font-medium">{documents.length}</div>
              </div>

              <div>
                <div className="text-muted-foreground text-xs">
                  {t.embeddings_count}
                </div>
                <div className="font-medium">{embeddings.length}</div>
              </div>

              {kb.createdAt && (
                <div>
                  <div className="text-muted-foreground text-xs">
                    {t.created_at_label ?? "Created At"}
                  </div>
                  <div className="font-medium">
                    {new Date(kb.createdAt).toLocaleString(locale)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 pt-2">
              {primaryColor && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded border"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <div className="font-mono text-xs">{primaryColor}</div>
                </div>
              )}
              {accentColor && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded border"
                    style={{ backgroundColor: accentColor }}
                  />
                  <div className="font-mono text-xs">{accentColor}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={isRtl ? "rtl:text-right" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="text-primary h-5 w-5" /> {t.documents_title}
            </CardTitle>
            <CardDescription>{t.documents_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                {t.no_documents}
              </div>
            ) : (
              <ul className="space-y-2">
                {documents.map((d, i) => (
                  <li
                    key={d.id ?? i}
                    className="flex items-center justify-between gap-4 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {d.filename ?? d.sourceUrl ?? "Document"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {d.mimeType ?? "—"} · {d.size ? `${d.size} bytes` : "—"}
                        {d.sourceUrl && (
                          <>
                            {" · "}
                            <Link
                              className="underline"
                              href={d.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.open_source ?? "Open source"}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-muted-foreground text-xs">
                      {d.createdAt
                        ? new Date(d.createdAt).toLocaleString(locale)
                        : "—"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={isRtl ? "rtl:text-right" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="text-primary h-5 w-5" /> {t.faq_title}
            </CardTitle>
            <CardDescription>{t.faq_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            {faq.length === 0 ? (
              <div className="text-muted-foreground text-sm">{t.no_faq}</div>
            ) : (
              <ul className="space-y-3">
                {faq.map(
                  (item: { question: string; answer: string }, idx: number) => (
                    <li key={idx} className="rounded-md border p-3">
                      <div className="font-medium">
                        Q: {item.question ?? "—"}
                      </div>
                      <div className="text-muted-foreground mt-1 text-sm">
                        A: {item.answer ?? "—"}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="text-primary h-5 w-5" /> {t.raw_json_title}
            </CardTitle>
            <CardDescription>{t.raw_json_desc}</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="bg-muted mt-2 rounded-lg p-4">
              <pre className="group relative overflow-x-auto text-sm" dir="ltr">
                <code>{JSON.stringify(safeJson, null, 2)}</code>
                <Button
                  className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={handleCopy}
                  variant="ghost"
                  size={"icon"}
                  aria-label={lang === "ar" ? "نسخ" : "Copy"}
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default KnowledgeBaseClient;
