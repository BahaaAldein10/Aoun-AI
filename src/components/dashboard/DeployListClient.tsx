"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { KnowledgeBase } from "@prisma/client";
import {
  AlertTriangle,
  Calendar,
  Database,
  FileText,
  Globe,
  Rocket,
  Settings,
  Sprout,
} from "lucide-react";
import Link from "next/link";
import { KbMetadata } from "./KnowledgeBaseClient";

type KnowledgeBaseWithCounts = KnowledgeBase & {
  documentCount: number;
  embeddingCount: number;
  isDeployed?: boolean; // You might want to add deployment status
};

type DeployListClientProps = {
  knowledgeBases: KnowledgeBaseWithCounts[];
  lang: SupportedLang;
  dict: Dictionary;
};

const DeployListClient = ({
  knowledgeBases,
  lang,
  dict,
}: DeployListClientProps) => {
  const t = dict.dashboard_deploy;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  // Filter knowledge bases that have content (documents or embeddings)
  const deployableKbs = knowledgeBases.filter(
    (kb) => kb.documentCount > 0 || kb.embeddingCount > 0,
  );

  const emptyKbs = knowledgeBases.filter(
    (kb) => kb.documentCount === 0 && kb.embeddingCount === 0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">
            {t.title || "Deploy Knowledge Bases"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t.description ||
              "Deploy your knowledge bases as chatbots and manage their settings"}
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <Card className={isRtl ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="text-primary h-5 w-5" />
            {t.overview_title || "Deployment Overview"}
          </CardTitle>
          <CardDescription>
            {t.overview_desc ||
              "Summary of your knowledge bases and their deployment status"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div>
              <div className="text-muted-foreground text-xs">
                {t.total_kbs || "Total Knowledge Bases"}
              </div>
              <div className="font-medium">{knowledgeBases.length}</div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">
                {t.deployable_kbs || "Ready to Deploy"}
              </div>
              <div className="font-medium text-green-600">
                {deployableKbs.length}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">
                {t.empty_kbs || "Needs Content"}
              </div>
              <div className="font-medium text-orange-600">
                {emptyKbs.length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deployable Knowledge Bases */}
      {deployableKbs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {t.ready_to_deploy || "Ready to Deploy"}
            </h2>
            <Badge variant="secondary">{deployableKbs.length}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deployableKbs.map((kb) => {
              const metadata = kb.metadata as KbMetadata;
              const sourceUrl = metadata?.url ?? null;

              return (
                <Card key={kb.id} className={isRtl ? "rtl:text-right" : ""}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Sprout className="text-primary h-5 w-5 flex-shrink-0" />
                        <span className="truncate">{kb.title}</span>
                      </div>
                      <Badge variant="outline" className="flex-shrink-0">
                        <Globe className="mr-1 h-3 w-3" />
                        {t.ready || "Ready"}
                      </Badge>
                    </CardTitle>
                    {kb.description && (
                      <CardDescription className="line-clamp-2">
                        {kb.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {sourceUrl && (
                      <div>
                        <div className="text-muted-foreground mb-1 text-xs">
                          {t.source || "Source"}
                        </div>
                        <Link
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary block truncate text-sm underline"
                        >
                          {sourceUrl}
                        </Link>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-muted-foreground text-xs">
                          {t.documents || "Documents"}
                        </div>
                        <div className="flex items-center gap-1 font-medium">
                          <FileText className="h-3 w-3" />
                          {kb.documentCount}
                        </div>
                      </div>

                      <div>
                        <div className="text-muted-foreground text-xs">
                          {t.embeddings || "Embeddings"}
                        </div>
                        <div className="flex items-center gap-1 font-medium">
                          <Database className="h-3 w-3" />
                          {kb.embeddingCount}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground text-xs">
                        {t.created_at || "Created"}
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        {new Date(kb.createdAt).toLocaleString(locale)}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button asChild size="sm" className="flex-1">
                        <Link href={`/${lang}/dashboard/deploy/${kb.id}`}>
                          <Rocket className="mr-2 h-3 w-3" />
                          {t.deploy_button || "Deploy"}
                        </Link>
                      </Button>

                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/${lang}/dashboard/knowledge-base/${kb.id}`}
                        >
                          <Settings className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Knowledge Bases that need content */}
      {emptyKbs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {t.needs_content || "Needs Content"}
            </h2>
            <Badge variant="outline">{emptyKbs.length}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {emptyKbs.map((kb) => (
              <Card
                key={kb.id}
                className={`${isRtl ? "rtl:text-right" : ""} opacity-75`}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Sprout className="text-muted-foreground h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{kb.title}</span>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {t.empty || "Empty"}
                    </Badge>
                  </CardTitle>
                  {kb.description && (
                    <CardDescription className="line-clamp-2">
                      {kb.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-muted-foreground text-xs">
                        {t.documents || "Documents"}
                      </div>
                      <div className="flex items-center gap-1 font-medium">
                        <FileText className="h-3 w-3" />0
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground text-xs">
                        {t.embeddings || "Embeddings"}
                      </div>
                      <div className="flex items-center gap-1 font-medium">
                        <Database className="h-3 w-3" />0
                      </div>
                    </div>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t.add_content_message ||
                        "Add documents or content to enable deployment"}
                    </AlertDescription>
                  </Alert>

                  <div className="pt-2">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="w-full"
                    >
                      <Link href={`/${lang}/dashboard/knowledge-base/${kb.id}`}>
                        {t.add_content || "Add Content"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {knowledgeBases.length === 0 && (
        <Alert>
          <Rocket className="h-4 w-4" />
          <AlertTitle>
            {t.no_knowledge_bases || "No Knowledge Bases"}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3">
              <p>
                {t.no_knowledge_bases_desc ||
                  "You need to create knowledge bases before you can deploy them. Create your first knowledge base to get started."}
              </p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/${lang}/dashboard/setup/new`}>
                    <Sprout className="mr-2 h-4 w-4" />
                    {t.create_knowledge_base || "Create Knowledge Base"}
                  </Link>
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default DeployListClient;
