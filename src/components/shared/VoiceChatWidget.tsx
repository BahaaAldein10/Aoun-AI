"use client";

import { Button } from "@/components/ui/button";
import { useDictionary } from "@/contexts/dictionary-context";
import { cn } from "@/lib/utils";
import {
  Loader,
  Mic,
  MicOff,
  Pause,
  Play,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

type Msg = {
  id: string;
  role: "user" | "bot";
  text: string;
  audioUrl?: string | null;
  createdAt: string;
  isPlaying?: boolean;
};

interface VoiceChatWidgetProps {
  lang?: string;
  onClose?: () => void;
}

export default function VoiceChatWidget({
  lang = "en",
  onClose,
}: VoiceChatWidgetProps) {
  const dict = useDictionary();
  const t = dict.widget;

  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

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

  const startRecording = async () => {
    if (permission === false) {
      toast.error(t.microphone_permission_denied);
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
          await sendAudio(blob);
        }
      });

      mediaRecorder.start(1000); // Collect data every second
      setRecording(true);

      // Haptic feedback if available
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error(t.failed_start_recording);
      setPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);

      // Haptic feedback if available
      if ("vibrate" in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  };

  const sendAudio = async (blob: Blob) => {
    // Validate audio blob
    if (blob.size === 0) {
      toast.error(t.recording_empty);
      return;
    }

    if (blob.size < 1000) {
      // Less than 1KB
      toast.error(t.recording_too_short);
      return;
    }

    // Add user message placeholder
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: t.processing_voice_message,
      createdAt: new Date().toISOString(),
    };
    pushMessage(userMsg);

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    setPending(true);

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const transcript = data.transcript?.trim() || "";
      const reply = data.reply?.trim() || "";
      const audioUrl = data.audioUrl || null;

      if (!transcript && !reply) {
        throw new Error("No response received");
      }

      // Update user message with transcript
      updateMessage(userMsg.id, {
        text: transcript || t.voice_message_no_transcript,
      });

      // Add bot response
      const botMsg: Msg = {
        id: `b-${Date.now()}`,
        role: "bot",
        text: reply || t.no_response_generated,
        audioUrl,
        createdAt: new Date().toISOString(),
      };
      pushMessage(botMsg);

      // Auto-play response if audio is enabled
      if (audioUrl && audioEnabled) {
        setTimeout(() => playAudio(botMsg.id, audioUrl), 500);
      } else if (reply && audioEnabled) {
        setTimeout(() => speakText(reply), 500);
      }
    } catch (error) {
      console.error("Voice processing error:", error);

      // Update user message to show error
      updateMessage(userMsg.id, {
        text: t.failed_process_voice_message,
      });

      // Add error message
      const errorMsg: Msg = {
        id: `err-${Date.now()}`,
        role: "bot",
        text: t.voice_processing_error,
        createdAt: new Date().toISOString(),
      };
      pushMessage(errorMsg);

      toast.error(t.voice_processing_failed);
    } finally {
      setPending(false);
    }
  };

  const speakText = (text: string) => {
    if (!text || !audioEnabled) return;
    if (!("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported");
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Configure voice based on language
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) => {
      if (lang?.startsWith("ar")) {
        return voice.lang.startsWith("ar");
      }
      return voice.lang.startsWith("en");
    });

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.lang = lang?.startsWith("ar") ? "ar-SA" : "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.8;

    utterance.onstart = () => {
      setCurrentlyPlaying("tts");
    };

    utterance.onend = () => {
      setCurrentlyPlaying(null);
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setCurrentlyPlaying(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const playAudio = (messageId: string, url: string) => {
    if (!audioEnabled) return;

    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    // Stop speech synthesis
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
      toast.error(t.failed_play_audio);
    };

    audio.play().catch((error) => {
      console.error("Audio play failed:", error);
      toast.error(t.failed_play_audio);
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
    toast.success(t.messages_cleared);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isRtl = lang === "ar";

  return (
    <div className={cn("flex h-full flex-col", isRtl && "rtl")}>
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
            <Mic className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t.voice_assistant}</h3>
            <p className="text-muted-foreground text-xs">
              {recording
                ? `${t.recording_status} ${formatTime(recordingTime)}`
                : pending
                  ? t.processing_status
                  : `${messages.length} ${t.messages_count}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="h-8 w-8"
            title={audioEnabled ? t.disable_audio : t.enable_audio}
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
              className="h-8 w-8"
              title={t.clear_messages}
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
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20">
              <Mic className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {t.start_voice_conversation}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t.start_conversation_description}
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
                    "rounded-2xl px-4 py-2 text-sm break-words",
                    msg.role === "user"
                      ? "rounded-br-md bg-blue-500 text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>

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
                        {msg.isPlaying ? t.pause : t.play}
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

        {pending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <div className="flex items-center gap-2">
                <Loader className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-sm">
                  {t.processing_message}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording Controls */}
      <div className="border-t bg-white p-4 dark:bg-gray-950">
        {permission === false && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-2">
              <MicOff className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-700 dark:text-red-400">
                {t.microphone_access_denied}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center">
          {!recording ? (
            <Button
              onClick={startRecording}
              disabled={pending || permission === false}
              className={cn(
                "h-16 w-16 rounded-full p-0 transition-all duration-200",
                "bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700",
                "shadow-lg hover:scale-105 hover:shadow-xl",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
              )}
              title={t.start_recording}
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
              title={t.stop_recording}
            >
              <div className="h-6 w-6 rounded-sm bg-white" />
            </Button>
          )}
        </div>

        <div className="mt-3 text-center">
          <p className="text-muted-foreground text-xs">
            {recording ? t.tap_stop_recording : t.tap_to_record}
          </p>
        </div>
      </div>
    </div>
  );
}
