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
import { SupportedLang } from "@/lib/dictionaries";
import { IntegrationType } from "@prisma/client";
import { Calendar, Link2, LogIn, LogOut } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

type MessagingProvider = "whatsapp" | "messenger" | "instagram";

type IntegrationProvider = {
  value: string;
  labelKey: string;
  disabled?: boolean;
};

type ConnectedApp = {
  provider: string;
  type: IntegrationType;
  connected: boolean;
};

type MessagingCardProps = {
  provider: MessagingProvider;
  t: Record<string, string>;
  connectedApp?: ConnectedApp;
};

type IntegrationCardProps = {
  providerType: "calendar" | "crm";
  t: Record<string, string>;
  connectedApp?: ConnectedApp;
};

type IntegrationsClientProps = {
  dict: Dictionary;
  connectedApps: ConnectedApp[];
};

// Constants
const CALENDAR_PROVIDERS: IntegrationProvider[] = [
  { value: "google", labelKey: "google_calendar" },
  { value: "microsoft", labelKey: "microsoft_outlook" },
];

const CRM_PROVIDERS: IntegrationProvider[] = [
  { value: "salesforce", labelKey: "salesforce" },
  { value: "hubspot", labelKey: "hubspot" },
  { value: "google", labelKey: "google_sheets" },
];

