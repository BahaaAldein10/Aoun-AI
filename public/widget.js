// public/widget.js  (vanilla JS, serve statically)
(function () {
  const script = document.currentScript;
  const kbId = script?.getAttribute("data-kb-id");
  if (!kbId) {
    console.error("Widget: missing data-kb-id attribute");
    return;
  }

  const origin = window.location.origin;
  const widgetContainerId = "aoun-chat-widget";
  const container = document.getElementById(widgetContainerId);
  if (!container) {
    console.error(`Widget: container #${widgetContainerId} not found`);
    return;
  }

  // Optionally style container or create a button
  container.innerHTML = ""; // ensure empty

  // create iframe
  const iframe = document.createElement("iframe");
  iframe.src = `https://aoun-ai.vercel.app/widget/frame?kbid=${encodeURIComponent(kbId)}`; // no token in URL
  iframe.allow = "clipboard-read; clipboard-write; microphone; autoplay";
  iframe.style =
    "border:0; width:100%; height:400px; max-width:420px; box-shadow:0 6px 20px rgba(0,0,0,0.08); border-radius:8px;";
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups"; // restrict permissions
  container.appendChild(iframe);

  // handshake: request session token from your backend then postMessage it into iframe
  async function requestToken() {
    try {
      const resp = await fetch(
        "https://aoun-ai.vercel.app/api/widget/session",
        {
          method: "POST",
          credentials: "include", // optional, if you want cookie auth
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ kbId }),
        },
      );

      if (!resp.ok) {
        console.error(
          "Widget: session token request failed",
          await resp.text(),
        );
        return;
      }

      const data = await resp.json();
      const token = data?.token;
      if (!token) {
        console.error("Widget: no token returned");
        return;
      }

      // send token to iframe
      iframe.contentWindow.postMessage(
        { type: "AOUN_WIDGET_INIT", token, origin, kbId },
        "https://aoun-ai.vercel.app",
      );
    } catch (err) {
      console.error("Widget: token request error", err);
    }
  }

  // Retry strategy for token request
  requestToken();

  // Expose light API for host page
  window.AOUN_WIDGET = Object.assign(window.AOUN_WIDGET || {}, {
    open() {
      iframe.style.display = "block";
    },
    close() {
      iframe.style.display = "none";
    },
    // optionally allow parent to send messages to the widget
    sendMessage(payload) {
      iframe.contentWindow.postMessage(
        { type: "AOUN_WIDGET_MESSAGE", payload },
        "https://aoun-ai.vercel.app",
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
