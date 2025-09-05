// public/widget.js - With API key support
(function () {
  const script = document.currentScript;
  const kbId = script?.getAttribute("data-kb-id");
  const apiKey = script?.getAttribute("data-api-key"); // Optional API key

  if (!kbId) {
    console.error("Widget: missing data-kb-id attribute");
    return;
  }

  const origin = window.location.origin;
  const widgetContainerId = "aoun-chat-widget";
  const hostContainer = document.getElementById(widgetContainerId);
  const container = hostContainer || document.body;

  // create iframe
  const widgetHost = "https://aoun-ai.vercel.app";
  const iframe = document.createElement("iframe");
  iframe.src = `${widgetHost}/widget/frame?kbid=${encodeURIComponent(kbId)}`;
  iframe.allow = "clipboard-read; clipboard-write; microphone; autoplay";
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups";

  iframe.id = "aoun-chat-iframe";
  iframe.className = "aoun-chat-iframe";
  iframe.style.cssText = `
    pointer-events: auto !important;
    border: 0 !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important;
    border-radius: 16px !important;
    transition: all 220ms ease !important;
    width: 380px;
    height: 560px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 96px);
    box-sizing: border-box !important;
    background: transparent !important;
  `;

  container.appendChild(iframe);

  // Token management state
  let currentToken = null;
  let tokenExpiry = null;
  let refreshTimer = null;
  let authMethod = null;

  function clearTokenTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleTokenRefresh(expires_in) {
    clearTokenTimer();
    if (!expires_in) return;

    const refreshBuffer = Math.min(30, Math.floor(expires_in * 0.1));
    const refreshDelay = Math.max(1000, (expires_in - refreshBuffer) * 1000);

    console.log(`Widget: scheduling token refresh in ${refreshDelay}ms`);

    refreshTimer = setTimeout(async () => {
      console.log("Widget: auto-refreshing token");
      await requestToken(true);
    }, refreshDelay);
  }

  // Request token from backend
  async function requestToken(isRefresh = false) {
    const action = isRefresh ? "refresh" : "initial";
    console.log(`Widget: requesting ${action} token for kbId:`, kbId);

    try {
      const headers = {
        "Content-Type": "application/json",
        Origin: origin,
      };

      // Add API key if provided
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
        console.log("Widget: using API key authentication");
      }

      const resp = await fetch(`${widgetHost}/api/widget/session`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ kbId }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(
          `Widget: ${action} token request failed:`,
          resp.status,
          errorText,
        );

        if (resp.status === 403) {
          if (apiKey) {
            console.error("Widget: Invalid API key or API key not configured");
          } else {
            console.error(
              "Widget: Origin not allowed. Check your knowledge base settings or use an API key",
            );
          }
        } else if (resp.status === 401) {
          console.error("Widget: Authentication failed");
        }
        return false;
      }

      const data = await resp.json();
      const token = data?.token;
      const expires_in = data?.expires_in ?? null;
      const metadata = data?.metadata ?? null;
      authMethod = data?.auth_method || "unknown";

      if (!token) {
        console.error("Widget: no token returned in response");
        return false;
      }

      console.log(
        `Widget: received ${action} token via ${authMethod}, expires in ${expires_in}s`,
      );

      currentToken = token;
      tokenExpiry = expires_in ? Date.now() + expires_in * 1000 : null;

      // Send token to iframe
      const payload = {
        type: isRefresh ? "AOUN_WIDGET_TOKEN_REFRESH" : "AOUN_WIDGET_INIT",
        token,
        origin,
        kbId,
        expires_in,
        metadata,
        auth_method: authMethod,
      };

      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(payload, new URL(iframe.src).origin);
      } else {
        iframe.addEventListener("load", () => {
          iframe.contentWindow.postMessage(payload, new URL(iframe.src).origin);
        });
      }

      if (expires_in) {
        scheduleTokenRefresh(expires_in);
      }

      return true;
    } catch (err) {
      console.error(`Widget: ${action} token request error:`, err);
      return false;
    }
  }

  // Handle messages from iframe
  window.addEventListener("message", async (ev) => {
    const data = ev.data || {};

    if (data?.type === "AOUN_WIDGET_TOKEN_EXPIRED" && data.kbId === kbId) {
      console.log("Widget: received token expiry message from iframe");
      await requestToken(true);
    }

    if (data?.type === "AOUN_WIDGET_READY" && data.kbId === kbId) {
      console.log("Widget: iframe is ready");
      if (currentToken) {
        const payload = {
          type: "AOUN_WIDGET_INIT",
          token: currentToken,
          origin,
          kbId,
          expires_in: tokenExpiry
            ? Math.floor((tokenExpiry - Date.now()) / 1000)
            : null,
          metadata: null,
          auth_method: authMethod,
        };
        iframe.contentWindow.postMessage(payload, new URL(iframe.src).origin);
      }
    }
  });

  // Initialize with retry logic
  async function initializeWidget() {
    let retries = 3;
    while (retries > 0) {
      const success = await requestToken();
      if (success) {
        console.log("Widget: successfully initialized");
        return;
      }

      retries--;
      if (retries > 0) {
        console.log(
          `Widget: initialization failed, retrying... (${retries} attempts left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.error("Widget: failed to initialize after multiple attempts");
  }

  // Start initialization when iframe loads
  iframe.addEventListener("load", () => {
    console.log("Widget: iframe loaded, initializing...");
    initializeWidget();
  });

  // Expose API for host page
  window.AOUN_WIDGET = Object.assign(window.AOUN_WIDGET || {}, {
    sendMessage(payload) {
      if (!iframe.contentWindow) {
        console.warn("Widget: iframe not ready for sendMessage");
        return;
      }
      iframe.contentWindow.postMessage(
        { type: "AOUN_WIDGET_MESSAGE", payload },
        new URL(iframe.src).origin,
      );
    },

    getTokenStatus() {
      return {
        hasToken: !!currentToken,
        authMethod,
        expiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
        expiresIn: tokenExpiry
          ? Math.floor((tokenExpiry - Date.now()) / 1000)
          : null,
      };
    },

    refreshToken() {
      return requestToken(true);
    },

    // Debug function to check widget health
    getHealthStatus() {
      return {
        kbId,
        hasApiKey: !!apiKey,
        authMethod,
        tokenStatus: {
          hasToken: !!currentToken,
          expiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
          expiresIn: tokenExpiry
            ? Math.floor((tokenExpiry - Date.now()) / 1000)
            : null,
          isExpired: tokenExpiry ? Date.now() > tokenExpiry : null,
        },
        iframe: {
          loaded: iframe.contentWindow !== null,
          src: iframe.src,
        },
      };
    },
  });

  // Clean up on unload
  window.addEventListener("unload", () => {
    clearTokenTimer();
    try {
      container.removeChild(iframe);
    } catch {}
  });
})();
