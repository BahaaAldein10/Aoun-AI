"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupFormValues } from "@/lib/schemas/dashboard";
import { Loader2, Mic, Play, Square, Volume2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Controller, type Control } from "react-hook-form";
import toast from "react-hot-toast";

/**
 * Note: availableVoices uses keys for gender & description so they can be localized.
 * Each entry provides default English fallback strings too.
 */
export const availableVoices = [
  {
    name: "alloy",
    genderKey: "gender_neutral",
    genderDefault: "Neutral",
    descKey: "voice_desc_alloy",
    descDefault: "Clear and balanced",
  },
  {
    name: "echo",
    genderKey: "gender_male",
    genderDefault: "Male",
    descKey: "voice_desc_echo",
    descDefault: "Deep and resonant",
  },
  {
    name: "fable",
    genderKey: "gender_male",
    genderDefault: "Male",
    descKey: "voice_desc_fable",
    descDefault: "Expressive and warm",
  },
  {
    name: "onyx",
    genderKey: "gender_male",
    genderDefault: "Male",
    descKey: "voice_desc_onyx",
    descDefault: "Rich and smooth",
  },
  {
    name: "nova",
    genderKey: "gender_female",
    genderDefault: "Female",
    descKey: "voice_desc_nova",
    descDefault: "Bright and clear",
  },
  {
    name: "shimmer",
    genderKey: "gender_female",
    genderDefault: "Female",
    descKey: "voice_desc_shimmer",
    descDefault: "Soft and gentle",
  },
] as const;

interface VoiceIntegrationTabProps {
  control: Control<SetupFormValues>;
  dir?: "ltr" | "rtl";
  t?: Record<string, string>; // translator dictionary (passed from parent)
}

