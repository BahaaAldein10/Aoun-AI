"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  Calendar,
  Crown,
  Edit,
  FileText,
  Globe,
  Languages,
  Mic,
  MoreVertical,
  Plus,
} from "lucide-react";
import Link from "next/link";
import React from "react";

type Agent = {
  id: string;
  title: string | null;
  description: string | null;
  documentCount: number;
  embeddingCount: number;
  hasUrl: boolean;
  hasFiles: boolean;
  language: string;
  voice: string;
  lastUpdated: Date;
  createdAt: Date;
};

type Subscription = {
  plan: {
    name: string;
    agents: number;
    titleEn: string;
    titleAr: string;
  };
};

interface SetupListClientProps {
  agents: Agent[];
  subscription: Subscription | null;
  canCreateMore: boolean;
  maxAgents: number;
  lang: SupportedLang;
  dict: Dictionary;
}

const SetupListClient: React.FC<SetupListClientProps> = ({
  agents,
  subscription,
  canCreateMore,
  maxAgents,
  lang,
  dict,
}) => {
  const t = dict.dashboard_setup;
  const dir = lang === "ar" ? "rtl" : "ltr";

  const getStatusBadge = (agent: Agent) => {
    if (agent.hasUrl && agent.hasFiles) {
      return (
        <Badge variant="default" className="bg-green-500 hover:bg-green-600">
          Complete
        </Badge>
      );
    } else if (agent.hasUrl || agent.hasFiles) {
      return <Badge variant="secondary">Partial</Badge>;
    } else {
      return <Badge variant="outline">Empty</Badge>;
    }
  };

  const getPlanBadge = () => {
    if (!subscription) return null;

    const planTitle =
      lang === "ar" ? subscription.plan.titleAr : subscription.plan.titleEn;
    const isPremium = subscription.plan.name !== "FREE";

    return (
      <Badge
        variant={isPremium ? "default" : "secondary"}
        className={cn(
          "flex items-center gap-1",
          isPremium &&
            "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600",
        )}
      >
        {isPremium && <Crown className="h-3 w-3" />}
        {planTitle}
      </Badge>
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / 36e5;

    if (diffInHours < 24) {
      return new Date(date).toLocaleTimeString(lang === "ar" ? "ar" : "en", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 168) {
      // 7 days
      return new Date(date).toLocaleDateString(lang === "ar" ? "ar" : "en", {
        weekday: "short",
      });
    } else {
      return new Date(date).toLocaleDateString(lang === "ar" ? "ar" : "en", {
        month: "short",
        day: "numeric",
      });
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between",
          lang === "ar" && "rtl:text-right",
        )}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t.agents_title || "AI Agents"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.agents_description ||
              "Manage your AI agents and knowledge bases"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {getPlanBadge()}
          <Button
            disabled={!canCreateMore}
            onClick={() => {
              if (canCreateMore) {
                window.location.href = `/${lang}/dashboard/setup/new`;
              }
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t.create_agent || "Create Agent"}
          </Button>
        </div>
      </div>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="text-primary h-5 w-5" />
            {t.usage_stats || "Usage Statistics"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t.agents_used || "Agents Used"}
            </span>
            <span className="font-semibold">
              {agents.length} / {maxAgents}
            </span>
          </div>
          <div className="bg-secondary h-2 rounded-full">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                agents.length >= maxAgents ? "bg-red-500" : "bg-primary",
              )}
              style={{
                width: `${Math.min((agents.length / maxAgents) * 100, 100)}%`,
              }}
            />
          </div>
          {!canCreateMore && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-700">
                {t.limit_reached ||
                  "You've reached your plan limit. Upgrade to create more agents."}
              </p>
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link href={`/${lang}/pricing`}>{t.upgrade || "Upgrade"}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Bot className="text-muted-foreground mx-auto mb-4 h-16 w-16" />
            <h3 className="mb-2 text-xl font-semibold">
              {t.no_agents || "No agents created yet"}
            </h3>
            <p className="text-muted-foreground mx-auto mb-6 max-w-md">
              {t.create_first_agent ||
                "Create your first AI agent to get started. You can train it with your website content or upload documents."}
            </p>
            <Button
              size="lg"
              disabled={!canCreateMore}
              onClick={() => {
                if (canCreateMore) {
                  window.location.href = `/${lang}/dashboard/setup/new`;
                }
              }}
            >
              <Plus className="mr-2 h-5 w-5" />
              {t.create_first || "Create Your First Agent"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className="group hover:border-primary/50 transition-all duration-200 hover:shadow-lg"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Bot className="text-primary h-5 w-5 flex-shrink-0" />
                    <CardTitle
                      className="line-clamp-1 text-lg"
                      title={
                        agent.title || t.untitled_agent || "Untitled Agent"
                      }
                    >
                      {agent.title || t.untitled_agent || "Untitled Agent"}
                    </CardTitle>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/${lang}/dashboard/setup/${agent.id}`}>
                          <Edit className="mr-2 h-4 w-4" />
                          {t.edit || "Edit"}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${lang}/dashboard/knowledge-base/${agent.id}`}
                        >
                          <Bot className="mr-2 h-4 w-4" />
                          {t.view_kb || "View Knowledge Base"}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {getStatusBadge(agent)}

                <CardDescription className="mt-2 line-clamp-2">
                  {agent.description ||
                    t.no_description ||
                    "No description provided"}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="text-muted-foreground h-4 w-4" />
                    <span>
                      {agent.documentCount} {t.docs || "docs"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="text-muted-foreground h-4 w-4" />
                    <span
                      className={
                        agent.hasUrl ? "text-green-600" : "text-gray-400"
                      }
                    >
                      {agent.hasUrl ? "✓" : "✗"} {t.url || "URL"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Languages className="text-muted-foreground h-4 w-4" />
                    <span className="uppercase">{agent.language}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mic className="text-muted-foreground h-4 w-4" />
                    <span className="truncate capitalize">{agent.voice}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground text-xs">
                      {t.updated || "Updated"} {formatDate(agent.lastUpdated)}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {agent.embeddingCount} {t.embeddings || "embeddings"}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/${lang}/dashboard/setup/${agent.id}`}>
                      <Edit className="mr-1 h-4 w-4" />
                      {t.edit || "Edit"}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Link
                      href={`/${lang}/dashboard/knowledge-base/${agent.id}`}
                    >
                      <Bot className="mr-1 h-4 w-4" />
                      {t.view || "View"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats Summary */}
      {agents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t.quick_stats || "Quick Overview"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
              <div>
                <div className="text-primary text-2xl font-bold">
                  {agents.length}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t.total_agents || "Total Agents"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {agents.reduce((sum, agent) => sum + agent.documentCount, 0)}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t.total_documents || "Total Documents"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {agents.filter((agent) => agent.hasUrl).length}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t.with_urls || "With URLs"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {agents.reduce((sum, agent) => sum + agent.embeddingCount, 0)}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t.total_embeddings || "Total Embeddings"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SetupListClient;
