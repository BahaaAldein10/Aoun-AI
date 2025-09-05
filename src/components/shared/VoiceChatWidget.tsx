"use client";

import { Button } from "@/components/ui/button";
import { useDictionary } from "@/contexts/dictionary-context";
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
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Input } from "../ui/input";
import Spinner from "./Spinner";

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
  lang?: string;
  onClose?: () => void;
  kbId?: string;
}

export default function VoiceChatWidget({
  lang = "en",
  onClose,
  kbId,
}: VoiceChatWidgetProps) {
  const dict = useDictionary();
  const t = dict.widget;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);

  const [mode, setMode] = useState<"text" | "voice">("text");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    const scrollElement = listRef.current;
    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
      const reply = data.text?.trim() || t.no_response_generated;

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
        text: t.error_processing_message,
        createdAt: new Date().toISOString(),
        isVoice: false,
      };
      pushMessage(errorMsg);
      toast.error(t.failed_send_message);
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
          voice: lang?.startsWith("ar") ? "nova" : "alloy",
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
      toast.error(t.failed_start_recording);
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
      toast.error(t.recording_empty);
      return;
    }

    if (blob.size < 1000) {
      toast.error(t.recording_too_short);
      return;
    }

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: t.processing_voice_message,
      createdAt: new Date().toISOString(),
      isVoice: true,
    };
    pushMessage(userMsg);

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");
    if (kbId) formData.append("kbId", kbId);
    if (conversationId) formData.append("conversationId", conversationId);

    setVoicePending(true);

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const transcript = data.text?.trim() || "";
      const reply = data.reply?.trim() || "";
      const audioUrl = data.audio || null;

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      updateMessage(userMsg.id, {
        text: transcript || t.voice_message_no_transcript,
      });

      const botMsg: Msg = {
        id: `b-${Date.now()}`,
        role: "bot",
        text: reply || t.no_response_generated,
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
        text: t.failed_process_voice_message,
      });

      const errorMsg: Msg = {
        id: `err-${Date.now()}`,
        role: "bot",
        text: t.voice_processing_error,
        createdAt: new Date().toISOString(),
        isVoice: true,
      };
      pushMessage(errorMsg);

      toast.error(t.voice_processing_failed);
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
    setConversationId(null);
    toast.success(t.messages_cleared);
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

  const isRtl = lang === "ar";
  const pending = isTyping || voicePending;

  return (
    <div className={cn("flex h-full flex-col", isRtl && "rtl")}>
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
            {mode === "voice" ? (
              <Mic className="h-5 w-5 text-white" />
            ) : (
              <MessageSquare className="h-5 w-5 text-white" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {mode === "voice" ? t.voice_assistant : t.chat_assistant}
            </h3>
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
          <div className="flex rounded-lg bg-gray-200 p-1 dark:bg-gray-700">
            <Button
              variant={mode === "text" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("text")}
              className="h-7 px-3 text-xs"
            >
              {t.mode_text}
            </Button>
            <Button
              variant={mode === "voice" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("voice")}
              className="h-7 px-3 text-xs"
              disabled={permission === false}
            >
              {t.mode_voice}
            </Button>
          </div>

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

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 ? (
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
                  ? t.start_voice_conversation
                  : t.start_conversation}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {mode === "voice"
                  ? t.start_conversation_description
                  : t.type_message_or_switch}
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
                    "relative rounded-2xl px-4 py-2 text-sm break-words",
                    msg.role === "user"
                      ? "rounded-br-md bg-blue-500 text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>

                  {msg.isVoice && (
                    <div className="absolute -top-2 -right-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-white">
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

      <div className="border-t bg-white p-4 dark:bg-gray-950">
        {mode === "text" ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                ref={textInputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder_type_message}
                disabled={pending}
              />
            </div>
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || pending || !kbId}
              title={t.send}
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
                    {t.microphone_access_denied}
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
          </>
        )}
      </div>
    </div>
  );
}
