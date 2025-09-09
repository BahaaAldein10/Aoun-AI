// lib/sendbrevo.ts
const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

const API_KEY = process.env.BREVO_API_KEY!;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL!;
const SENDER_NAME = process.env.BREVO_SENDER_NAME!;

if (!API_KEY || !SENDER_EMAIL) {
  console.warn("Brevo env vars missing: BREVO_API_KEY / BREVO_SENDER_EMAIL");
}

export async function sendTransactionalEmail(
  to: { email: string; name?: string },
  subject: string,
  html: string,
) {
  if (!API_KEY) throw new Error("Missing BREVO_API_KEY");
  if (!SENDER_EMAIL) throw new Error("Missing BREVO_SENDER_EMAIL");

  const payload = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: to.email, name: to.name ?? "" }],
    subject,
    // Brevo expects htmlContent when sending raw HTML (see docs).
    htmlContent: html,
    // optionally add textContent, headers, replyTo, tags, etc.
  };

  const res = await fetch(BREVO_SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "api-key": API_KEY, // Brevo expects header 'api-key'
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    // include Brevo's error object in thrown error — helps debugging in Vercel logs
    const details = JSON.stringify(json ?? text);
    throw new Error(`Brevo send email failed: ${res.status} ${details}`);
  }

  return json;
}
