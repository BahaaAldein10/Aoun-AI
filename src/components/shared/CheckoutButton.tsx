"use client";

import { SupportedLang } from "@/lib/dictionaries";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui/button";

interface CheckoutButtonProps {
  RedirectingText: string;
  SubscribeText: string;
  planId: string;
  lang: SupportedLang;
  popular: boolean;
}

const CheckoutButton = ({
  RedirectingText,
  SubscribeText,
  planId,
  lang,
  popular,
}: CheckoutButtonProps) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, lang }),
      });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        console.error(data);
        // handle free plan case or errors
        if (data.url === null) {
          // free plan created server-side: you may want to redirect to dashboard
          router.push(`/${lang}/dashboard`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={popular ? "default" : "outline"}
      className="w-full"
    >
      {loading ? RedirectingText : SubscribeText}
    </Button>
  );
};

export default CheckoutButton;
