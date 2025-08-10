"use client";

import { Icons } from "@/components/shared/Icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dictionary } from "@/contexts/dictionary-context";
import { Calendar, Link2, LogIn, LogOut } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type MessagingProvider = "whatsapp" | "messenger" | "instagram";

type IntegrationProvider = {
  value: string;
  labelKey: string;
  disabled?: boolean;
};

const calendarProviders: IntegrationProvider[] = [
  { value: "google", labelKey: "google_calendar" },
  { value: "microsoft", labelKey: "microsoft_outlook" },
];

const crmProviders: IntegrationProvider[] = [
  { value: "salesforce", labelKey: "salesforce" },
  { value: "hubspot", labelKey: "hubspot", disabled: true },
  { value: "googlesheets", labelKey: "google_sheets" },
];

type MessagingCardProps = {
  provider: MessagingProvider;
  t: Record<string, string>;
};

const MessagingCard = ({ provider, t }: MessagingCardProps) => {
  const { lang } = useParams<{ lang: string }>();
  const dir = lang === "ar" ? "rtl" : "ltr";

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`integration_msg_${provider}`);
      setIsConnected(v === "true");
    } catch {
      /* ignore */
    }
  }, [provider]);

  const handleConnect = async () => {
    setIsLoading(true);
    // placeholder: replace with real connect action
    await new Promise((r) => setTimeout(r, 600));
    try {
      localStorage.setItem(`integration_msg_${provider}`, "true");
    } catch {}
    setIsConnected(true);
    toast.success(t.toast_success_title ?? "Connected");
    setIsLoading(false);
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    // placeholder: replace with real disconnect action
    await new Promise((r) => setTimeout(r, 400));
    try {
      localStorage.removeItem(`integration_msg_${provider}`);
    } catch {}
    setIsConnected(false);
    toast.success(t.toast_success_title ?? "Disconnected");
    setIsLoading(false);
  };

  const meta = {
    whatsapp: {
      icon: <Icons.WhatsApp className="h-6 w-6" />,
      title: "WhatsApp Business",
    },
    messenger: {
      icon: <Icons.Messenger className="h-6 w-6" />,
      title: "Facebook Messenger",
    },
    instagram: {
      icon: <Icons.Instagram className="h-6 w-6" />,
      title: "Instagram Direct",
    },
  } as const;

  const details = meta[provider];

  return (
    <Card className={dir === "rtl" ? "rtl:text-right" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-3">
            {details.icon} {details.title}
          </CardTitle>
          {isConnected && <Badge variant="default">{t.connected_badge}</Badge>}
        </div>
        <CardDescription>
          {t.messaging_card_desc?.replace("{platform}", details.title) ??
            `${details.title} integration`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <p className="text-muted-foreground text-sm">
          {t.messaging_card_setup}
        </p>
      </CardContent>

      <CardFooter
        className={dir === "rtl" ? "rtl:flex-row-reverse rtl:justify-end" : ""}
      >
        {!isConnected ? (
          <Button onClick={handleConnect} disabled={isLoading}>
            <LogIn className="mr-2 rtl:mr-0 rtl:ml-2" />
            {isLoading
              ? (t.connecting_button ?? "Connecting...")
              : (t.connect_button ?? "Connect")}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isLoading}
          >
            <LogOut className="mr-2 rtl:mr-0 rtl:ml-2" />
            {isLoading
              ? (t.disconnecting_button ?? "Disconnecting...")
              : (t.disconnect_button ?? "Disconnect")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

type IntegrationCardProps = {
  providerType: "calendar" | "crm";
  t: Record<string, string>;
};

const IntegrationCard = ({ providerType, t }: IntegrationCardProps) => {
  const { lang } = useParams<{ lang: string }>();
  const dir = lang === "ar" ? "rtl" : "ltr";

  const [selected, setSelected] = useState<string>("");
  const [connected, setConnected] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`integration_${providerType}`);
      if (saved) setConnected(saved);
    } catch {}
  }, [providerType]);

  const providers =
    providerType === "calendar" ? calendarProviders : crmProviders;
  const isConnected = connected !== "";

  const details =
    providerType === "calendar"
      ? {
          icon: <Calendar className="h-5 w-5" />,
          title: t.calendar_title,
          desc: t.calendar_desc,
          label: t.calendar_provider,
          placeholder: t.calendar_placeholder,
        }
      : {
          icon: <Link2 className="h-5 w-5" />,
          title: t.crm_title,
          desc: t.crm_desc,
          label: t.crm_provider,
          placeholder: t.crm_placeholder,
        };

  const handleConnect = async () => {
    if (!selected) {
      toast.error(t.toast_error_desc_provider);
      return;
    }
    setIsLoading(true);
    // placeholder: replace with real integration logic
    await new Promise((r) => setTimeout(r, 700));
    try {
      localStorage.setItem(`integration_${providerType}`, selected);
    } catch {}
    setConnected(selected);
    setIsLoading(false);
    toast.success(t.toast_success_title);
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    // placeholder: replace with real disconnect logic
    await new Promise((r) => setTimeout(r, 400));
    try {
      localStorage.removeItem(`integration_${providerType}`);
    } catch {}
    setConnected("");
    setSelected("");
    setIsLoading(false);
    toast.success(t.toast_success_title);
  };

  return (
    <Card className={dir === "rtl" ? "rtl:text-right" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-2">
            {details.icon} {details.title}
          </CardTitle>
          {isConnected && <Badge variant="default">{t.connected_badge}</Badge>}
        </div>
        <CardDescription>{details.desc}</CardDescription>
      </CardHeader>

      <CardContent>
        {!isConnected ? (
          <div className="space-y-2">
            <Label htmlFor={`${providerType}-provider`}>{details.label}</Label>

            <Select value={selected} onValueChange={setSelected} dir={dir}>
              <SelectTrigger
                id={`${providerType}-provider`}
                className="cursor-pointer"
              >
                <SelectValue placeholder={details.placeholder} />
              </SelectTrigger>

              <SelectContent>
                {providers.map((p) => (
                  <SelectItem
                    key={p.value}
                    value={p.value}
                    disabled={p.disabled}
                  >
                    {t[p.labelKey] ?? p.labelKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="bg-muted flex items-center gap-4 rounded-lg p-4">
            <div className="text-sm font-semibold">
              {t.currently_connected?.replace(
                "{provider}",
                (providers.find((p) => p.value === connected)?.labelKey &&
                  t[providers.find((p) => p.value === connected)!.labelKey]) ||
                  connected,
              ) ?? `Connected to ${connected}`}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter
        className={dir === "rtl" ? "rtl:flex-row-reverse rtl:justify-end" : ""}
      >
        {!isConnected ? (
          <Button onClick={handleConnect} disabled={isLoading || !selected}>
            <LogIn className="mr-2 rtl:mr-0 rtl:ml-2" />
            {isLoading
              ? (t.connecting_button ?? "Connecting...")
              : (t.connect_button ?? "Connect")}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isLoading}
          >
            <LogOut className="mr-2 rtl:mr-0 rtl:ml-2" />
            {isLoading
              ? (t.disconnecting_button ?? "Disconnecting...")
              : (t.disconnect_button ?? "Disconnect")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

type IntegrationsClientProps = {
  dict: Dictionary;
};

const IntegrationsPage = ({ dict }: IntegrationsClientProps) => {
  const t = dict.dashboard_integrations;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.description}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <IntegrationCard providerType="calendar" t={t} />
        <IntegrationCard providerType="crm" t={t} />
        <MessagingCard provider="whatsapp" t={t} />
        <MessagingCard provider="messenger" t={t} />
        <MessagingCard provider="instagram" t={t} />
      </div>
    </div>
  );
};

export default IntegrationsPage;
