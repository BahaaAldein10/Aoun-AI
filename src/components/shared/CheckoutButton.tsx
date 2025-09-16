// components/shared/CheckoutButton.tsx
"use client";

import { Button } from "@/components/ui/button";
import { SupportedLang } from "@/lib/dictionaries";
import Link from "next/link";
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
    // For enterprise plans, do nothing here - the link handles it
    if (isEnterprise) {
      return;
    }

    // Async logic for paid plans
    handlePaidCheckout();
  };

  const handlePaidCheckout = async () => {
    // If explicitly disabled, prevent action
    if (disabled) return;

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

      // If we get a Stripe Checkout URL (new subscription flow)
      if (data.url) {
        return router.push(data.url);
      }

      // If upgrade endpoint returned a hosted invoice URL (customer needs to pay)
      if (data.invoiceUrl) {
        return router.push(data.invoiceUrl);
      }

      // Otherwise assume server handled the upgrade immediately
      toast.success(
        lang === "ar" ? "تم تحديث الخطة بنجاح!" : "Plan updated successfully!",
      );
      setTimeout(() => router.refresh(), 1300);
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

  // For enterprise plans, create the mailto link
  if (isEnterprise) {
    const subject = encodeURIComponent("Enterprise Plan Inquiry");
    const body = encodeURIComponent(
      lang === "ar"
        ? "مرحباً،\n\nأرغب في معرفة المزيد عن خطة الأعمال.\n\nشكراً لكم."
        : "Hello,\n\nI'm interested in learning more about your Enterprise plan.\n\nThank you.",
    );
    const mailtoLink = `mailto:${contactEmail}?subject=${subject}&body=${body}`;

    return (
      <Link
        href={mailtoLink}
        className="w-full"
        target="_self"
        rel="noopener noreferrer"
      >
        <Button
          disabled={shouldDisable()}
          variant={getButtonVariant()}
          className={`w-full ${popular ? "shadow-lg" : ""}`}
          size="lg"
          asChild
        >
          <span>
            {getButtonIcon()}
            <span className={getButtonIcon() ? "ml-2" : ""}>
              {getButtonText()}
            </span>
          </span>
        </Button>
      </Link>
    );
  }

  // For non-enterprise plans, use the regular button
  return (
    <Button
      onClick={handleCheckout}
      disabled={shouldDisable()}
      variant={getButtonVariant()}
      className={`w-full ${popular ? "shadow-lg" : ""}`}
      size="lg"
    >
      {getButtonIcon()}
      <span className={getButtonIcon() ? "ml-2" : ""}>{getButtonText()}</span>
    </Button>
  );
}