const VoiceIntegrationTab: React.FC<VoiceIntegrationTabProps> = ({
  control,
  dir = "ltr",
  t,
}) => {
  // Recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [response, setResponse] = useState<string>("");

  // Voice testing
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedAudio) {
        try {
          URL.revokeObjectURL(recordedAudio);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        const audioUrl = URL.createObjectURL(blob);
        setRecordedAudio(audioUrl);

        // Stop tracks to free microphone
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      toast.success(t?.recording_started ?? "Recording started. Speak now...");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error(
        t?.recording_error_permissions ??
          "Could not access microphone. Please check permissions.",
      );
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success(t?.recording_stopped ?? "Recording stopped");
    }
  };

  // Process recorded audio with voice API
  const processAudio = async () => {
    if (!audioBlob) {
      toast.error(t?.no_audio_recorded ?? "No audio recorded");
      return;
    }

    setIsProcessing(true);
    setTranscript("");
    setResponse("");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const resp = await fetch("/api/voice", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            t?.voice_process_failed ||
            "Failed to process audio",
        );
      }

      const data = await resp.json();

      setTranscript(data.transcript || "");
      setResponse(data.reply || "");

      // If TTS audio is returned, play it
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play().catch(console.error);
      }

      toast.success(
        t?.voice_processed_success ?? "Voice processed successfully!",
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error processing audio:", error);
      toast.error(
        (errorMessage || t?.voice_process_failed) ?? "Failed to process audio",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Test selected voice with sample text
  const testVoice = async (selectedVoice?: string) => {
    if (isTestingVoice) return;

    setIsTestingVoice(true);

    // Prefer translated sample if available
    const testText =
      t?.voice_test_sample ??
      "Hello, I'm your AI assistant. I can help answer your questions and provide support.";

    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: testText,
          voice: selectedVoice || "alloy",
        }),
      });

      if (!resp.ok) {
        throw new Error(
          t?.voice_test_failed ?? "Failed to generate test audio",
        );
      }

      const data = await resp.json();

      if (data.audioUrl) {
        setTestAudioUrl(data.audioUrl);

        if (testAudioRef.current) {
          testAudioRef.current.src = data.audioUrl;
          await testAudioRef.current.play().catch(console.error);
        } else {
          // fallback play
          const a = new Audio(data.audioUrl);
          a.play().catch(console.error);
        }

        toast.success(t?.voice_test_played ?? "Voice test played!");
      }
    } catch (error) {
      console.error("Error testing voice:", error);
      toast.error(t?.voice_test_failed ?? "Failed to test voice");
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Clear recording
  const clearRecording = () => {
    if (recordedAudio) {
      try {
        URL.revokeObjectURL(recordedAudio);
      } catch {}
    }
    setRecordedAudio(null);
    setAudioBlob(null);
    setTranscript("");
    setResponse("");
    if (audioRef.current) {
      audioRef.current.src = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Voice Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="text-primary" />
            {t?.voice_selection_title ?? "Voice Selection"}
          </CardTitle>
          <CardDescription>
            {t?.voice_selection_desc ??
              "Choose the voice for your AI assistant"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="voice"
            render={() => (
              <FormItem>
                <FormLabel>{t?.bot_voice ?? "Bot Voice"}</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Controller
                      control={control}
                      name="voice"
                      render={({ field: cField }) => (
                        <Select
                          value={cField.value}
                          onValueChange={(value) => cField.onChange(value)}
                          dir={dir}
                        >
                          <SelectTrigger className="min-w-[200px] cursor-pointer">
                            <SelectValue
                              placeholder={
                                t?.bot_voice_placeholder ?? "Select a voice"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableVoices.map((v) => (
                              <SelectItem key={v.name} value={v.name}>
                                <div className="flex flex-col items-start">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {v.name}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      ({t?.[v.genderKey] ?? v.genderDefault})
                                    </span>
                                  </div>
                                  <span className="text-muted-foreground text-xs">
                                    {t?.[v.descKey] ?? v.descDefault}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FormControl>

                  <Controller
                    control={control}
                    name="voice"
                    render={({ field: cField }) => (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => testVoice(cField.value)}
                        disabled={isTestingVoice}
                      >
                        {isTestingVoice ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hidden audio element for voice testing */}
          <audio ref={testAudioRef} style={{ display: "none" }} />
        </CardContent>
      </Card>

      {/* Voice Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="text-primary" />
            {t?.voice_testing_title ?? "Voice Testing"}
          </CardTitle>
          <CardDescription>
            {t?.voice_testing_desc ??
              "Test the voice interaction by recording a message"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recording Controls */}
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <Button
                type="button"
                onClick={startRecording}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                <Mic className="h-4 w-4" />
                {t?.start_recording ?? "Start Recording"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={stopRecording}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                {t?.stop_recording ?? "Stop Recording"}
              </Button>
            )}

            {recordedAudio && (
              <>
                <Button
                  type="button"
                  onClick={processAudio}
                  disabled={isProcessing}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t?.processing ?? "Processing..."}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      {t?.process_audio ?? "Process Audio"}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={clearRecording}
                  variant="outline"
                >
                  {t?.clear ?? "Clear"}
                </Button>
              </>
            )}
          </div>

          {/* Recording Status */}
          {isRecording && (
            <div className="flex items-center gap-2 text-red-600">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
              <span>
                {t?.recording_status ?? "Recording... Click Stop when done"}
              </span>
            </div>
          )}

          {/* Audio Playback */}
          {recordedAudio && (
            <div>
              <label className="text-sm font-medium">
                {t?.recorded_audio_label ?? "Recorded Audio:"}
              </label>
              <audio
                ref={audioRef}
                src={recordedAudio}
                controls
                className="mt-2 w-full"
              />
            </div>
          )}

          {/* Processing Results */}
          {(transcript || response) && (
            <div className="bg-muted/50 space-y-4 rounded-lg border p-4">
              {transcript && (
                <div>
                  <label className="text-sm font-medium text-blue-600">
                    {t?.transcript_label ?? "Transcript (What you said):"}
                  </label>
                  <p className="mt-1 rounded bg-blue-50 p-2 text-sm">
                    {transcript}
                  </p>
                </div>
              )}

              {response && (
                <div>
                  <label className="text-sm font-medium text-green-600">
                    {t?.ai_response_label ?? "AI Response:"}
                  </label>
                  <p className="mt-1 rounded bg-green-50 p-2 text-sm">
                    {response}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="text-muted-foreground space-y-2 text-sm">
            <p>
              <strong>{t?.how_to_test_title ?? "How to test:"}</strong>
            </p>
            <ol className="ml-4 list-inside list-decimal space-y-1">
              <li>
                {t?.how_to_test_step1 ??
                  'Click "Start Recording" and speak a question'}
              </li>
              <li>
                {t?.how_to_test_step2 ?? 'Click "Stop Recording" when finished'}
              </li>
              <li>
                {t?.how_to_test_step3 ??
                  'Click "Process Audio" to test STT + AI response + TTS'}
              </li>
              <li>
                {t?.how_to_test_step4 ??
                  "The system will transcribe, generate a response, and speak it back"}
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceIntegrationTab;
