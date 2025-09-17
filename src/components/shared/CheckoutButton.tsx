// components/shared/CheckoutButton.tsx
"use client";

import { Button } from "@/components/ui/button";
import { SupportedLang } from "@/lib/dictionaries";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import Spinner from "./Spinner";

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
  isEnterprise?: boolean;
  isCurrentPlan?: boolean;
  contactEmail: string;
}

export default function CheckoutButton({
  planId,
  lang,
  SubscribeText,
  RedirectingText,
  popular = false,
  disabled = false,
  variant = "default",
  contactEmail,
  hasUserId,
  isEnterprise = false,
  isCurrentPlan = false,
  hasActivePaidSubscription,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCheckout = () => {
    if (isEnterprise) {
      handleEnterpriseContact();
      return;
    }

    // Async logic for paid plans
    handlePaidCheckout();
  };

  const handleEnterpriseContact = async () => {
    try {
      await navigator.clipboard.writeText(contactEmail);
      toast.success(
        lang === "ar"
          ? `تم نسخ البريد الإلكتروني: ${contactEmail}`
          : `Email copied to clipboard: ${contactEmail}`,
        { duration: 4000 },
      );
    } catch (error) {
      console.warn("Copy to clipboard failed:", error);
      toast.error(
        lang === "ar"
          ? `يُرجى التواصل معنا على: ${contactEmail}`
          : `Please contact us at: ${contactEmail}`,
        { duration: 6000 },
      );
    }
  };

  const handlePaidCheckout = async () => {
    // If explicitly disabled, prevent action
    if (disabled || loading) return;

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
      // Use upgrade endpoint if user already has an active paid subscription
      const endpoint = hasActivePaidSubscription
        ? "/api/stripe/upgrade"
        : "/api/stripe/create-checkout";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, lang }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");

      // Handle new subscription flow (create-checkout endpoint)
      if (data.url) {
        return router.push(data.url);
      }

      // Handle upgrade flow responses
      if (hasActivePaidSubscription) {
        if (data.status === "success") {
          // Upgrade completed successfully
          toast.success(
            lang === "ar"
              ? "تم تحديث الخطة بنجاح!"
              : "Plan upgraded successfully!",
          );

          // Refresh the page to show updated subscription
          setTimeout(() => {
            router.refresh();
          }, 2000);
        } else if (data.status === "payment_required" && data.invoiceUrl) {
          // Payment required - redirect to Stripe invoice page
          toast.loading(
            lang === "ar"
              ? "إعادة توجيه إلى صفحة الدفع..."
              : "Redirecting to payment page...",
          );

          setTimeout(() => {
            window.location.href = data.invoiceUrl;
          }, 1000);
        } else {
          // Fallback for any other upgrade response
          throw new Error(data.message || "Upgrade failed");
        }
      } else {
        // Fallback for create-checkout without URL (shouldn't happen)
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout/Upgrade error:", error);
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
    if (loading && !isEnterprise) return RedirectingText;
    return SubscribeText;
  };

  const getButtonVariant = () => {
    return variant;
  };

  // Check if button should be disabled
  const shouldDisable = () => {
    if (disabled) return true;
    if (isCurrentPlan && disabled) return true; // defensive
    if (loading && !isEnterprise) return true;
    return false;
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={shouldDisable()}
      variant={getButtonVariant()}
      className={`w-full ${shouldDisable() ? "cursor-not-allowed" : ""} ${popular ? "shadow-lg" : ""}`}
      size="lg"
    >
      {getButtonIcon()}
      <span className={getButtonIcon() ? "ml-2" : ""}>{getButtonText()}</span>
    </Button>
  );
}