const MESSAGING_METADATA = {
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

const MessagingCard = ({ provider, t, connectedApp }: MessagingCardProps) => {
  const { lang } = useParams<{ lang: SupportedLang }>();
  const router = useRouter();
  const isRTL = lang === "ar";

  const [isLoading, setIsLoading] = useState(false);
  const details = MESSAGING_METADATA[provider];
  const isConnected = connectedApp?.connected ?? false;

  const handleConnect = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/oauth/${provider}?type=messaging&lang=${lang}`,
      );
      if (!res.ok) throw new Error("Could not get auth url");
      const { url } = await res.json();
      router.push(url);
    } catch (err) {
      console.error(err);
      toast.error(t.toast_error_generic ?? "Could not connect");
      setIsLoading(false);
    }
  }, [provider, lang, router, t]);

  const handleDisconnect = useCallback(async () => {
    const typeToDisconnect = connectedApp?.type as IntegrationType;
    const providerToDisconnect = connectedApp?.provider;

    setIsLoading(true);
    try {
      const response = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: providerToDisconnect,
          type: typeToDisconnect,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Disconnect failed");
      }

      toast.success(t.toast_success_title || "Disconnected successfully");
      router.refresh();
    } catch (error) {
      console.error("Disconnection error:", error);
      toast.error(t.toast_error_generic || "Failed to disconnect");
    } finally {
      setIsLoading(false);
    }
  }, [
    connectedApp?.type,
    connectedApp?.provider,
    t.toast_success_title,
    t.toast_error_generic,
    router,
  ]);

  return (
    <Card className={isRTL ? "text-right" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-3">
            {details.icon}
            <span>{details.title}</span>
          </CardTitle>
          {isConnected && (
            <Badge variant="default" className="shrink-0">
              {t.connected_badge || "Connected"}
            </Badge>
          )}
        </div>
        <CardDescription>
          {t.messaging_card_desc?.replace("{platform}", details.title) ||
            `Integrate with ${details.title} to manage conversations`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <p className="text-muted-foreground text-sm">
          {t.messaging_card_setup ||
            "Set up this integration to start receiving and sending messages"}
        </p>
      </CardContent>

      <CardFooter className={isRTL ? "flex-row-reverse justify-end" : ""}>
        {!isConnected ? (
          <Button
            onClick={handleConnect}
            disabled={isLoading}
            className="min-w-[120px]"
          >
            <LogIn className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
            {isLoading
              ? t.connecting_button || "Connecting..."
              : t.connect_button || "Connect"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isLoading}
            className="min-w-[120px]"
          >
            <LogOut className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
            {isLoading
              ? t.disconnecting_button || "Disconnecting..."
              : t.disconnect_button || "Disconnect"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

// IntegrationCard Component
const IntegrationCard = ({
  providerType,
  t,
  connectedApp,
}: IntegrationCardProps) => {
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const isRTL = lang === "ar";
  const dir = isRTL ? "rtl" : "ltr";

  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const providers =
    providerType === "calendar" ? CALENDAR_PROVIDERS : CRM_PROVIDERS;

  const getIntegrationDetails = () => {
    if (providerType === "calendar") {
      return {
        icon: <Calendar className="h-5 w-5" />,
        title: t.calendar_title || "Calendar Integration",
        desc: t.calendar_desc || "Sync your calendar events and appointments",
        label: t.calendar_provider || "Calendar Provider",
        placeholder: t.calendar_placeholder || "Select calendar provider",
      };
    }

    return {
      icon: <Link2 className="h-5 w-5" />,
      title: t.crm_title || "CRM Integration",
      desc: t.crm_desc || "Connect with your CRM system",
      label: t.crm_provider || "CRM Provider",
      placeholder: t.crm_placeholder || "Select CRM provider",
    };
  };

  const details = getIntegrationDetails();
  const isConnected =
    connectedApp?.connected &&
    providers.find((p) => p.labelKey.toUpperCase() === connectedApp.type);

  const handleConnect = useCallback(async () => {
    if (!selectedProvider) {
      toast.error(t.toast_error_desc_provider || "Please select a provider");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/integrations/oauth/${selectedProvider}?type=${providerType}&lang=${lang}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get authorization URL: ${response.status}`);
      }

      const data = await response.json();

      if (!data.url) {
        throw new Error("Authorization URL not provided");
      }

      router.push(data.url);
    } catch (error) {
      console.error("Connection error:", error);
      toast.error(t.toast_error_generic || "Failed to connect");
      setIsLoading(false);
    }
  }, [selectedProvider, providerType, lang, t, router]);

  const handleDisconnect = useCallback(async () => {
    const providerToDisconnect = connectedApp?.provider;
    const typeToDisconnect = connectedApp?.type;

    setIsLoading(true);

    try {
      const response = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: providerToDisconnect,
          type: typeToDisconnect,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Disconnect failed");
      }

      setSelectedProvider("");
      toast.success(t.toast_success_title || "Disconnected successfully");
      router.refresh();
    } catch (error) {
      console.error("Disconnect error:", error);
      toast.error(t.toast_error_generic || "Failed to disconnect");
    } finally {
      setIsLoading(false);
    }
  }, [
    connectedApp?.provider,
    connectedApp?.type,
    t.toast_success_title,
    t.toast_error_generic,
    router,
  ]);

  const getProviderDisplayName = (providerValue: string) => {
    const provider = providers.find((p) => p.value === providerValue);
    return provider ? t[provider.labelKey] || provider.labelKey : providerValue;
  };

  return (
    <Card className={isRTL ? "text-right" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-2">
            {details.icon}
            <span>{details.title}</span>
          </CardTitle>
          {isConnected && (
            <Badge variant="default" className="shrink-0">
              {t.connected_badge || "Connected"}
            </Badge>
          )}
        </div>
        <CardDescription>{details.desc}</CardDescription>
      </CardHeader>

      <CardContent>
        {!isConnected ? (
          <div className="space-y-2">
            <Label htmlFor={`${providerType}-provider`}>{details.label}</Label>

            <Select
              value={selectedProvider}
              onValueChange={setSelectedProvider}
              dir={dir}
            >
              <SelectTrigger
                id={`${providerType}-provider`}
                className="cursor-pointer"
              >
                <SelectValue placeholder={details.placeholder} />
              </SelectTrigger>

              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem
                    key={provider.value}
                    value={provider.value}
                    disabled={provider.disabled}
                  >
                    {t[provider.labelKey] || provider.labelKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="text-sm font-semibold">
                {(
                  t.currently_connected || "Currently connected to {provider}"
                ).replace(
                  "{provider}",
                  getProviderDisplayName(connectedApp!.provider),
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className={isRTL ? "flex-row-reverse justify-end" : ""}>
        {!isConnected ? (
          <Button
            onClick={handleConnect}
            disabled={isLoading || !selectedProvider}
            className="min-w-[120px]"
          >
            <LogIn className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
            {isLoading
              ? t.connecting_button || "Connecting..."
              : t.connect_button || "Connect"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isLoading}
            className="min-w-[120px]"
          >
            <LogOut className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
            {isLoading
              ? t.disconnecting_button || "Disconnecting..."
              : t.disconnect_button || "Disconnect"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

// Main IntegrationsPage Component
const IntegrationsPage = ({ dict, connectedApps }: IntegrationsClientProps) => {
  const t = dict.dashboard_integrations;

  // Helper function to find connected app by provider
  const findConnectedApp = (provider: string): ConnectedApp | undefined => {
    return connectedApps.find((app) => app.provider === provider);
  };

  // Helper function to find connected app by type
  const findConnectedAppByType = (
    providerType: "calendar" | "crm",
  ): ConnectedApp | undefined => {
    const typeProviders =
      providerType === "calendar"
        ? CALENDAR_PROVIDERS.map((p) => p.labelKey.toUpperCase())
        : CRM_PROVIDERS.map((p) => p.labelKey.toUpperCase());

    return connectedApps.find(
      (app) => app.connected && typeProviders.includes(app.type),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold">
            {t.title || "Integrations"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.description || "Connect your favorite tools and services"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <IntegrationCard
          providerType="calendar"
          t={t}
          connectedApp={findConnectedAppByType("calendar")}
        />
        <IntegrationCard
          providerType="crm"
          t={t}
          connectedApp={findConnectedAppByType("crm")}
        />
        <MessagingCard
          provider="whatsapp"
          t={t}
          connectedApp={findConnectedApp("whatsapp")}
        />
        <MessagingCard
          provider="messenger"
          t={t}
          connectedApp={findConnectedApp("messenger")}
        />
        <MessagingCard
          provider="instagram"
          t={t}
          connectedApp={findConnectedApp("instagram")}
        />
      </div>
    </div>
  );
};

export default IntegrationsPage;
