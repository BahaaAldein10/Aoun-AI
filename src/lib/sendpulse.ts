const TOKEN_URL = "https://api.sendpulse.com/oauth/access_token";
const SEND_EMAIL_URL = "https://api.sendpulse.com/smtp/emails";

const CLIENT_ID = process.env.SENDPULSE_CLIENT_ID!;
const CLIENT_SECRET = process.env.SENDPULSE_CLIENT_SECRET!;
const SENDER_EMAIL = process.env.SENDPULSE_SENDER_EMAIL!;
const SENDER_NAME = process.env.SENDPULSE_SENDER_NAME ?? "Notifications";

if (!CLIENT_ID || !CLIENT_SECRET || !SENDER_EMAIL) {
  console.warn(
    "SendPulse env vars missing: SENDPULSE_CLIENT_ID/SECRET/SENDER_EMAIL",
  );
}

// simple in-memory token cache (valid for single-process; use Redis for multi-instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendPulse token request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const accessToken = json.access_token;
  const expiresIn = json.expires_in ?? 3600;

  if (!accessToken) throw new Error("SendPulse returned no access_token");

  cachedToken = {
    token: accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

/**
 * sendTransactionalEmail
 * - to: { email, name? }
 * - subject: string
 * - html: string
 * - variables: optional object for template (if using templates replace `html` usage below)
 */
export async function sendTransactionalEmail(
  to: { email: string; name?: string },
  subject: string,
  html: string,
) {
  const token = await getAccessToken();

  const payload = {
    email: {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: to.email, name: to.name ?? "" }],
      subject,
      html,
      // you can also set text, attachments, track_read etc.
    },
  };

  const res = await fetch(SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendPulse send email failed: ${res.status} ${text}`);
  }

  return await res.json();
}
