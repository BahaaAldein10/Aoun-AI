// public/widget.js  (vanilla JS, serve statically)
(function () {
  const script = document.currentScript;
  const kbId = script?.getAttribute("data-kb-id");
  if (!kbId) {
    console.error("Widget: missing data-kb-id attribute");
    return;
  }

  const origin = window.location.origin;
  // Prefer a host-provided container if present; otherwise fall back to document.body.
  // IMPORTANT: do NOT overwrite host layout. Host pages should decide where the widget appears.
  const widgetContainerId = "aoun-chat-widget";
  const hostContainer = document.getElementById(widgetContainerId);
  const container = hostContainer || document.body;

  // create iframe (expanded UI only; floating button removed)
  const widgetHost = "https://aoun-ai.vercel.app";
  const iframe = document.createElement("iframe");
  iframe.src = `${widgetHost}/widget/frame?kbid=${encodeURIComponent(kbId)}`;
  iframe.allow = "clipboard-read; clipboard-write; microphone; autoplay";
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups";

  // Minimal iframe defaults — do NOT force position/placement.
  // Host pages may style #aoun-chat-widget or .aoun-chat-iframe to control placement/size.
  iframe.id = "aoun-chat-iframe";
  iframe.className = "aoun-chat-iframe";
  iframe.style.cssText = `
  pointer-events: auto !important;
  border: 0 !important;
  box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important;
  border-radius: 16px !important;
  transition: all 220ms ease !important;
  width: 380px;
  height: 560px; /* <- iframe controls widget height */
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 96px);
  box-sizing: border-box !important;
  background: transparent !important;
`;

  container.appendChild(iframe);

  // handshake: request session token from your backend then postMessage it into iframe
  async function requestToken() {
    try {
      const resp = await fetch(`${widgetHost}/api/widget/session`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId }),
      });

      if (!resp.ok) {
        console.error(
          "Widget: session token request failed",
          await resp.text(),
        );
        return;
      }

      const data = await resp.json();
      const token = data?.token;
      const expires_in = data?.expires_in ?? null;
      const metadata = data?.metadata ?? null; // KB metadata from backend

      if (!token) {
        console.error("Widget: no token returned");
        return;
      }

      // send token + host origin + expires + metadata to iframe
      const payload = {
        type: "AOUN_WIDGET_INIT",
        token,
        origin,
        kbId,
        expires_in,
        metadata,
      };
      iframe.contentWindow.postMessage(payload, new URL(iframe.src).origin);
    } catch (err) {
      console.error("Widget: token request error", err);
    }
  }

  // initial token request
  requestToken();

  // handle refresh messages from iframe: iframe will post AOUN_WIDGET_TOKEN_EXPIRED when token is near expiry
  window.addEventListener("message", async (ev) => {
    const data = ev.data || {};
    // only respond to token-expiry messages for this kb
    if (data?.type === "AOUN_WIDGET_TOKEN_EXPIRED" && data.kbId === kbId) {
      try {
        const resp = await fetch(`${widgetHost}/api/widget/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kbId }),
        });
        if (!resp.ok) {
          console.error(
            "Widget: failed to refresh session token",
            await resp.text(),
          );
          return;
        }
        const json = await resp.json();
        const token = json?.token;
        const expires_in = json?.expires_in ?? null;
        const metadata = json?.metadata ?? null;

        if (token) {
          iframe.contentWindow.postMessage(
            {
              type: "AOUN_WIDGET_TOKEN_REFRESH",
              token,
              kbId,
              expires_in,
              metadata,
            },
            new URL(iframe.src).origin,
          );
        }
      } catch (err) {
        console.error("Widget: token refresh error", err);
      }
    }
  });

  // Expose light API for host page (no open/close since floating button is removed)
  window.AOUN_WIDGET = Object.assign(window.AOUN_WIDGET || {}, {
    sendMessage(payload) {
      iframe.contentWindow.postMessage(
        { type: "AOUN_WIDGET_MESSAGE", payload },
        new URL(iframe.src).origin,
      );
    },
  });

  // Clean up on unload
  window.addEventListener("unload", () => {
    try {
      container.removeChild(iframe);
    } catch {}
  });
})();
