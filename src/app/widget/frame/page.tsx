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
  Phone,
  PhoneOff,
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

  // Voice UI state
  const [recording, setRecording] = useState(false); // indicates call active
  const [voicePending, setVoicePending] = useState(false); // for non-realtime fallback if used
  const [permission, setPermission] = useState<boolean | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  // Mode state
  const [mode, setMode] = useState<"text" | "voice">("text");

  // Refs
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const initializationRef = useRef<boolean>(false);
  const recordingTimerRef = useRef<number | null>(null);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ephemeralSessionRef = useRef<any | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

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
    const urlParams = new URLSearchParams(window.location.search);
    const urlKbId = urlParams.get("kbid");

    if (urlKbId && !kbId) {
      console.log("Widget: setting kbId from URL:", urlKbId);
      setKbId(urlKbId);
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
      stopCall();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Add this to your startCall function after creating audio context
  useEffect(() => {
    const debugAudio = async () => {
      try {
        const audioContext = audioContextRef.current;
        if (audioContext) {
          console.log("Audio context state:", audioContext.state);
          if (audioContext.state === "suspended") {
            console.log("Attempting to resume audio context...");
            await audioContext.resume();
            console.log("Audio context resumed:", audioContext.state);
          }
        }
      } catch (err) {
        console.error("Audio context error:", err);
      }
    };

    if (recording) {
      debugAudio();
    }
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

  // ------------------ Text chat ------------------
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

    setCurrentlyPlaying(null);
    setMessages((prev) => prev.map((msg) => ({ ...msg, isPlaying: false })));
  };

  const clearMessages = () => {
    stopAudio();
    stopCall();
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
  const isReady = !!kbId;

  // ----------------------- WebRTC / Realtime helpers -----------------------

  // Fetch ephemeral session from your server route /api/realtime/session
  const fetchEphemeralSession = async () => {
    console.log("Fetching ephemeral session with:", {
      kbId,
      voice: voiceName,
      language,
    });

    const resp = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kbId, voice: voiceName, language }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("Session creation failed:", {
        status: resp.status,
        body: txt,
      });
      throw new Error(
        `Failed to create ephemeral session: ${resp.status} ${txt}`,
      );
    }

    const json = await resp.json();
    console.log("Session created successfully:", json);
    ephemeralSessionRef.current = json;
    return json;
  };

  // Wait for ICE gathering to finish (or timeout)
  function waitForIceGatheringComplete(
    pc: RTCPeerConnection,
    timeoutMs = 10000,
  ) {
    return new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }

      function handler() {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", handler);
          clearTimer();
          resolve();
        }
      }
      pc.addEventListener("icegatheringstatechange", handler);

      const timer = window.setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve(); // resolve anyway (trickle may still work)
      }, timeoutMs);

      function clearTimer() {
        window.clearTimeout(timer);
      }
    });
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (ev) => {
      console.debug("onicecandidate:", ev.candidate);
    };

    pc.oniceconnectionstatechange = () => {
      console.debug("iceConnectionState:", pc.iceConnectionState);
      if (
        ["failed", "closed", "disconnected"].includes(pc.iceConnectionState)
      ) {
        console.warn("ICE failed => stopping call");
        stopCall();
      }
    };

    // Enhanced track handling with better debugging
    pc.ontrack = (ev) => {
      console.log("ontrack event:", {
        streamCount: ev.streams.length,
        trackKind: ev.track.kind,
        trackReadyState: ev.track.readyState,
        streamId: ev.streams[0]?.id,
      });

      const [remoteStream] = ev.streams;
      if (!remoteStream) {
        console.warn("No remote stream in track event");
        return;
      }

      // Enhanced audio element setup
      let audioEl = audioElRef.current;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.setAttribute("playsinline", "");
        audioEl.volume = 1.0; // Ensure volume is at maximum
        audioElRef.current = audioEl;

        // Enhanced event listeners
        audioEl.onloadstart = () => console.log("Audio load started");
        audioEl.oncanplay = () => console.log("Audio can play");
        audioEl.onplay = () => console.log("Audio started playing");
        audioEl.onplaying = () => console.log("Audio is playing");
        audioEl.onpause = () => console.log("Audio paused");
        audioEl.onended = () => console.log("Audio ended");
        audioEl.onwaiting = () => console.log("Audio waiting for data");
        audioEl.onstalled = () => console.log("Audio stalled");
        audioEl.onerror = (error) => {
          console.error("Audio error:", error);
          console.error("Audio error details:", audioEl?.error);
        };
        audioEl.onvolumechange = () => {
          console.log("Audio volume changed to:", audioEl?.volume);
        };
      }

      try {
        // Check if stream has audio tracks
        const audioTracks = remoteStream.getAudioTracks();
        console.log("Remote stream audio tracks:", {
          count: audioTracks.length,
          tracks: audioTracks.map((track) => ({
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          })),
        });

        if (audioTracks.length === 0) {
          console.warn("No audio tracks in remote stream");
          return;
        }

        audioEl.srcObject = remoteStream;

        // Force play with user gesture handling
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Audio playing successfully");
            })
            .catch((err) => {
              console.warn("Audio play failed:", err);
              // Try to enable audio after user interaction
              const enableAudio = () => {
                console.log(
                  "Attempting to enable audio after user interaction",
                );
                audioEl?.play().catch(console.warn);
                document.removeEventListener("click", enableAudio);
                document.removeEventListener("touchstart", enableAudio);
              };
              document.addEventListener("click", enableAudio);
              document.addEventListener("touchstart", enableAudio);
            });
        }
      } catch (err) {
        console.error("Failed setting remote stream to audio element:", err);
      }
    };

    return pc;
  }

  // Enhanced data channel message handling with better event processing
  const setupDataChannel = (pc: RTCPeerConnection) => {
    const dc = pc.createDataChannel("oai-events", {
      ordered: true,
    });
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.debug("data channel open");
      // Send initial configuration with KB-aware instructions
      try {
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: `You are a helpful AI assistant with access to a knowledge base. When users ask questions, use the search_knowledge_base function to find relevant information before responding. Always ground your answers in the retrieved information and be conversational and natural.`,
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
              },
              tools: [
                {
                  type: "function",
                  name: "search_knowledge_base",
                  description:
                    "Search the knowledge base for relevant information to answer the user's question",
                  parameters: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description:
                          "The search query to find relevant information",
                      },
                    },
                    required: ["query"],
                  },
                },
              ],
              tool_choice: "auto",
            },
          }),
        );
      } catch (err) {
        console.warn("Failed to send initial session config:", err);
      }
    };

    dc.onmessage = async (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        console.debug("data channel message:", payload);

        // Handle different event types with KB integration
        switch (payload.type) {
          case "session.created":
            console.log("Session created:", payload.session);
            break;

          case "session.updated":
            console.log("Session updated:", payload.session);
            break;

          case "input_audio_buffer.speech_started":
            console.log("User started speaking");
            break;

          case "input_audio_buffer.speech_stopped":
            console.log("User stopped speaking");
            break;

          case "input_audio_buffer.committed":
            console.log("Audio buffer committed");
            break;

          case "conversation.item.created":
            console.log("Conversation item created:", payload.item);
            // Check if this is a user message for potential KB search
            if (
              payload.item?.type === "message" &&
              payload.item?.role === "user"
            ) {
              const userText = payload.item?.content?.[0]?.text;
              if (userText) {
                pushMessage({
                  id: `user-${Date.now()}`,
                  role: "user",
                  text: userText,
                  createdAt: new Date().toISOString(),
                  isVoice: true,
                });
              }
            }
            break;

          case "response.created":
            console.log("Response created:", payload.response);
            break;

          case "response.output_item.added":
            console.log("Response output item added:", payload.item);
            break;

          case "response.content_part.added":
            console.log("Response content part added:", payload.part);
            break;

          case "response.function_call_delta":
            console.log("Function call delta:", payload);
            break;

          case "response.function_call_done":
            console.log("Function call done:", payload);
            // Handle KB search function call
            if (payload.name === "search_knowledge_base") {
              try {
                const searchArgs = JSON.parse(payload.arguments);
                const searchQuery = searchArgs.query;

                console.log("Performing KB search for:", searchQuery);

                // Call our KB search API
                const searchResponse = await fetch("/api/realtime/search", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    kbId,
                    query: searchQuery,
                    topK: 5,
                  }),
                });

                const searchData = await searchResponse.json();

                if (searchResponse.ok && searchData.success) {
                  // Send the search results back to OpenAI
                  const functionResult = {
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: payload.call_id,
                      output: JSON.stringify({
                        contextText: searchData.contextText,
                        sources: searchData.sources,
                        totalResults: searchData.totalResults,
                      }),
                    },
                  };

                  dc.send(JSON.stringify(functionResult));

                  // Trigger response generation
                  dc.send(JSON.stringify({ type: "response.create" }));
                } else {
                  // Send error result
                  const errorResult = {
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: payload.call_id,
                      output: JSON.stringify({
                        error: "Failed to search knowledge base",
                        contextText:
                          "No information could be retrieved from the knowledge base.",
                      }),
                    },
                  };
                  dc.send(JSON.stringify(errorResult));
                  dc.send(JSON.stringify({ type: "response.create" }));
                }
              } catch (searchError) {
                console.error("KB search error:", searchError);
                // Send error to OpenAI
                const errorResult = {
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: payload.call_id,
                    output: JSON.stringify({
                      error: "Search failed",
                      contextText:
                        "Unable to search the knowledge base at this time.",
                    }),
                  },
                };
                dc.send(JSON.stringify(errorResult));
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            }
            break;

          case "response.audio_transcript.delta":
            console.log("Audio transcript delta:", payload.delta);
            break;

          case "response.audio_transcript.done":
            console.log("Audio transcript done:", payload.transcript);
            if (payload.transcript) {
              pushMessage({
                id: `transcript-${Date.now()}`,
                role: "bot",
                text: payload.transcript,
                createdAt: new Date().toISOString(),
                isVoice: true,
              });
            }
            break;

          case "response.text.delta":
            console.log("Text delta:", payload.delta);
            break;

          case "response.text.done":
            console.log("Text done:", payload.text);
            if (payload.text) {
              pushMessage({
                id: `text-${Date.now()}`,
                role: "bot",
                text: payload.text,
                createdAt: new Date().toISOString(),
                isVoice: true,
              });
            }
            break;

          case "response.audio.delta":
            console.log(
              "Audio delta received, length:",
              payload.delta?.length || 0,
            );
            break;

          case "response.audio.done":
            console.log("Audio response completed");
            break;

          case "response.done":
            console.log("Response completed:", payload.response);
            break;

          case "rate_limits.updated":
            console.log("Rate limits updated:", payload.rate_limits);
            break;

          case "error":
            console.error("Realtime API error:", payload);
            pushMessage({
              id: `error-${Date.now()}`,
              role: "bot",
              text:
                language === "en"
                  ? `Error: ${payload.error?.message || "Unknown error"}`
                  : `خطأ: ${payload.error?.message || "خطأ غير معروف"}`,
              createdAt: new Date().toISOString(),
              isVoice: true,
            });
            break;

          default:
            console.debug("Unhandled event type:", payload.type, payload);
        }
      } catch {
        console.debug("Non-JSON data channel message:", ev.data);
      }
    };

    dc.onerror = (error) => {
      console.error("Data channel error:", error);
    };

    dc.onclose = () => {
      console.debug("Data channel closed");
    };

    return dc;
  };

  // Start a continuous call to OpenAI Realtime (WebRTC -> OpenAI)
  const startCall = async () => {
    if (!kbId) {
      console.warn("No kbId set; cannot start call");
      return;
    }
    if (pcRef.current) {
      console.warn("Call already running");
      return;
    }

    try {
      setVoicePending(true);

      // 1) Create ephemeral session with kbId context
      console.log("Creating ephemeral session...");
      const session = await fetchEphemeralSession();
      const ephemeralToken =
        session?.client_secret?.value ?? session?.client_secret;

      if (!ephemeralToken) {
        throw new Error("Ephemeral token missing in session response");
      }

      console.log("Ephemeral session created:", {
        id: session.id,
        model: session.model,
        expires_at: session.expires_at,
      });

      // 2) Get audio stream with better constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000, // OpenAI prefers 24kHz
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;

      // Setup audio monitoring
      const ac = new (window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext)();
      audioContextRef.current = ac;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      const source = ac.createMediaStreamSource(stream);
      micSourceRef.current = source;
      source.connect(analyser);

      // Audio level animation
      const updateLevel = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setAudioLevel(avg / 255);
        if (recording) {
          requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();

      // 3) Create peer connection
      const pc = createPeerConnection();
      pcRef.current = pc;

      // Add tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup data channel with enhanced handling
      setupDataChannel(pc);

      // 4) Create and set offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 5) Wait for ICE gathering
      console.log("Waiting for ICE gathering...");
      await waitForIceGatheringComplete(pc, 10000); // Longer timeout

      const finalOffer = pc.localDescription?.sdp;
      if (!finalOffer) {
        throw new Error("No SDP offer available after ICE gathering");
      }

      // 6) Send to OpenAI
      const modelName = session.model || "gpt-4o-mini-realtime";
      const realtimeUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(modelName)}`;

      console.log("Sending offer to OpenAI Realtime API...");
      const resp = await fetch(realtimeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
        body: finalOffer,
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "");
        console.error("OpenAI Realtime API error:", {
          status: resp.status,
          statusText: resp.statusText,
          body: errorText,
        });
        throw new Error(
          `Realtime SDP exchange failed: ${resp.status} - ${errorText}`,
        );
      }

      const answerSdp = await resp.text();
      if (!answerSdp) {
        throw new Error("No SDP answer returned from realtime endpoint");
      }

      console.log("Received SDP answer, setting remote description...");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Mark as recording
      setRecording(true);

      pushMessage({
        id: `session-start-${Date.now()}`,
        role: "bot",
        text:
          language === "en"
            ? "Voice session started. You can speak now!"
            : "تم بدء الجلسة الصوتية. يمكنك التحدث الآن!",
        createdAt: new Date().toISOString(),
        isVoice: true,
      });

      console.log("WebRTC call established successfully");
    } catch (err) {
      console.error("startCall error:", err);
      pushMessage({
        id: `error-${Date.now()}`,
        role: "bot",
        text:
          language === "en"
            ? `Failed to start voice session: ${err instanceof Error ? err.message : String(err)}`
            : `فشل بدء الجلسة الصوتية: ${err instanceof Error ? err.message : String(err)}`,
        createdAt: new Date().toISOString(),
        isVoice: true,
      });
      stopCall();
    } finally {
      setVoicePending(false);
    }
  };

  // Stop call and cleanup
  const stopCall = () => {
    setRecording(false);
    setAudioLevel(0);

    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    } catch (e) {
      console.warn("Error stopping local stream:", e);
    }

    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          try {
            if (s.track) s.track.stop();
          } catch {}
        });
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch (e) {
      console.warn("Error closing PeerConnection:", e);
    }

    try {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.srcObject = null;
        audioElRef.current = null;
      }
    } catch {}

    try {
      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close();
        } catch {}
        dataChannelRef.current = null;
      }
    } catch {}

    try {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      micSourceRef.current = null;
    } catch (e) {
      console.warn("Error cleaning audio context:", e);
    }

    ephemeralSessionRef.current = null;
  };

  // ----------------------- UI helpers / rendering -----------------------

  const isInCall = recording;
  const pendingStatus = isTyping || voicePending;

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
                ? language === "en"
                  ? `In call • ${formatTime(recordingTime)}`
                  : `في المكالمة • ${formatTime(recordingTime)}`
                : pendingStatus
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
                if (isInCall) stopCall();
                setMode("text");
              }}
              disabled={!isReady}
              className={`h-7 px-3 text-xs text-white transition-all duration-300 ease-out hover:text-white! ${mode === "text" ? "bg-[var(--primary)]" : "hover:bg-transparent!"}`}
              style={{ "--primary": primaryColor } as React.CSSProperties}
            >
              {language === "en" ? "Text" : "نص"}
            </Button>
            <Button
              variant={mode === "voice" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                if (permission !== false) setMode("voice");
              }}
              disabled={permission === false || !isReady}
              className={`h-7 px-3 text-xs text-white transition-all duration-300 hover:text-white! ${mode === "voice" ? "bg-[var(--primary)]" : "hover:bg-transparent!"}`}
              style={{ "--primary": primaryColor } as React.CSSProperties}
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
            style={{ "--primary": primaryColor } as React.CSSProperties}
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
              style={{ "--primary": primaryColor } as React.CSSProperties}
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
                    ? "Click the call button to start"
                    : "اضغط على زر المكالمة للبدء"
                  : language === "en"
                    ? "Type a message or switch to voice mode"
                    : "اكتب رسالة أو قم بالتبديل إلى الوضع الصوتي"}
              </p>
            </div>

            {isInCall && (
              <div className="mt-4 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 w-3 rounded-md transition-all",
                        audioLevel * 5 > i
                          ? "scale-y-110 bg-green-500"
                          : "bg-gray-300",
                      )}
                    />
                  ))}
                </div>
                <span className="text-muted-foreground text-xs">
                  {language === "en" ? "In call" : "في المكالمة"}
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

        {pendingStatus && (
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
                disabled={pendingStatus || !isReady}
                className="focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--primary)]/50"
                style={{ "--primary": primaryColor } as React.CSSProperties}
              />
            </div>
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || pendingStatus || !isReady}
              style={{ background: primaryColor }}
              className="text-white"
            >
              {pendingStatus ? <Spinner /> : <Send className="h-4 w-4" />}
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
              {!isInCall ? (
                <Button
                  onClick={startCall}
                  disabled={voicePending || permission === false || !isReady}
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
                  onClick={stopCall}
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

            <div className="mt-3 text-center">
              <p className="text-muted-foreground text-xs">
                {isInCall
                  ? language === "en"
                    ? "Speak naturally — the assistant will reply automatically"
                    : "تحدث بطبيعية — سيقوم المساعد بالرد تلقائيًا"
                  : language === "en"
                    ? "Tap to start a real-time voice conversation"
                    : "اضغط لبدء محادثة صوتية في الوقت الفعلي"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
