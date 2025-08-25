import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

// key must be 32 bytes (store in env, base64)
export function encrypt(text: string, keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(ciphertextBase64: string, keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64");
  const b = Buffer.from(ciphertextBase64, "base64");
  const iv = b.slice(0, IV_LEN);
  const tag = b.slice(IV_LEN, IV_LEN + TAG_LEN);
  const enc = b.slice(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString("utf8");
}
