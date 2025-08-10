"use client";

import { Icons } from "@/components/shared/Icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { Calendar, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type IntegrationRow = {
  id: string;
  type: "calendar" | "crm" | "messaging" | "social";
  provider: string;
  label: string;
  status: "connected" | "disconnected";
  createdAt: Date;
  updatedAt: Date;
};

interface Props {
  initialIntegrations: IntegrationRow[];
  lang: SupportedLang;
  dict: Dictionary;
}

const IntegrationsClient = ({
  initialIntegrations = [],
  lang,
  dict,
}: Props) => {
  const t = dict.admin_integrations;
  const [rows, setRows] = useState<IntegrationRow[]>(initialIntegrations ?? []);

  // persist demo connection state to localStorage (so it survives reloads)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin_integrations_state_v1");
      if (!saved) {
        localStorage.setItem(
          "admin_integrations_state_v1",
          JSON.stringify(rows),
        );
      } else {
        const parsed: IntegrationRow[] = JSON.parse(saved);
        // keep server-provided rows but override status from local if ids match
        const mapped = rows.map((r) => {
          const local = parsed.find((p) => p.id === r.id);
          return local ? { ...r, status: local.status } : r;
        });
        setRows(mapped);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin_integrations_state_v1", JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, [rows]);

  function toggleConnect(id: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const newStatus =
          r.status === "connected" ? "disconnected" : "connected";
        toast.success(
          newStatus === "connected" ? t.toast_connected : t.toast_disconnected,
        );
        return { ...r, status: newStatus, updatedAt: new Date() };
      }),
    );
  }

  function handleConfigure(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    toast(t.toast_configure_placeholder.replace("{name}", r.label));
  }

  function renderIcon(type: IntegrationRow["type"], provider: string) {
    // simple mapping, extendable
    if (type === "calendar") return <Calendar className="h-5 w-5" />;
    if (type === "crm") return <Link2 className="h-5 w-5" />;
    if (provider === "whatsapp") return <Icons.WhatsApp className="h-5 w-5" />;
    if (provider === "messenger")
      return <Icons.Messenger className="h-5 w-5" />;
    if (provider === "instagram")
      return <Icons.Instagram className="h-5 w-5" />;
    return <Icons.Link className="h-5 w-5" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(rows));
              toast.success(t.toast_copied_state);
            }}
          >
            {t.export_state}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {renderIcon(r.type, r.provider)}
                  <div>
                    <CardTitle className="text-sm">{r.label}</CardTitle>
                    <div className="text-muted-foreground text-xs">
                      {r.provider}
                    </div>
                  </div>
                </div>
                <div>
                  {r.status === "connected" ? (
                    <Badge variant="default">{t.connected}</Badge>
                  ) : (
                    <Badge>{t.not_connected}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="text-muted-foreground space-y-2 text-sm">
                <div>
                  <strong>{t.connected_on}:</strong>{" "}
                  {r.status === "connected"
                    ? new Date(r.updatedAt).toLocaleString(
                        lang === "ar" ? "ar" : "en-US",
                      )
                    : t.never_connected}
                </div>
                <div>
                  <strong>{t.type_label}:</strong> {r.type}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleConfigure(r.id)}
              >
                {t.configure_button}
              </Button>
              {r.status === "connected" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleConnect(r.id)}
                >
                  {t.disconnect_button}
                </Button>
              ) : (
                <Button size="sm" onClick={() => toggleConnect(r.id)}>
                  {t.connect_button}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsClient;
