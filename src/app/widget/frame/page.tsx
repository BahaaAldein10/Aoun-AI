/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/widget/frame/page.tsx
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

  // Continuous mode (auto re-listen after bot audio ends)
  const [continuous, setContinuous] = useState<boolean>(false);

  // Mode state
  const [mode, setMode] = useState<"text" | "voice">("text");

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const initializationRef = useRef<boolean>(false);

  // SpeechRecognition refs and interim transcript
  const recognitionRef = useRef<any>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>("");

  // Extract metadata values with fallbacks
  const primaryColor = metadata?.primaryColor || "#3b82f6"; // blue-500
  const accentColor = metadata?.accentColor || "#8B5CF6"; // purple-500
  const voiceName = metadata?.voice || "alloy";
  const language = (metadata?.language as SupportedLang) ?? "en";

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

  // Notify parent that iframe is ready
  const notifyParentReady = useCallback(() => {
    if (kbId && !initializationRef.current) {
      try {
        window.parent.postMessage({ type: "AOUN_WIDGET_READY", kbId }, "*");
        initializationRef.current = true;
        console.log("Widget: sent ready message to parent");
      } catch (err) {
        console.warn("Failed to notify parent:", err);
      }
    }
  }, [kbId]);

  // Listen for parent messages (initialization & token refresh)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data || {};

      if (data?.type === "AOUN_WIDGET_INIT") {
        console.log("Widget: received INIT message", {
          hasToken: !!data.token,
          kbId: data.kbId,
        });

        // Validate the token is for our kbId (if we have one set)
        if (kbId && data.kbId !== kbId) {
          console.warn("Widget: INIT kbId mismatch", {
            expected: kbId,
            received: data.kbId,
          });
          return;
        }

        setSessionToken(data.token ?? null);
        setKbId(data.kbId ?? null);
        setMetadata(data.metadata ?? null);

        // Set welcome message based on language
        const welcomeMsg: Msg = {
          id: `welcome-${Date.now()}`,
          role: "bot",
          text:
            data.metadata?.language === "en" || !data.metadata?.language
              ? "Hello! How can I help you today?"
              : "مرحبا! كيف يمكنني مساعدتك اليوم؟",
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => (prev.length === 0 ? [welcomeMsg] : prev));
      } else if (data?.type === "AOUN_WIDGET_TOKEN_REFRESH") {
        console.log("Widget: received TOKEN_REFRESH message");

        if (data.kbId === kbId) {
          setSessionToken(data.token ?? null);
          if (data.metadata) setMetadata(data.metadata);
        }
      } else if (data?.type === "AOUN_WIDGET_MESSAGE") {
        console.log("Widget: parent message:", data.payload);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [kbId]);

  // Send ready signal when component mounts and when kbId changes
  useEffect(() => {
    if (kbId) {
      notifyParentReady();
    }
  }, [kbId, notifyParentReady]);

  // Initial setup - try to get kbId from URL if not provided by parent
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKbId = urlParams.get("kbid");

      if (urlKbId && !kbId) {
        console.log("Widget: setting kbId from URL:", urlKbId);
        setKbId(urlKbId);
      }
    } catch (e) {
      // ignore in non-browser server rendering
    }

    // Send ready message after a brief delay to ensure parent is listening
    const timer = setTimeout(() => {
      notifyParentReady();
    }, 100);

    return () => clearTimeout(timer);
  }, [kbId, notifyParentReady]);

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
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000) as unknown as number;
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current as number);
        recordingTimerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current as number);
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

  // ------------------------
  // SpeechRecognition (optional, for live interim transcript while recording)
  // ------------------------
  function startLocalRecognition() {
    try {
      const globalAny: any = window as any;
      const SpeechRecognition =
        globalAny.SpeechRecognition || globalAny.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        recognitionRef.current = null;
        return;
      }
      const rec = new SpeechRecognition();
      rec.interimResults = true;
      rec.lang = language === "ar" ? "ar-SA" : "en-US";
      rec.maxAlternatives = 1;
      rec.onresult = (ev: any) => {
        let interim = "";
        let final = "";
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const r = ev.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        setInterimTranscript((final || interim || "").trim());
      };
      rec.onerror = (e: any) => {
        console.warn("SpeechRecognition error:", e);
      };
      rec.onend = () => {
        // leave last captured interim until server final result replaces it
      };
      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      console.warn("startLocalRecognition failed:", e);
      recognitionRef.current = null;
    }
  }

  function stopLocalRecognition() {
    try {
      if (
        recognitionRef.current &&
        typeof recognitionRef.current.stop === "function"
      ) {
        recognitionRef.current.stop();
      }
      recognitionRef.current = null;
    } catch {
      recognitionRef.current = null;
    }
  }

  // ------------------------
  // Text chat functions
  // ------------------------
  const sendTextMessage = async () => {
    const message = textInput.trim();
    if (!message || !kbId) {
      console.warn("Widget: cannot send message", {
        message: !!message,
        kbId: !!kbId,
      });
      return;
    }

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
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          text,
          voice: voiceName,
          speed: 1.0,
          kbId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        updateMessage(messageId, {
          audioUrl: data.audioUrl || data.audio || null,
        });
      }
    } catch (error) {
      console.warn("TTS generation failed:", error);
    }
  };

  // ------------------------
  // Recording (MediaRecorder)
  // ------------------------
  const startRecording = async () => {
    if (permission === false || !kbId) {
      console.error("Cannot start recording", { permission, kbId });
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
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          // ignore
        }

        // Stop local recognition and capture last interim
        stopLocalRecognition();

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          await sendVoiceMessage(blob);
        }
      });

      // start local recognition if supported (gives interim transcript)
      startLocalRecognition();

      mediaRecorder.start(250); // chunk every 250ms
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
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("mediaRecorder.stop() failed:", e);
      }
      mediaRecorderRef.current = null;
      setRecording(false);

      if ("vibrate" in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  };

  // ------------------------
  // Send voice blob to server (/api/call -> /api/voice)
  // ------------------------
  const sendVoiceMessage = async (blob: Blob) => {
    if (blob.size === 0) {
      console.error("Cannot send empty voice blob");
      return;
    }

    if (blob.size < 1000) {
      console.error(
        language === "en" ? "Recording too short" : "التسجيل قصير جدًا",
      );
      return;
    }

    // show user's interim message (if any)
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text:
        interimTranscript ||
        (language === "en"
          ? "Processing voice message..."
          : "جاري معالجة رسالة الصوت..."),
      createdAt: new Date().toISOString(),
      isVoice: true,
    };
    pushMessage(userMsg);
    setInterimTranscript("");

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
          } else {
            const txt = await response.text().catch(() => "");
            console.warn(`${endpoint} returned ${response.status}: ${txt}`);
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
            : "رسالة صوتية (لا يوجد نص)"),
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
        // play and if continuous is ON, auto-restart recording after audio ends
        await playAudio(botMsg.id, audioUrl, continuous);
      } else if (continuous) {
        // If continuous and no audio, restart recording
        setTimeout(() => startRecording(), 300);
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

  // ------------------------
  // Playback
  // ------------------------
  const playAudio = async (
    messageId: string,
    url: string,
    autoRestartAfter = false,
  ) => {
    if (!audioEnabled) return;

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
      } catch {}
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
      if (autoRestartAfter) {
        setTimeout(() => {
          if (continuous) startRecording();
        }, 300);
      }
    };

    audio.onerror = (error) => {
      console.error("Audio playback error:", error);
      setCurrentlyPlaying(null);
      updateMessage(messageId, { isPlaying: false });
      currentAudioRef.current = null;
      if (autoRestartAfter && continuous) {
        setTimeout(() => startRecording(), 300);
      }
    };

    try {
      await audio.play();
    } catch (err) {
      console.error("Audio play failed:", err);
    }
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
      } catch {}
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
  const isReady = Boolean(kbId);

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", isRtl && "rtl")}
      dir={isRtl ? "rtl" : "ltr"}
    >
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
              disabled={!isReady}
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
              disabled={permission === false || !isReady}
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
            disabled={!isReady}
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
              disabled={!isReady}
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
                disabled={pending || !isReady}
                className="focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--primary)]/50"
                style={{ "--primary": primaryColor } as React.CSSProperties}
              />
            </div>
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || pending || !isReady}
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

            {/* Continuous toggle + status */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm">
                  {language === "en" ? "Continuous" : "متواصل"}
                </label>
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={() => setContinuous((v) => !v)}
                  disabled={!isReady}
                />
                <span className="text-muted-foreground ml-2 text-xs">
                  {continuous
                    ? language === "en"
                      ? "Auto re-listen"
                      : "إعادة الاستماع أوتوماتيكياً"
                    : language === "en"
                      ? "Push to talk"
                      : "اضغط وتحدث"}
                </span>
              </div>
              <div className="text-muted-foreground text-xs">
                {recording
                  ? `${language === "en" ? "Recording" : "جاري التسجيل"} ${formatTime(recordingTime)}`
                  : pending
                    ? language === "en"
                      ? "Processing..."
                      : "جاري المعالجة..."
                    : ""}
              </div>
            </div>

            <div className="flex items-center justify-center">
              {!recording ? (
                <Button
                  onClick={startRecording}
                  disabled={voicePending || permission === false || !isReady}
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

            {interimTranscript && (
              <div className="text-muted-foreground mt-3 rounded p-2 text-sm">
                <strong>
                  {language === "en" ? "You (live): " : "أنت (مباشر): "}
                </strong>
                <span>{interimTranscript}</span>
              </div>
            )}

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
