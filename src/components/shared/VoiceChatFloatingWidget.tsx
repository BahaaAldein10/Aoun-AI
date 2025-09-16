"use client";

import { useDictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { MessageSquare, Mic } from "lucide-react";
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
  const [selectedMode, setSelectedMode] = useState<"text" | "voice" | null>(
    null,
  );
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 800);
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
    if (!isOpen) {
      setShowModeSelection(true);
      setShowTooltip(false);
    } else {
      setIsOpen(false);
      setSelectedMode(null);
      setShowModeSelection(false);
    }

    // Haptic feedback if available
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleModeSelect = (mode: "text" | "voice") => {
    setSelectedMode(mode);
    setShowModeSelection(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedMode(null);
    setShowModeSelection(false);
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed right-6 bottom-6 z-50">
        {/* Tooltip */}
        {showTooltip && !isOpen && !showModeSelection && (
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
            (isOpen || showModeSelection) && "scale-95",
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
            !(isOpen || showModeSelection) && "scale-0 opacity-0",
          )}
        >
          <div className="h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        </div>
      </div>

      {/* Mode Selection Modal */}
      {showModeSelection && (
        <>
          {/* Backdrop */}
          <div
            className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/50 backdrop-blur-sm duration-200"
            onClick={() => setShowModeSelection(false)}
          />

          {/* Mode Selection Container */}
          <div className="animate-in slide-in-from-bottom-4 fade-in-0 fixed right-6 bottom-24 z-50 duration-300">
            <div
              className={cn(
                "w-72 rounded-2xl bg-white shadow-2xl dark:bg-gray-900",
                "border border-gray-200 dark:border-gray-700",
                "overflow-hidden p-6 backdrop-blur-xl",
                lang === "ar" && "rtl",
              )}
            >
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {lang === "en" ? "Choose Chat Mode" : "اختر وضع الدردشة"}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {lang === "en"
                    ? "How would you like to interact with the assistant?"
                    : "كيف تريد التفاعل مع المساعد؟"}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleModeSelect("text")}
                  className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 transition-all hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 group-hover:bg-blue-200 dark:bg-blue-900/30 dark:group-hover:bg-blue-800/40">
                    <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {lang === "en" ? "Text Chat" : "دردشة نصية"}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {lang === "en" ? "Type your messages" : "اكتب رسائلك"}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect("voice")}
                  className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 transition-all hover:border-purple-300 hover:bg-purple-50 dark:border-gray-700 dark:hover:border-purple-600 dark:hover:bg-purple-900/20"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 group-hover:bg-purple-200 dark:bg-purple-900/30 dark:group-hover:bg-purple-800/40">
                    <Mic className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {lang === "en" ? "Voice Chat" : "دردشة صوتية"}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {lang === "en" ? "Speak naturally" : "تحدث بطبيعية"}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Chat Widget */}
      {isOpen && selectedMode && (
        <>
          {/* Backdrop */}
          <div
            className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/50 backdrop-blur-sm duration-200"
            onClick={handleClose}
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
              <VoiceChatWidget
                lang={lang}
                onClose={handleClose}
                initialMode={selectedMode}
                className="h-full"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
