"use client";

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
import Spinner from "./Spinner";

// Demo configuration
const DEMO_KB_ID = process.env.NEXT_PUBLIC_DEMO_KB_ID;
const MAX_DEMO_MESSAGES = 10; // Limit demo interactions
const DEMO_VOICE_NAME = "alloy";
const DEMO_LANG = "en";

type Msg = {
  id: string;
  role: "user" | "bot";
  text: string;
  audioUrl?: string | null;
  createdAt: string;
  isPlaying?: boolean;
  isVoice?: boolean;
};

interface VoiceChatWidgetProps {
  lang?: SupportedLang;
  onLimitReached?: () => void;
  onClose?: () => void;
  className?: string;
}

export default function VoiceChatWidget({
  lang = "en",
  onLimitReached,
  onClose,
  className,
}: VoiceChatWidgetProps) {
  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Voice UI state
  const [recording, setRecording] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  // Mode state
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Demo limitations
  const [messageCount, setMessageCount] = useState(0);
  const [isDemo] = useState(true);

  // Refs
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  // WebRTC refs (same as WidgetFrame)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ephemeralSessionRef = useRef<any | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const isRtl = lang === "ar";

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMsg: Msg = {
      id: `welcome-${Date.now()}`,
      role: "bot",
      text:
        lang === "en"
          ? "Hi! I'm a demo assistant. Try asking me about our platform or services. You have limited interactions in this demo."
          : "مرحبا! أنا مساعد تجريبي. جرب سؤالي عن منصتنا أو خدماتنا. لديك تفاعلات محدودة في هذا العرض التوضيحي.",
      createdAt: new Date().toISOString(),
    };
    setMessages([welcomeMsg]);
  }, [lang]);

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

  // Check demo limits
  const checkDemoLimits = () => {
    if (messageCount >= MAX_DEMO_MESSAGES) {
      const limitMsg: Msg = {
        id: `limit-${Date.now()}`,
        role: "bot",
        text:
          lang === "en"
            ? "You've reached the demo limit. Sign up to continue using the full service!"
            : "لقد وصلت إلى حد العرض التوضيحي. اشترك للمتابعة باستخدام الخدمة الكاملة!",
        createdAt: new Date().toISOString(),
      };
      pushMessage(limitMsg);
      onLimitReached?.();
      return false;
    }
    return true;
  };

  // Send text message (simplified, no auth required)
  const sendTextMessage = async () => {
    const message = textInput.trim();
    if (!message) return;

    if (!checkDemoLimits()) return;

    setTextInput("");
    setIsTyping(true);
    setMessageCount((prev) => prev + 1);

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
          // No authorization header for demo
        },
        body: JSON.stringify({
          kbId: DEMO_KB_ID,
          message,
          conversationId,
          history: messages.slice(-6).map((msg) => ({
            role: msg.role === "user" ? "user" : "assistant",
            text: msg.text,
          })),
          isDemo: true, // Flag for demo usage
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const reply =
        data.text?.trim() ||
        (lang === "en"
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
          lang === "en"
            ? "Sorry, I encountered an error. This might be due to demo limitations."
            : "عذراً، واجهت خطأ. قد يكون هذا بسبب قيود العرض التوضيحي.",
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
          voice: DEMO_VOICE_NAME,
          speed: 1.0,
          kbId: DEMO_KB_ID,
          isDemo: true,
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
    const welcomeMsg: Msg = {
      id: `welcome-${Date.now()}`,
      role: "bot",
      text:
        lang === "en"
          ? "Hi! I'm a demo assistant. Try asking me about our platform or services."
          : "مرحبا! أنا مساعد تجريبي. جرب سؤالي عن منصتنا أو خدماتنا.",
      createdAt: new Date().toISOString(),
    };
    setMessages([welcomeMsg]);
    setConversationId(null);
    setMessageCount(0);
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

  const pending = isTyping || voicePending;
  const limitReached = messageCount >= MAX_DEMO_MESSAGES;

  // WebRTC functions (same as WidgetFrame but with demo kbId)
  const fetchEphemeralSession = async () => {
    const resp = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kbId: DEMO_KB_ID,
        voice: DEMO_VOICE_NAME,
        lang: DEMO_LANG,
        isDemo: true,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(
        `Failed to create ephemeral session: ${resp.status} ${txt}`,
      );
    }

    const json = await resp.json();
    ephemeralSessionRef.current = json;
    return json;
  };

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
        resolve();
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

      let audioEl = audioElRef.current;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.setAttribute("playsinline", "");
        audioEl.volume = 1.0;
        audioElRef.current = audioEl;

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

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Audio playing successfully");
            })
            .catch((err) => {
              console.warn("Audio play failed:", err);
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

  const setupDataChannel = (pc: RTCPeerConnection) => {
    const dc = pc.createDataChannel("oai-events", { ordered: true });
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.debug("data channel open");
      try {
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: `You are a helpful AI assistant with access to a knowledge base about our platform. When users ask questions, use the search_knowledge_base function to find relevant information before responding. Always ground your answers in the retrieved information and be conversational and natural. This is a demo session with limited interactions.`,
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

        switch (payload.type) {
          case "session.created":
            console.log("Session created:", payload.session);
            break;

          case "input_audio_buffer.speech_started":
            console.log("User started speaking");
            break;

          case "conversation.item.created":
            if (
              payload.item?.type === "message" &&
              payload.item?.role === "user"
            ) {
              const userText = payload.item?.content?.[0]?.text;
              if (userText) {
                if (!checkDemoLimits()) return;
                setMessageCount((prev) => prev + 1);
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

          case "response.function_call_done":
            if (payload.name === "search_knowledge_base") {
              try {
                const searchArgs = JSON.parse(payload.arguments);
                const searchQuery = searchArgs.query;

                const searchResponse = await fetch("/api/realtime/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    kbId: DEMO_KB_ID,
                    query: searchQuery,
                    topK: 5,
                    isDemo: true,
                  }),
                });

                const searchData = await searchResponse.json();

                if (searchResponse.ok && searchData.success) {
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
                  dc.send(JSON.stringify({ type: "response.create" }));
                } else {
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

          case "response.audio_transcript.done":
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

          case "error":
            console.error("Realtime API error:", payload);
            pushMessage({
              id: `error-${Date.now()}`,
              role: "bot",
              text:
                lang === "en"
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

  const initiateCall = async () => {
    if (limitReached) {
      const limitMsg: Msg = {
        id: `limit-${Date.now()}`,
        role: "bot",
        text:
          lang === "en"
            ? "Demo limit reached. Please sign up for unlimited voice conversations!"
            : "تم الوصول إلى حد العرض التوضيحي. يرجى التسجيل للحصول على محادثات صوتية غير محدودة!",
        createdAt: new Date().toISOString(),
      };
      pushMessage(limitMsg);
      onLimitReached?.();
      return;
    }

    if (pcRef.current) {
      console.warn("Call already running");
      return;
    }

    try {
      setVoicePending(true);

      console.log("Creating ephemeral session...");
      const session = await fetchEphemeralSession();
      const ephemeralToken =
        session?.client_secret?.value ?? session?.client_secret;

      if (!ephemeralToken) {
        throw new Error("Ephemeral token missing in session response");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;

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

      const pc = createPeerConnection();
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      setupDataChannel(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log("Waiting for ICE gathering...");
      await waitForIceGatheringComplete(pc, 10000);

      const finalOffer = pc.localDescription?.sdp;
      if (!finalOffer) {
        throw new Error("No SDP offer available after ICE gathering");
      }

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

      setRecording(true);

      pushMessage({
        id: `session-start-${Date.now()}`,
        role: "bot",
        text:
          lang === "en"
            ? "Demo voice session started. You can speak now!"
            : "تم بدء جلسة العرض التوضيحي الصوتية. يمكنك التحدث الآن!",
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
          lang === "en"
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

  const startCall = async () => {
    // Check if terms have been accepted
    if (!termsAccepted) {
      setShowTermsModal(true);
      return;
    }

    // If terms are already accepted, proceed with the call
    await initiateCall();
  };

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

  const handleAcceptTerms = async () => {
    setTermsAccepted(true);
    setShowTermsModal(false);
    // Now actually start the call using the extracted logic
    await initiateCall();
  };

  const handleDeclineTerms = () => {
    setShowTermsModal(false);
    setMode("text"); // Switch back to text mode
  };

  const isInCall = recording;
  const pendingStatus = isTyping || voicePending;

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", isRtl && "rtl", className)}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                {lang === "en"
                  ? "Voice Assistant Terms"
                  : "شروط المساعد الصوتي"}
              </h3>
            </div>

            <div className="mb-6 max-h-60 overflow-y-auto text-sm text-gray-600 dark:text-gray-300">
              {lang === "en" ? (
                <div className="space-y-3">
                  <p>
                    By using the voice assistant, you agree to the following:
                  </p>
                  <ul className="list-inside list-disc space-y-2">
                    <li>
                      Your voice will be processed in real-time for conversation
                      purposes
                    </li>
                    <li>
                      Audio data is transmitted securely but may be processed by
                      third-party AI services
                    </li>
                    <li>
                      No permanent recordings are stored, but temporary
                      processing may occur
                    </li>
                    <li>
                      You are responsible for not sharing sensitive personal
                      information
                    </li>
                    <li>
                      The service is provided as-is without guarantees of
                      accuracy
                    </li>
                    <li>
                      You must be 18+ or have guardian permission to use voice
                      features
                    </li>
                    <li>This is a demo version with limited interactions</li>
                  </ul>
                  <p className="text-xs text-gray-500">
                    By clicking &quot;I Agree&quot;, you consent to these terms
                    and confirm you understand the voice processing involved.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>باستخدام المساعد الصوتي، فإنك توافق على ما يلي:</p>
                  <ul className="list-inside list-disc space-y-2">
                    <li>سيتم معالجة صوتك في الوقت الفعلي لأغراض المحادثة</li>
                    <li>
                      يتم إرسال البيانات الصوتية بشكل آمن ولكن قد تتم معالجتها
                      بواسطة خدمات ذكاء اصطناعي من طرف ثالث
                    </li>
                    <li>
                      لا يتم تخزين تسجيلات دائمة، ولكن قد تحدث معالجة مؤقتة
                    </li>
                    <li>أنت مسؤول عن عدم مشاركة المعلومات الشخصية الحساسة</li>
                    <li>يتم تقديم الخدمة كما هي دون ضمانات للدقة</li>
                    <li>
                      يجب أن تكون 18+ أو لديك إذن من الوصي لاستخدام الميزات
                      الصوتية
                    </li>
                    <li>هذه نسخة تجريبية مع تفاعلات محدودة</li>
                  </ul>
                  <p className="text-xs text-gray-500">
                    بالنقر على &quot;أوافق&quot;، فإنك توافق على هذه الشروط
                    وتؤكد فهمك لمعالجة الصوت المتضمنة.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleDeclineTerms}
                className="flex-1"
              >
                {lang === "en" ? "Cancel" : "إلغاء"}
              </Button>
              <Button
                onClick={handleAcceptTerms}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
              >
                {lang === "en" ? "I Agree" : "أوافق"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
              isInCall &&
                "animate-pulse bg-gradient-to-br from-blue-500 to-purple-600",
              !isInCall && "bg-gradient-to-br from-blue-500 to-purple-600",
            )}
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
                ? lang === "en"
                  ? "Voice Assistant (Demo)"
                  : "المساعد الصوتي (تجريبي)"
                : lang === "en"
                  ? "Chat Assistant (Demo)"
                  : "مساعد الدردشة (تجريبي)"}
            </h3>
            <p className="text-muted-foreground text-xs">
              {isInCall
                ? lang === "en"
                  ? `In call • ${formatTime(recordingTime)}`
                  : `في المكالمة • ${formatTime(recordingTime)}`
                : pendingStatus
                  ? lang === "en"
                    ? "Processing..."
                    : "جاري المعالجة..."
                  : lang === "en"
                    ? `${messageCount}/${MAX_DEMO_MESSAGES} demo messages`
                    : `${messageCount}/${MAX_DEMO_MESSAGES} رسائل تجريبية`}
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
              disabled={limitReached}
              className="h-7 px-3 text-xs"
            >
              {lang === "en" ? "Text" : "نص"}
            </Button>
            <Button
              variant={mode === "voice" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                if (permission !== false) setMode("voice");
              }}
              disabled={permission === false || limitReached}
              className="h-7 px-3 text-xs"
            >
              {lang === "en" ? "Voice" : "صوتي"}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAudioEnabled(!audioEnabled)}
            disabled={limitReached}
            className="h-7 w-7"
            title={
              audioEnabled
                ? lang === "en"
                  ? "Disable audio"
                  : "تعطيل الصوت"
                : lang === "en"
                  ? "Enable audio"
                  : "تمكين الصوت"
            }
          >
            {audioEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>

          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              className="h-8 w-8"
              title={lang === "en" ? "Clear messages" : "مسح الرسائل"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {messages.length <= 1 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20">
              {mode === "voice" ? (
                <Mic className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              ) : (
                <MessageSquare className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {mode === "voice"
                  ? lang === "en"
                    ? "Try our voice assistant"
                    : "جرب مساعدنا الصوتي"
                  : lang === "en"
                    ? "Try our chat assistant"
                    : "جرب مساعد الدردشة"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {lang === "en"
                  ? `Demo mode: ${MAX_DEMO_MESSAGES - messageCount} interactions remaining`
                  : `الوضع التجريبي: ${MAX_DEMO_MESSAGES - messageCount} تفاعلات متبقية`}
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
                  {lang === "en" ? "In call" : "في المكالمة"}
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
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900/20 dark:to-blue-900/20">
                  <div className="h-4 w-4 rounded-full bg-gradient-to-br from-green-500 to-blue-500" />
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
                      ? "rounded-br-md bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>

                  {msg.isVoice && (
                    <div className="absolute -top-2 -right-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white">
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
                        disabled={limitReached}
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
                          ? lang === "en"
                            ? "Pause"
                            : "إيقاف مؤقت"
                          : lang === "en"
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
                <div className="order-3 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20">
                  <div className="h-4 w-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
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
                  {lang === "en" ? "Processing..." : "جاري المعالجة..."}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Controls */}
      <div className="border-t bg-white p-4 dark:bg-gray-950">
        {limitReached && (
          <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-orange-600" />
              <p className="text-sm text-orange-700 dark:text-orange-400">
                {lang === "en"
                  ? "Demo limit reached. Sign up for unlimited conversations!"
                  : "تم الوصول إلى حد العرض التوضيحي. اشترك للحصول على محادثات غير محدودة!"}
              </p>
            </div>
          </div>
        )}

        {mode === "text" ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                ref={textInputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  lang === "en"
                    ? limitReached
                      ? "Demo limit reached..."
                      : "Ask about our platform..."
                    : limitReached
                      ? "تم الوصول إلى حد العرض التوضيحي..."
                      : "اسأل عن منصتنا..."
                }
                disabled={pendingStatus || limitReached}
                className="focus-visible:ring-blue-500/50"
              />
            </div>
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || pendingStatus || limitReached}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
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
                    {lang === "en"
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
                  disabled={
                    voicePending || permission === false || limitReached
                  }
                  className={cn(
                    "h-16 w-16 rounded-full p-0 transition-all duration-200",
                    "shadow-lg hover:scale-105 hover:shadow-xl",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
                    "bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700",
                  )}
                  title={
                    lang === "en" ? "Start voice call" : "ابدأ المكالمة الصوتية"
                  }
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
                  title={lang === "en" ? "End call" : "إنهاء المكالمة"}
                >
                  <PhoneOff className="h-8 w-8 text-white" />
                </Button>
              )}
            </div>

            <div className="mt-3 text-center">
              <p className="text-muted-foreground text-xs">
                {isInCall
                  ? lang === "en"
                    ? "Speak naturally — the assistant will reply automatically"
                    : "تحدث بطبيعية — سيقوم المساعد بالرد تلقائيًا"
                  : limitReached
                    ? lang === "en"
                      ? "Demo limit reached - sign up for more!"
                      : "تم الوصول إلى حد العرض التوضيحي - اشترك للمزيد!"
                    : lang === "en"
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
