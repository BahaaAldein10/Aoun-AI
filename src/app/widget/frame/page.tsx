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
  Phone,
  PhoneOff,
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

type CallState =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "listening"
  | "processing";

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

  // Real-time call state
  const [callState, setCallState] = useState<CallState>("idle");
  const [callSocket, setCallSocket] = useState<WebSocket | null>(null);
  const [silenceTimeout, setSilenceTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [audioLevel, setAudioLevel] = useState(0);

  // Mode state
  const [mode, setMode] = useState<"text" | "voice">("text");

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const initializationRef = useRef<boolean>(false);

  // Real-time call refs
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingResponseRef = useRef(false);

  // Extract metadata values with fallbacks
  const primaryColor = metadata?.primaryColor || "#3b82f6"; // blue-500
  const accentColor = metadata?.accentColor || "#8B5CF6"; // purple-500
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
    const urlParams = new URLSearchParams(window.location.search);
    const urlKbId = urlParams.get("kbid");

    if (urlKbId && !kbId) {
      console.log("Widget: setting kbId from URL:", urlKbId);
      setKbId(urlKbId);
    }

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
      if (vadTimeoutRef.current) {
        clearTimeout(vadTimeoutRef.current);
      }
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
    };
  }, []);

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

  // Real-time call functions
  const startCall = async () => {
    if (permission === false || !kbId) return;

    try {
      setCallState("connecting");

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      // Set up audio analysis for VAD (Voice Activity Detection)
      const audioContext = new (window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const microphone = audioContext.createMediaStreamSource(stream);
      microphoneRef.current = microphone;
      microphone.connect(analyser);

      // Connect to real-time WebSocket
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/api/realtime-call`;

      const socket = new WebSocket(wsUrl);
      setCallSocket(socket);

      socket.onopen = () => {
        console.log("Real-time call connected");
        setCallState("connected");

        // Send initialization
        socket.send(
          JSON.stringify({
            type: "init",
            kbId,
            sessionToken,
            conversationId,
            voiceName,
            language,
          }),
        );

        startVoiceActivityDetection();
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "transcript":
              if (data.text) {
                const userMsg: Msg = {
                  id: `u-${Date.now()}`,
                  role: "user",
                  text: data.text,
                  createdAt: new Date().toISOString(),
                  isVoice: true,
                };
                pushMessage(userMsg);
              }
              break;

            case "response":
              if (data.text) {
                const botMsg: Msg = {
                  id: `b-${Date.now()}`,
                  role: "bot",
                  text: data.text,
                  createdAt: new Date().toISOString(),
                  isVoice: true,
                };
                pushMessage(botMsg);
              }

              if (data.audio && audioEnabled) {
                await playRealtimeAudio(data.audio);
              }
              break;

            case "error":
              console.error("Call error:", data.message);
              const errorMsg: Msg = {
                id: `err-${Date.now()}`,
                role: "bot",
                text:
                  data.message ||
                  (language === "en"
                    ? "Call error occurred"
                    : "حدث خطأ في المكالمة"),
                createdAt: new Date().toISOString(),
                isVoice: true,
              };
              pushMessage(errorMsg);
              break;
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setCallState("idle");
      };

      socket.onclose = () => {
        console.log("WebSocket closed");
        setCallState("idle");
      };
    } catch (error) {
      console.error("Failed to start call:", error);
      setCallState("idle");
      setPermission(false);
    }
  };

  const endCall = () => {
    console.log("Ending call");

    // Close WebSocket
    if (callSocket) {
      callSocket.close();
      setCallSocket(null);
    }

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clean up audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear timeouts
    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
      vadTimeoutRef.current = null;
    }

    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      setSilenceTimeout(null);
    }

    setCallState("idle");
    setAudioLevel(0);
    isPlayingResponseRef.current = false;
  };

  const startVoiceActivityDetection = () => {
    if (!analyserRef.current || !callSocket) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const detectVoice = () => {
      if (callState === "idle" || !analyser) return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average =
        dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      setAudioLevel(average / 255);

      const threshold = 25; // Voice activity threshold
      const isVoiceActive = average > threshold;

      if (isVoiceActive && !isPlayingResponseRef.current) {
        if (callState !== "speaking") {
          setCallState("speaking");

          // Clear any existing silence timeout
          if (silenceTimeout) {
            clearTimeout(silenceTimeout);
            setSilenceTimeout(null);
          }
        }

        // Send audio data to server
        if (streamRef.current && callSocket?.readyState === WebSocket.OPEN) {
          const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: "audio/webm;codecs=opus",
          });

          mediaRecorder.start();

          mediaRecorder.ondataavailable = (event) => {
            if (
              event.data.size > 0 &&
              callSocket?.readyState === WebSocket.OPEN
            ) {
              const reader = new FileReader();
              reader.onload = () => {
                if (reader.result) {
                  callSocket.send(
                    JSON.stringify({
                      type: "audio",
                      data: reader.result,
                    }),
                  );
                }
              };
              reader.readAsDataURL(event.data);
            }
          };

          // Stop recording after a short interval
          setTimeout(() => {
            if (mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
          }, 500);
        }
      } else if (!isVoiceActive && callState === "speaking") {
        // Start silence timeout
        if (silenceTimeout) {
          clearTimeout(silenceTimeout);
        }

        const timeout = setTimeout(() => {
          if (!isPlayingResponseRef.current) {
            setCallState("listening");
          }
        }, 1000); // 1 second of silence before switching to listening

        setSilenceTimeout(timeout);
      }

      // Continue monitoring
      vadTimeoutRef.current = setTimeout(detectVoice, 100);
    };

    detectVoice();
  };

  const playRealtimeAudio = async (audioData: string) => {
    if (!audioEnabled || !audioContextRef.current) return;

    try {
      isPlayingResponseRef.current = true;
      setCallState("processing");

      // Convert base64 to array buffer
      const binaryString = window.atob(audioData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(
        bytes.buffer,
      );
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => {
        isPlayingResponseRef.current = false;
        if (callState !== "idle") {
          setCallState("listening");
        }
      };

      source.start();
    } catch (error) {
      console.error("Error playing realtime audio:", error);
      isPlayingResponseRef.current = false;
      if (callState !== "idle") {
        setCallState("listening");
      }
    }
  };

  // Text chat functions
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
        if (response.status === 401) {
          throw new Error("Authentication failed - token may be expired");
        }
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
    endCall();
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

  const getCallStateText = () => {
    switch (callState) {
      case "connecting":
        return language === "en" ? "Connecting..." : "جاري الاتصال...";
      case "connected":
        return language === "en"
          ? "Connected - Start speaking"
          : "متصل - ابدأ الحديث";
      case "speaking":
        return language === "en" ? "Listening to you..." : "أستمع إليك...";
      case "listening":
        return language === "en" ? "Ready to listen" : "جاهز للاستماع";
      case "processing":
        return language === "en"
          ? "Processing response..."
          : "جاري معالجة الرد...";
      default:
        return language === "en" ? "Start voice call" : "بدء المكالمة الصوتية";
    }
  };

  const isRtl = language === "ar";
  const pending = isTyping || voicePending;
  const isReady = !!kbId;
  const isInCall = callState !== "idle";

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
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
              isInCall && "animate-pulse",
            )}
            style={{
              background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
            }}
          >
            {mode === "voice" ? (
              isInCall ? (
                <Phone className="h-5 w-5 text-white" />
              ) : (
                <Mic className="h-5 w-5 text-white" />
              )
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
              {isInCall
                ? getCallStateText()
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
              onClick={() => {
                if (isInCall) endCall();
                setMode("text");
              }}
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
              onClick={() => {
                if (permission !== false) {
                  setMode("voice");
                }
              }}
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
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
                isInCall && "animate-pulse",
              )}
              style={{
                background: `linear-gradient(to bottom right, ${hexToRgba(primaryColor, 0.2)}, ${hexToRgba(accentColor, 0.12)})`,
              }}
            >
              {mode === "voice" ? (
                isInCall ? (
                  <Phone className="h-8 w-8" style={{ color: primaryColor }} />
                ) : (
                  <Mic className="h-8 w-8" style={{ color: primaryColor }} />
                )
              ) : (
                <MessageSquare
                  className="h-8 w-8"
                  style={{ color: primaryColor }}
                />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {isInCall
                  ? getCallStateText()
                  : mode === "voice"
                    ? language === "en"
                      ? "Start a voice conversation"
                      : "ابدأ محادثة صوتية"
                    : language === "en"
                      ? "Start a conversation"
                      : "ابدأ محادثة"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {isInCall
                  ? language === "en"
                    ? "Speak naturally - I'll respond in real-time"
                    : "تحدث بطبيعية - سأرد في الوقت الفعلي"
                  : mode === "voice"
                    ? language === "en"
                      ? "Click the call button to start"
                      : "اضغط على زر المكالمة للبدء"
                    : language === "en"
                      ? "Type a message or switch to voice mode"
                      : "اكتب رسالة أو قم بالتبديل إلى الوضع الصوتي"}
              </p>
            </div>

            {/* Voice level indicator for active call */}
            {isInCall && (
              <div className="mt-4 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 w-1 rounded-full transition-all duration-150",
                        audioLevel * 5 > i
                          ? "scale-125 bg-green-500"
                          : "bg-gray-300 dark:bg-gray-600",
                      )}
                    />
                  ))}
                </div>
                <span className="text-muted-foreground text-xs">
                  {callState === "speaking"
                    ? language === "en"
                      ? "Speaking"
                      : "يتحدث"
                    : language === "en"
                      ? "Listening"
                      : "يستمع"}
                </span>
              </div>
            )}
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

            <div className="flex flex-col items-center gap-4">
              {/* Real-time call controls */}
              <div className="flex items-center justify-center">
                {!isInCall ? (
                  <Button
                    onClick={startCall}
                    disabled={permission === false || !isReady}
                    className={cn(
                      "h-16 w-16 rounded-full p-0 transition-all duration-200",
                      "shadow-lg hover:scale-105 hover:shadow-xl",
                      "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
                    )}
                    title={
                      language === "en"
                        ? "Start voice call"
                        : "ابدأ المكالمة الصوتية"
                    }
                    style={{
                      background: `linear-gradient(to bottom right, ${primaryColor}, ${accentColor})`,
                    }}
                  >
                    <Phone className="h-8 w-8 text-white" />
                  </Button>
                ) : (
                  <Button
                    onClick={endCall}
                    className={cn(
                      "h-16 w-16 rounded-full p-0 transition-all duration-200",
                      "bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700",
                      "shadow-lg hover:shadow-xl",
                    )}
                    title={language === "en" ? "End call" : "إنهاء المكالمة"}
                  >
                    <PhoneOff className="h-8 w-8 text-white" />
                  </Button>
                )}
              </div>

              {/* Call status and visual feedback */}
              {isInCall && (
                <div className="flex flex-col items-center gap-2">
                  {/* Audio level visualizer */}
                  <div className="flex items-center justify-center gap-1">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1 rounded-full transition-all duration-150 ease-out",
                          audioLevel * 10 > i
                            ? "h-8 bg-green-500 shadow-sm"
                            : "h-2 bg-gray-300 dark:bg-gray-600",
                        )}
                      />
                    ))}
                  </div>

                  {/* Call state indicator */}
                  <div
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-all duration-300",
                      callState === "speaking" &&
                        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                      callState === "listening" &&
                        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                      callState === "processing" &&
                        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                      callState === "connecting" &&
                        "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
                    )}
                  >
                    {getCallStateText()}
                  </div>
                </div>
              )}

              <div className="text-center">
                <p className="text-muted-foreground text-xs">
                  {isInCall
                    ? language === "en"
                      ? "Speak naturally - I'll respond in real-time"
                      : "تحدث بطبيعية - سأرد في الوقت الفعلي"
                    : language === "en"
                      ? "Tap to start a real-time voice conversation"
                      : "اضغط لبدء محادثة صوتية في الوقت الفعلي"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
