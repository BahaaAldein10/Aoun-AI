// app/api/realtime-call/route.ts
import { IncomingMessage } from "http";
import { NextRequest } from "next/server";
import { WebSocket, WebSocketServer } from "ws";

// Types for WebSocket messages
interface WebSocketMessage {
  type:
    | "init"
    | "audio"
    | "transcript"
    | "response"
    | "error"
    | "ping"
    | "pong";
  kbId?: string;
  sessionToken?: string;
  conversationId?: string;
  voiceName?: string;
  language?: string;
  data?: string;
  text?: string;
  audio?: string;
  message?: string;
}

interface ClientConnection {
  ws: WebSocket;
  kbId: string;
  sessionToken?: string;
  conversationId?: string;
  voiceName: string;
  language: string;
  lastActivity: number;
  audioBuffer: Buffer[];
  transcriptionInProgress: boolean;
  silenceTimer?: NodeJS.Timeout;
}

// Global WebSocket server instance
let wss: WebSocketServer | null = null;
const connections = new Map<WebSocket, ClientConnection>();

// Initialize WebSocket server for App Router
function getWebSocketServer(): WebSocketServer {
  if (wss) return wss;

  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 1024 * 1024, // 1MB max payload
  });

  wss.on("connection", handleConnection);

  // Cleanup inactive connections every 30 seconds
  setInterval(cleanupConnections, 30000);

  console.log("WebSocket server initialized for App Router");
  return wss;
}

function handleConnection(ws: WebSocket, request: IncomingMessage) {
  console.log("New WebSocket connection established");

  ws.on("message", async (data: Buffer) => {
    await handleMessage(ws, data);
  });

  ws.on("close", () => {
    handleDisconnection(ws);
  });

  ws.on("error", (error: Error) => {
    console.error("WebSocket error:", error);
    handleDisconnection(ws);
  });

  // Send ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
}

async function handleMessage(ws: WebSocket, data: Buffer) {
  try {
    const message: WebSocketMessage = JSON.parse(data.toString());
    const connection = connections.get(ws);

    switch (message.type) {
      case "init":
        await handleInit(ws, message);
        break;

      case "audio":
        if (connection) {
          await handleAudioData(ws, connection, message);
        }
        break;

      case "pong":
        if (connection) {
          connection.lastActivity = Date.now();
        }
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    sendError(ws, "Failed to process message");
  }
}

async function handleInit(ws: WebSocket, message: WebSocketMessage) {
  const { kbId, sessionToken, conversationId, voiceName, language } = message;

  if (!kbId) {
    sendError(ws, "Missing kbId");
    return;
  }

  // Verify session token if provided
  if (sessionToken && !(await verifySessionToken(sessionToken, kbId))) {
    sendError(ws, "Invalid session token");
    return;
  }

  const connection: ClientConnection = {
    ws,
    kbId,
    sessionToken,
    conversationId: conversationId,
    voiceName: voiceName || "alloy",
    language: language || "en",
    lastActivity: Date.now(),
    audioBuffer: [],
    transcriptionInProgress: false,
  };

  connections.set(ws, connection);

  console.log(
    `Client initialized: kbId=${kbId}, voice=${voiceName}, lang=${language}`,
  );

  // Send confirmation
  ws.send(
    JSON.stringify({
      type: "init",
      message: "Connection initialized successfully",
    }),
  );
}

async function handleAudioData(
  ws: WebSocket,
  connection: ClientConnection,
  message: WebSocketMessage,
) {
  if (!message.data) return;

  try {
    // Convert base64 audio data to buffer
    const base64Data = message.data.includes(",")
      ? message.data.split(",")[1]
      : message.data;
    const audioData = Buffer.from(base64Data, "base64");

    connection.audioBuffer.push(audioData);
    connection.lastActivity = Date.now();

    // Clear existing silence timer
    if (connection.silenceTimer) {
      clearTimeout(connection.silenceTimer);
      connection.silenceTimer = undefined;
    }

    // Set new silence timer - process audio after 1.5 seconds of silence
    connection.silenceTimer = setTimeout(async () => {
      if (
        connection.audioBuffer.length > 0 &&
        !connection.transcriptionInProgress
      ) {
        await processAudioBuffer(ws, connection);
      }
    }, 1500);

    // Also process if buffer gets too large (prevent memory issues)
    const totalSize = connection.audioBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0,
    );
    if (totalSize > 128000 && !connection.transcriptionInProgress) {
      // ~8 seconds at 16kHz
      await processAudioBuffer(ws, connection);
    }
  } catch (error) {
    console.error("Error processing audio data:", error);
    sendError(ws, "Failed to process audio");
  }
}

