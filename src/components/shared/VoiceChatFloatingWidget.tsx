"use client";

import { useDictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { MessageSquare, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import VoiceChatWidget from "./VoiceChatWidget";

interface VoiceChatFloatingWidgetProps {
  lang?: SupportedLang;
  kbId?: string;
}

export default function VoiceChatFloatingWidget({
  lang = "en",
  kbId,
}: VoiceChatFloatingWidgetProps) {
  const dict = useDictionary();
  const t = dict.widget;

  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 800); // Show tooltip after 800ms hover
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowTooltip(false);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    setShowTooltip(false);

    // Haptic feedback if available
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed right-6 bottom-6 z-50">
        {/* Tooltip */}
        {showTooltip && !isOpen && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 absolute right-0 bottom-20 mb-2 rounded-lg bg-gray-900 px-3 py-2 text-sm whitespace-nowrap text-white shadow-lg duration-200">
            {t.start_voice_chat || "Start chat"}
            <div className="absolute top-full right-4 h-0 w-0 border-t-4 border-r-4 border-l-4 border-transparent border-t-gray-900" />
          </div>
        )}

        {/* Main Button */}
        <button
          onClick={handleToggle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "group relative flex items-center justify-center",
            "h-14 w-14 cursor-pointer rounded-full transition-all duration-300 ease-out",
            "bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500",
            "hover:from-blue-600 hover:via-purple-600 hover:to-pink-600",
            "shadow-lg hover:shadow-2xl",
            "border-4 border-white dark:border-gray-800",
            "transform hover:scale-110 active:scale-95",
            "focus:ring-4 focus:ring-blue-500/30 focus:outline-none",
            isHovered && "scale-110 shadow-2xl",
            isOpen && "scale-95",
          )}
          aria-label={t.voice_chat_aria || "Open chat"}
        >
          {/* Animated Background Rings */}
          <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20" />
          <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10" />

          {/* Icon with Rotation Animation */}
          <div className="relative z-10 transition-transform duration-300">
            <MessageSquare className="h-6 w-6 text-white drop-shadow-sm" />
          </div>

          {/* Pulse Ring on Hover */}
          {isHovered && (
            <div className="absolute inset-0 animate-ping rounded-full border-2 border-white/50" />
          )}
        </button>

        {/* Status Indicator */}
        <div
          className={cn(
            "absolute -top-1 -right-1 h-4 w-4 rounded-full transition-all duration-200",
            "border-2 border-white bg-green-500 dark:border-gray-800",
            "animate-pulse shadow-sm",
            !isOpen && "scale-0 opacity-0",
          )}
        >
          <div className="h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        </div>
      </div>

      {/* Chat Widget Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/50 backdrop-blur-sm duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Widget Container */}
          <div className="animate-in slide-in-from-bottom-4 fade-in-0 fixed right-6 bottom-24 z-50 duration-300">
            <div
              className={cn(
                "h-[32rem] max-h-[calc(100vh-8rem)] w-96 max-w-[calc(100vw-3rem)]",
                "rounded-2xl bg-white shadow-2xl dark:bg-gray-900",
                "border border-gray-200 dark:border-gray-700",
                "overflow-hidden backdrop-blur-xl",
                lang === "ar" && "rtl",
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 p-4 dark:border-gray-700 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {lang === "en" ? "AI Assistant" : "المساعد الذكي"}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                      "transition-colors duration-200",
                    )}
                    aria-label={t.minimize_aria || "Minimize"}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
                      "hover:bg-red-50 dark:hover:bg-red-900/20",
                      "transition-colors duration-200",
                    )}
                    aria-label={t.close_aria || "Close"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Widget Content */}
              <div className="h-[calc(100%-4rem)]">
                <VoiceChatWidget lang={lang} onClose={() => setIsOpen(false)} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
