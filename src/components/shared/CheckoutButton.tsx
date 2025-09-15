"use client";

import { Button } from "@/components/ui/button";
import { SupportedLang } from "@/lib/dictionaries";
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
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleEnterpriseContact = () => {
    const email = contactEmail;
    const subject = encodeURIComponent("Enterprise Plan Inquiry");
    const body = encodeURIComponent(
      lang === "ar"
        ? "مرحباً،\n\nأرغب في معرفة المزيد عن الخطة المؤسسية.\n\nشكراً لكم."
        : "Hello,\n\nI'm interested in learning more about your Enterprise plan.\n\nThank you.",
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleCheckout = async () => {
    // Handle enterprise plans
    if (isEnterprise) {
      handleEnterpriseContact();
      return;
    }

    // Do nothing if button is disabled and it's the current plan
    if (disabled && isCurrentPlan) return;

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
        // Reload the page to show updated state
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
    if (loading && !isEnterprise) return RedirectingText;
    return SubscribeText;
  };

  const getButtonVariant = () => {
    return variant;
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={(disabled && isCurrentPlan) || (loading && !isEnterprise)}
      variant={getButtonVariant()}
      className={`w-full ${popular ? "shadow-lg" : ""}`}
      size="lg"
    >
      {getButtonIcon()}
      <span className={getButtonIcon() ? "ml-2" : ""}>{getButtonText()}</span>
    </Button>
  );
}
