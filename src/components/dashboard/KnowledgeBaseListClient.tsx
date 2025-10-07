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
import { SupportedLang } from "@/lib/dictionaries";
import { KnowledgeBase, Subscription, Plan } from "@prisma/client";
import {
  FileText,
  Plus,
  Sprout,
  Calendar,
  Database,
  Brain,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { KbMetadata } from "./KnowledgeBaseClient";

type KnowledgeBaseWithCounts = KnowledgeBase & {
  documentCount: number;
  embeddingCount: number;
};

type SubscriptionWithPlan = Subscription & {
  plan: Plan;
};

type KnowledgeBaseListClientProps = {
  knowledgeBases: KnowledgeBaseWithCounts[];
  subscription: SubscriptionWithPlan | null;
  canCreateMore: boolean;
  lang: SupportedLang;
  dict: Dictionary;
};

const KnowledgeBaseListClient = ({
  knowledgeBases,
  subscription,
  canCreateMore,
  lang,
  dict,
}: KnowledgeBaseListClientProps) => {
  const t = dict.dashboard_knowledge_base;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  const allowedKnowledgeBases = subscription?.plan?.agents || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">
            {t.list_title || "Knowledge Bases"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t.list_description || "Manage all your knowledge bases"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCreateMore ? (
            <Button
              disabled={!canCreateMore}
              onClick={() => {
                if (canCreateMore) {
                  window.location.href = `/${lang}/dashboard/setup/new`;
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t.create_new_kb || "Create New"}
            </Button>
          ) : (
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              {t.limit_reached || "Limit Reached"}
            </Button>
          )}
        </div>
      </div>

      {/* Subscription Info */}
      <Card className={isRtl ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="text-primary h-5 w-5" />
            {t.subscription_title || "Subscription Status"}
          </CardTitle>
          <CardDescription>
            {t.subscription_desc || "Your current plan and limits"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-muted-foreground text-xs">
                {t.plan_name || "Plan"}
              </div>
              <div className="font-medium">
                {subscription?.plan?.name || "Free"}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">
                {t.knowledge_bases_used || "Knowledge Bases"}
              </div>
              <div className="font-medium">
                {knowledgeBases.length} / {allowedKnowledgeBases}
              </div>
            </div>

            {subscription && (
              <div>
                <div className="text-muted-foreground text-xs">
                  {t.status || "Status"}
                </div>
                <div className="font-medium capitalize">
                  {subscription.status.toLowerCase()}
                </div>
              </div>
            )}
          </div>

          {!canCreateMore && (
            <Alert className="mt-4">
              <FileText className="h-4 w-4" />
              <AlertTitle>
                {t.limit_reached_title || "Limit Reached"}
              </AlertTitle>
              <AlertDescription>
                {t.limit_reached_desc ||
                  "You've reached your knowledge base limit. Upgrade your plan to create more."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Bases List */}
      {knowledgeBases.length === 0 ? (
        <Alert>
          <Sprout className="h-4 w-4" />
          <AlertTitle>
            {t.no_knowledge_bases || "No Knowledge Bases"}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3">
              <p>
                {t.no_knowledge_bases_desc ||
                  "You haven't created any knowledge bases yet. Create your first one to get started."}
              </p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/${lang}/dashboard/setup/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t.create_first_kb || "Create Your First Knowledge Base"}
                  </Link>
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {knowledgeBases.map((kb) => {
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
                    <Link
                      href={`/${lang}/dashboard/knowledge-base/${kb.id}`}
                      className="flex-shrink-0"
                    >
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
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

                  <div className="pt-2">
                    <Button asChild size="sm" className="w-full">
                      <Link href={`/${lang}/dashboard/knowledge-base/${kb.id}`}>
                        {t.view_details || "View Details"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseListClient;