async function processAudioBuffer(ws: WebSocket, connection: ClientConnection) {
  if (connection.audioBuffer.length === 0 || connection.transcriptionInProgress)
    return;

  // Clear silence timer
  if (connection.silenceTimer) {
    clearTimeout(connection.silenceTimer);
    connection.silenceTimer = undefined;
  }

  connection.transcriptionInProgress = true;
  const audioData = Buffer.concat(connection.audioBuffer);
  connection.audioBuffer = [];

  try {
    // Skip if audio is too short (less than 0.5 seconds)
    if (audioData.length < 8000) {
      return;
    }

    // 1. Transcribe audio using OpenAI Whisper
    const transcript = await transcribeAudio(audioData);

    if (transcript.trim().length > 0) {
      // Send transcript to client
      ws.send(
        JSON.stringify({
          type: "transcript",
          text: transcript,
        }),
      );

      // 2. Generate AI response
      const response = await generateResponse(
        transcript,
        connection.kbId,
        connection.conversationId as string,
        connection.sessionToken,
      );

      if (response.text) {
        // 3. Generate speech audio
        const audioUrl = await generateSpeech(
          response.text,
          connection.voiceName,
        );

        // Send response to client
        ws.send(
          JSON.stringify({
            type: "response",
            text: response.text,
            audio: audioUrl,
          }),
        );

        // Update conversation ID if new
        if (response.conversationId && !connection.conversationId) {
          connection.conversationId = response.conversationId;
        }
      }
    }
  } catch (error) {
    console.error("Error processing audio buffer:", error);
    sendError(ws, "Failed to process voice message");
  } finally {
    connection.transcriptionInProgress = false;
  }
}

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const formData = new FormData();
    const audioBlob = new Blob([Buffer.from(audioBuffer)], {
      type: "audio/webm",
    });
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "auto");
    formData.append("response_format", "text");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `OpenAI Whisper API error: ${response.status} - ${errorText}`,
      );
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.text();
    return result.trim();
  } catch (error) {
    console.error("Transcription error:", error);
    return "";
  }
}

async function generateResponse(
  transcript: string,
  kbId: string,
  conversationId: string | null,
  sessionToken?: string,
): Promise<{ text: string; conversationId?: string }> {
  try {
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.VERCEL_URL ||
      "http://localhost:3000";
    const apiUrl = `${baseUrl}/api/chat`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken && { Authorization: `Bearer ${sessionToken}` }),
      },
      body: JSON.stringify({
        kbId,
        message: transcript,
        conversationId,
        history: [], // Could maintain conversation history here if needed
        isRealtime: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Chat API error: ${response.status} - ${errorText}`);
      throw new Error(`Chat API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      text:
        data.text ||
        data.reply ||
        "I apologize, but I couldn't generate a response.",
      conversationId: data.conversationId,
    };
  } catch (error) {
    console.error("Response generation error:", error);
    return {
      text: "I apologize, but I encountered an error processing your message.",
    };
  }
}

async function generateSpeech(text: string, voice: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OpenAI API key not configured for TTS");
    return "";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: voice,
        input: text.slice(0, 4096), // TTS has input limits
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI TTS error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error("Speech generation error:", error);
    return "";
  }
}

async function verifySessionToken(
  token: string,
  kbId: string,
): Promise<boolean> {
  try {
    // You should implement your actual token verification logic here
    // This could involve JWT verification, database lookup, etc.
    // For now, we'll assume tokens are valid if they exist
    return Boolean(token && kbId);
  } catch (error) {
    console.error("Token verification error:", error);
    return false;
  }
}

function sendError(ws: WebSocket, message: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "error",
        message,
      }),
    );
  }
}

function handleDisconnection(ws: WebSocket) {
  const connection = connections.get(ws);
  if (connection) {
    console.log(`Client disconnected: kbId=${connection.kbId}`);

    // Clean up timers
    if (connection.silenceTimer) {
      clearTimeout(connection.silenceTimer);
    }

    connections.delete(ws);
  }
}

function cleanupConnections() {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [ws, connection] of connections) {
    if (now - connection.lastActivity > timeout) {
      console.log(`Cleaning up inactive connection: kbId=${connection.kbId}`);
      if (connection.silenceTimer) {
        clearTimeout(connection.silenceTimer);
      }
      ws.terminate();
      connections.delete(ws);
    }
  }
}

// App Router WebSocket handling
export async function GET(request: NextRequest) {
  // Check if this is a WebSocket upgrade request
  const upgrade = request.headers.get("upgrade");

  if (upgrade !== "websocket") {
    return new Response("This endpoint requires WebSocket upgrade", {
      status: 426,
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });
  }

  return new Response("WebSocket endpoint ready", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

// Handle WebSocket upgrade in server configuration
// You'll need to add this to your next.config.js or server setup
export const runtime = "nodejs";

// Export WebSocket handler for custom server setup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleWebSocketUpgrade(request: any, socket: any, head: any) {
  const wss = getWebSocketServer();

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
}
