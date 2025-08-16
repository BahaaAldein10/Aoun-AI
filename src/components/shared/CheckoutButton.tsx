'use client';

import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import Spinner from "./Spinner";

interface CheckoutButtonProps {
  planId: string;
  lang: string;
  SubscribeText: string;
  RedirectingText: string;
  popular?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary";
  isCurrentPlan?: boolean;
  isUpgrade?: boolean;
  isDowngrade?: boolean;
}

export default function CheckoutButton({
  planId,
  lang,
  SubscribeText,
  RedirectingText,
  popular = false,
  disabled = false,
  variant = "default",
  isCurrentPlan = false,
  isUpgrade = false,
  isDowngrade = false,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (disabled || isCurrentPlan) return;

    setLoading(true);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, lang }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      if (data.url) {
        // Redirect to Stripe Checkout for new subscriptions
        window.location.href = data.url;
      } else if (data.message) {
        // Handle upgrades/downgrades that don't require checkout
        toast.success(data.message);

        // Refresh the page to show updated subscription
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  };

  const getButtonIcon = () => {
    if (loading) return <Spinner />;
    if (isCurrentPlan) return <Check className="size-4" />;
    if (isUpgrade) return <ArrowUp className="size-4" />;
    if (isDowngrade) return <ArrowDown className="size-4" />;
    return null;
  };

  const getButtonText = () => {
    if (loading) return RedirectingText;
    return SubscribeText;
  };

  const getButtonVariant = () => {
    if (isCurrentPlan) return "secondary";
    if (isUpgrade && popular) return "default";
    if (isDowngrade) return "outline";
    return variant;
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={disabled || loading}
      variant={getButtonVariant()}
      className={`w-full ${popular && !isCurrentPlan ? "shadow-lg" : ""}`}
      size="lg"
    >
      {getButtonIcon()}
      <span className={getButtonIcon() ? "ml-2" : ""}>{getButtonText()}</span>
    </Button>
  );
}
