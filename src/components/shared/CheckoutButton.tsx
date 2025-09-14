"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import toast from "react-hot-toast";
import Spinner from "./Spinner";
import { SupportedLang } from "@/lib/dictionaries";

interface CheckoutButtonProps {
  planId: string;
  lang: SupportedLang;
  SubscribeText: string;
  RedirectingText: string;
  popular?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary";
  hasActivePaidSubscription: boolean;
  hasUserId: boolean;
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
  hasUserId,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    // Do nothing if button is disabled or user is on current plan
    if (disabled || hasActivePaidSubscription) return;

    // Do nothing if user is not logged in
    if (!hasUserId) {
      toast.error(
        lang === "ar"
          ? "يُرجى تسجيل الدخول أولاً للاشتراك."
          : "You must be logged in to subscribe.",
      );
      return;
    }

    setLoading(true);

    try {
      // Updated API call - still pass lang for success/cancel URLs but not for plan lookup
      const response = await fetch("/api/stripe/create-checkout", {
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
        toast.success(
          data.message ||
            (lang === "ar"
              ? "تم تحديث الخطة بنجاح!"
              : "Plan updated successfully!"),
        );
        // Optionally reload the page to show updated state
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "حدث خطأ ما"
            : "Something went wrong",
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
