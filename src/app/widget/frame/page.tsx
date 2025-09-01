"use client";

import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import Spinner from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import {
  Loader,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  role: "user" | "bot";
  text: string;
  audioUrl?: string | null;
  createdAt: string;
  isPlaying?: boolean;
  isVoice?: boolean;
};

export default function WidgetFrame() {
  // Session state from parent
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [kbId, setKbId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<KbMetadata | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);

  // Mode state
  const [mode, setMode] = useState<"text" | "voice">("text");

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Extract metadata values with fallbacks
  const primaryColor = metadata?.primaryColor || "#ff007f"; // blue-500 #3B82F6
  const accentColor = metadata?.accentColor || "#8B5CF6"; // purple-500 #8B5CF6
  const voiceName = metadata?.voice || "alloy";
  const language = metadata?.language as SupportedLang;

  // Helper: convert hex to rgba
  const hexToRgba = (hex: string, alpha = 1) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let h = hex.replace("#", "");
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(h, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Listen for parent messages (initialization & token refresh)
  useEffect(() => {
    let tokenExpiryTimer: number | null = null;

    function clearExpiryTimer() {
      if (tokenExpiryTimer !== null) {
        window.clearTimeout(tokenExpiryTimer);
        tokenExpiryTimer = null;
      }
    }

    function scheduleExpiryNotify(
      expires_in: number | null,
      parentOrigin: string | null,
    ) {
      clearExpiryTimer();
      if (!expires_in || !parentOrigin) return;
      const notifyMs = Math.max(2000, (expires_in - 10) * 1000);
      tokenExpiryTimer = window.setTimeout(() => {
        try {
          window.parent.postMessage(
            { type: "AOUN_WIDGET_TOKEN_EXPIRED", kbId },
            parentOrigin,
          );
        } catch (err) {
          console.warn("Failed to post token expired to parent:", err);
        }
      }, notifyMs);
    }

    function onMessage(ev: MessageEvent) {
      const data = ev.data || {};
      if (data?.type === "AOUN_WIDGET_INIT") {
        // If origin is provided and does not match event origin, discard
        if (data.origin && ev.origin !== data.origin) {
          console.warn(
            "Discarding AOUN_WIDGET_INIT due to origin mismatch",
            ev.origin,
            data.origin,
          );
          return;
        }

        setSessionToken(data.token ?? null);
        setKbId(data.kbId ?? null);
        setMetadata(data.metadata ?? null);

        scheduleExpiryNotify(data.expires_in ?? null, data.origin ?? null);

        const welcomeMsg: Msg = {
          id: `welcome-${Date.now()}`,
          role: "bot",
          text:
            language === "en"
              ? "Hello! How can I help you today?"
              : "مرحبا! كيف يمكنني مساعدتك اليوم؟",
          createdAt: new Date().toISOString(),
        };
        setMessages([welcomeMsg]);
      } else if (data?.type === "AOUN_WIDGET_TOKEN_REFRESH") {
        setSessionToken(data.token ?? null);
        if (data.metadata) setMetadata(data.metadata);
        scheduleExpiryNotify(data.expires_in ?? null, ev.origin);
      } else if (data?.type === "AOUN_WIDGET_MESSAGE") {
        console.log("Parent message:", data.payload);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearExpiryTimer();
    };
  }, [kbId, language]);

  // Check microphone permission on mount
  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  // Auto scroll messages
  useEffect(() => {
    if (!listRef.current) return;
    const scrollElement = listRef.current;
    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Recording timer
  useEffect(() => {
    if (recording) {
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [recording]);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermission(true);
    } catch (error) {
      console.error("Microphone permission denied:", error);
      setPermission(false);
    }
  };

  const pushMessage = useCallback((m: Msg) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Msg>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg)),
    );
  }, []);

  // Text chat functions
  const sendTextMessage = async () => {
    const message = textInput.trim();
    if (!message || !kbId) return;

    setTextInput("");
    setIsTyping(true);

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: message,
      createdAt: new Date().toISOString(),
      isVoice: false,
    };
    pushMessage(userMsg);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          kbId,
          message,
          conversationId,
          history: messages.slice(-6).map((msg) => ({
            role: msg.role === "user" ? "user" : "assistant",
            text: msg.text,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const reply =
        data.text?.trim() ||
        (language === "en"
          ? "I couldn't generate a response."
          : "لم أتمكن من إنشاء رد.");

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      const botMsg: Msg = {
        id: `b-${Date.now()}`,
        role: "bot",
        text: reply,
        createdAt: new Date().toISOString(),
        isVoice: false,
      };
      pushMessage(botMsg);

      if (audioEnabled) {
        generateTTS(reply, botMsg.id);
      }
    } catch (error) {
      console.error("Text chat error:", error);
      const errorMsg: Msg = {
        id: `err-${Date.now()}`,
        role: "bot",
        text:
          language === "en"
            ? "Sorry, I encountered an error processing your message."
            : "عذراً، حدث خطأ أثناء معالجة رسالتك.",
        createdAt: new Date().toISOString(),
        isVoice: false,
      };
      pushMessage(errorMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const generateTTS = async (text: string, messageId: string) => {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voice: voiceName,
          speed: 1.0,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        updateMessage(messageId, { audioUrl: data.audioUrl });
      }
    } catch (error) {
      console.warn("TTS generation failed:", error);
    }
  };

  const startRecording = async () => {
    if (permission === false) {
      console.error(
        language === "en"
          ? "Microphone permission denied"
          : "تم رفض إذن الوصول إلى الميكروبات",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/wav",
      ];

      let mimeType = "audio/webm";
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", async () => {
        stream.getTracks().forEach((track) => track.stop());

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          await sendVoiceMessage(blob);
        }
      });

      mediaRecorder.start(1000);
      setRecording(true);

      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      setPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);

      if ("vibrate" in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  };

  const sendVoiceMessage = async (blob: Blob) => {
    if (blob.size === 0) {
      console.error(language === "en" ? "Recording empty" : "التسجيل فارغ");
      return;
    }

    if (blob.size < 1000) {
      console.error(
        language === "en" ? "Recording too short" : "التسجيل قصير جدًا",
      );
      return;
    }

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text:
        language === "en"
          ? "Processing voice message..."
          : "جاري معالجة رسالة الصوت...",
      createdAt: new Date().toISOString(),
      isVoice: true,
    };
    pushMessage(userMsg);

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");
    if (kbId) formData.append("kbId", kbId);
    if (conversationId) formData.append("conversationId", conversationId);
    if (voiceName) formData.append("voiceName", voiceName);

    setVoicePending(true);

    try {
      const endpoints = ["/api/call", "/api/voice"];
      let data = null;

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: sessionToken
              ? { Authorization: `Bearer ${sessionToken}` }
              : {},
            body: formData,
          });

          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch (error) {
          console.warn(`${endpoint} failed:`, error);
        }
      }

      if (!data) {
        throw new Error("All voice endpoints failed");
      }

      const transcript = data.text?.trim() || data.transcript?.trim() || "";
      const reply = data.reply?.trim() || "";
      const audioUrl = data.audio || data.audioUrl || null;

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      updateMessage(userMsg.id, {
        text:
          transcript ||
          (language === "en"
            ? "Voice message (no transcript)"
            : "رسالة صوتية (لا يوجد نص)") ||
          "Voice message (no transcript)",
      });

      const botMsg: Msg = {
        id: `b-${Date.now()}`,
        role: "bot",
        text:
          reply ||
          (language === "en" ? "No response generated" : "لم يتم إنشاء رد"),
        audioUrl,
        createdAt: new Date().toISOString(),
        isVoice: true,
      };
      pushMessage(botMsg);

      if (audioUrl && audioEnabled) {
        setTimeout(() => playAudio(botMsg.id, audioUrl), 500);
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      updateMessage(userMsg.id, {
        text:
          language === "en"
            ? "Failed to process voice message"
            : "فشل في معالجة رسالة الصوت",
      });

      const errorMsg: Msg = {
        id: `err-${Date.now()}`,
        role: "bot",
        text:
          language === "en"
            ? "Voice processing error occurred"
            : "حدث خطأ أثناء معالجة الصوت",
        createdAt: new Date().toISOString(),
        isVoice: true,
      };
      pushMessage(errorMsg);
    } finally {
      setVoicePending(false);
    }
  };

  const playAudio = (messageId: string, url: string) => {
    if (!audioEnabled) return;

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onplay = () => {
      setCurrentlyPlaying(messageId);
      updateMessage(messageId, { isPlaying: true });
    };

    audio.onended = () => {
      setCurrentlyPlaying(null);
      updateMessage(messageId, { isPlaying: false });
      currentAudioRef.current = null;
    };

    audio.onerror = (error) => {
      console.error("Audio playback error:", error);
      setCurrentlyPlaying(null);
      updateMessage(messageId, { isPlaying: false });
      currentAudioRef.current = null;
    };

    audio.play().catch((error) => {
      console.error("Audio play failed:", error);
    });
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setCurrentlyPlaying(null);
    setMessages((prev) => prev.map((msg) => ({ ...msg, isPlaying: false })));
  };

  const clearMessages = () => {
    stopAudio();
    setMessages([]);
    setConversationId(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const isRtl = language === "ar";
  const pending = isTyping || voicePending;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", isRtl && "rtl")}>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b p-4"
        style={{
          background: `linear-gradient(to right, ${hexToRgba(primaryColor, 0.08)}, ${hexToRgba(accentColor, 0.06)})`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
            }}
          >
            {mode === "voice" ? (
              <Mic className="h-5 w-5 text-white" />
            ) : (
              <MessageSquare className="h-5 w-5 text-white" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {mode === "voice"
                ? language === "en"
                  ? "Voice Assistant"
                  : "المساعد الصوتي"
                : language === "en"
                  ? "Chat Assistant"
                  : "مساعد الدردشة"}
            </h3>
            <p className="text-muted-foreground text-xs">
              {recording
                ? `${language === "en" ? "Recording" : "جاري التسجيل"} ${formatTime(recordingTime)}`
                : pending
                  ? language === "en"
                    ? "Processing..."
                    : "جاري المعالجة..."
                  : `${messages.length} ${language === "en" ? "messages" : "رسائل"}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-200 p-1 dark:bg-gray-700">
            <Button
              variant={mode === "text" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("text")}
              className={`h-7 px-3 text-xs text-white transition-all duration-300 ease-out hover:text-white! ${mode === "text" ? "bg-[var(--primary)]" : "hover:bg-transparent!"}`}
              style={
                {
                  "--primary": primaryColor,
                } as React.CSSProperties
              }
            >
              {language === "en" ? "Text" : "نص"}
            </Button>
            <Button
              variant={mode === "voice" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("voice")}
              disabled={permission === false}
              className={`h-7 px-3 text-xs text-white transition-all duration-300 hover:text-white! ${mode === "voice" ? "bg-[var(--primary)]" : "hover:bg-transparent!"}`}
              style={
                {
                  "--primary": primaryColor,
                } as React.CSSProperties
              }
            >
              {language === "en" ? "Voice" : "صوتي"}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="h-7 w-7 hover:bg-[var(--primary)]! hover:text-white!"
            title={
              audioEnabled
                ? language === "en"
                  ? "Disable audio"
                  : "تعطيل الصوت"
                : language === "en"
                  ? "Enable audio"
                  : "تمكين الصوت"
            }
            style={
              {
                "--primary": primaryColor,
              } as React.CSSProperties
            }
          >
            {audioEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              className="h-8 w-8 hover:bg-[var(--primary)]! hover:text-white!"
              title={language === "en" ? "Clear messages" : "مسح الرسائل"}
              style={
                {
                  "--primary": primaryColor,
                } as React.CSSProperties
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: `linear-gradient(to bottom right, ${hexToRgba(primaryColor, 0.2)}, ${hexToRgba(accentColor, 0.12)})`,
              }}
            >
              {mode === "voice" ? (
                <Mic className="h-8 w-8" style={{ color: primaryColor }} />
              ) : (
                <MessageSquare
                  className="h-8 w-8"
                  style={{ color: primaryColor }}
                />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {mode === "voice"
                  ? language === "en"
                    ? "Start a voice conversation"
                    : "ابدأ محادثة صوتية"
                  : language === "en"
                    ? "Start a conversation"
                    : "ابدأ محادثة"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {mode === "voice"
                  ? language === "en"
                    ? "Click the microphone to record"
                    : "اضغط على الميكروفون للتسجيل"
                  : language === "en"
                    ? "Type a message or switch to voice mode"
                    : "اكتب رسالة أو قم بالتبديل إلى الوضع الصوتي"}
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {msg.role === "bot" && (
                <div
                  className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `linear-gradient(to bottom right, ${hexToRgba(primaryColor, 0.2)}, ${hexToRgba(accentColor, 0.12)})`,
                  }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{
                      background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
                    }}
                  />
                </div>
              )}

              <div
                className={cn(
                  "group max-w-[85%]",
                  msg.role === "user" ? "order-2" : "order-1",
                )}
              >
                <div
                  className={cn(
                    "relative rounded-2xl px-4 py-2 text-sm break-words",
                    msg.role === "user"
                      ? "rounded-br-md text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                  )}
                  style={
                    msg.role === "user"
                      ? {
                          background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
                        }
                      : {}
                  }
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>

                  {/* Voice indicator */}
                  {msg.isVoice && (
                    <div className="absolute -top-2 -right-2">
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                        style={{
                          background: `linear-gradient(to bottom right, ${accentColor}, ${primaryColor})`,
                        }}
                      >
                        <Mic className="h-3 w-3" />
                      </div>
                    </div>
                  )}

                  {msg.audioUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          msg.isPlaying
                            ? stopAudio()
                            : playAudio(msg.id, msg.audioUrl!)
                        }
                        className={cn(
                          "h-6 px-2 text-xs",
                          msg.role === "user"
                            ? "text-white hover:bg-white/20"
                            : "hover:bg-gray-200 dark:hover:bg-gray-700",
                        )}
                      >
                        {msg.isPlaying ? (
                          <Pause className="mr-1 h-3 w-3" />
                        ) : (
                          <Play className="mr-1 h-3 w-3" />
                        )}
                        {msg.isPlaying
                          ? language === "en"
                            ? "Pause"
                            : "إيقاف مؤقت"
                          : language === "en"
                            ? "Play"
                            : "تشغيل"}
                      </Button>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    "text-muted-foreground mt-1 px-1 text-xs",
                    msg.role === "user" ? "text-right" : "text-left",
                  )}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {msg.role === "user" && (
                <div
                  className="order-3 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `linear-gradient(to bottom right, ${hexToRgba(primaryColor, 0.2)}, ${hexToRgba(accentColor, 0.12)})`,
                  }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{
                      background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}

        {pending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <div className="flex items-center gap-2">
                <Loader className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-sm">
                  {language === "en" ? "Processing..." : "جاري المعالجة..."}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Controls */}
      <div className="border-t bg-white p-4 dark:bg-gray-950">
        {mode === "text" ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                ref={textInputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  language === "en" ? "Type your message..." : "اكتب رسالتك..."
                }
                disabled={pending}
                className="focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--primary)]/50"
                style={{ "--primary": primaryColor } as React.CSSProperties}
              />
            </div>
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || pending || !kbId}
              style={{ background: primaryColor }}
              className="text-white"
            >
              {pending ? <Spinner /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <>
            {permission === false && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <div className="flex items-center gap-2">
                  <MicOff className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {language === "en"
                      ? "Microphone access denied"
                      : "تم رفض الوصول إلى الميكروفون"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center">
              {!recording ? (
                <Button
                  onClick={startRecording}
                  disabled={voicePending || permission === false || !kbId}
                  className={cn(
                    "h-16 w-16 rounded-full p-0 transition-all duration-200",
                    "shadow-lg hover:scale-105 hover:shadow-xl",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
                  )}
                  title={language === "en" ? "Start recording" : "ابدأ التسجيل"}
                  style={{
                    background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
                  }}
                >
                  <Mic className="h-8 w-8 text-white" />
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  className={cn(
                    "h-16 w-16 rounded-full p-0 transition-all duration-200",
                    "bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700",
                    "animate-pulse shadow-lg hover:shadow-xl",
                  )}
                  title={language === "en" ? "Stop recording" : "أوقف التسجيل"}
                >
                  <div className="h-6 w-6 rounded-sm bg-white" />
                </Button>
              )}
            </div>

            <div className="mt-3 text-center">
              <p className="text-muted-foreground text-xs">
                {recording
                  ? language === "en"
                    ? "Tap to stop recording"
                    : "اضغط لإيقاف التسجيل"
                  : language === "en"
                    ? "Tap to record"
                    : "اضغط للتسجيل"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
