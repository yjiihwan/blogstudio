import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_HEX = process.env.ENCRYPTION_KEY ?? "0".repeat(63) + "f";
const key = Buffer.from(KEY_HEX.padEnd(64, "0").slice(0, 64), "hex");

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptApiKey(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "sk-****";
  return `${apiKey.slice(0, 7)}****${apiKey.slice(-4)}`;
}
