// app/widget/frame/page.tsx
"use client";

import { useEffect } from "react";

export default function WidgetFrame() {
  useEffect(() => {
    let sessionToken: string | null = null;
    let kbId: string | null = null;
    let parentOrigin: string | null = null;

    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("input") as HTMLInputElement;
    const sendBtn = document.getElementById("send");

    function appendMessage(role: string, text: string) {
      if (!messagesEl) return;
      const el = document.createElement("div");
      el.textContent = (role === "user" ? "You: " : "Bot: ") + text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Listen for parent → iframe messages
    window.addEventListener("message", async (ev) => {
      const data = ev.data || {};

      if (data?.type === "AOUN_WIDGET_INIT" && typeof data.token === "string") {
        // Validate origin
        if (data.origin && ev.origin !== data.origin) {
          console.warn("Origin mismatch in postMessage, ignoring.");
          return;
        }

        parentOrigin = ev.origin;
        sessionToken = data.token;
        kbId = data.kbId;

        appendMessage("bot", "Widget initialized.");
      }
    });

    async function sendMessage(text: string) {
      if (!sessionToken) {
        appendMessage("bot", "Not connected yet. Please wait.");
        return;
      }
      appendMessage("user", text);
      if (inputEl) inputEl.value = "";

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + sessionToken,
          },
          body: JSON.stringify({ kbId, message: text }),
        });

        if (resp.status === 401) {
          // Token expired → request refresh from parent
          if (parentOrigin && kbId) {
            window.parent.postMessage(
              { type: "AOUN_WIDGET_REQ_REFRESH", kbId },
              parentOrigin,
            );
          }
          appendMessage("bot", "Refreshing session, please wait...");
          return;
        }

        const json = await resp.json();
        if (json?.text) appendMessage("bot", json.text);
        else appendMessage("bot", "No response.");
      } catch (err) {
        appendMessage("bot", "Network error");
        console.error(err);
      }
    }

    sendBtn?.addEventListener("click", () => {
      const v = inputEl?.value.trim();
      if (!v) return;
      sendMessage(v!);
    });

    inputEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendBtn?.click();
    });

    inputEl?.focus();
  }, []);

  return (
    <div
      style={{ padding: "12px", fontFamily: "Inter,system-ui,Helvetica,Arial" }}
    >
      <div
        id="app"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          gap: "8px",
        }}
      >
        <div id="title">
          <strong>Assistant</strong>
        </div>
        <div
          id="messages"
          role="log"
          aria-live="polite"
          style={{
            flex: 1,
            overflow: "auto",
            padding: "8px",
            borderRadius: "6px",
            background: "#fafafa",
            border: "1px solid #eee",
          }}
        ></div>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input
            id="input"
            type="text"
            placeholder="Ask a question..."
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #ddd",
            }}
          />
          <button
            id="send"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: "#0ea5e9",
              color: "white",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
