"use client";

import { Button } from "@/components/ui/button";
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
  hasActivePaidSubscription: boolean;
}

export default function CheckoutButton({
  planId,
  lang,
  SubscribeText,
  RedirectingText,
  popular = false,
  disabled = false,
  variant = "default",
  hasActivePaidSubscription,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    // Do nothing if button is disabled or user is on current plan
    if (disabled || hasActivePaidSubscription) return;

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
      } else {
        // Show success message for free plan or immediate actions
        toast.success(data.message || "Plan updated successfully!");
        // Optionally reload the page to show updated state
        setTimeout(() => {
          window.location.reload();
        }, 1500);
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
    return null;
  };

  const getButtonText = () => {
    if (loading) return RedirectingText;
    return SubscribeText;
  };

  const getButtonVariant = () => {
    return variant;
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={disabled || loading}
      variant={getButtonVariant()}
      className={`w-full ${popular ? "shadow-lg" : ""} ${hasActivePaidSubscription ? "hidden" : ""}`}
      size="lg"
    >
      {getButtonIcon()}
      <span className={getButtonIcon() ? "ml-2" : ""}>{getButtonText()}</span>
    </Button>
  );
}
