import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const FALLBACK_KEY_HEX = "0".repeat(63) + "f";
const envKey = process.env.ENCRYPTION_KEY;

if (!envKey) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[crypto] ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. Railway 환경변수에 64자리 hex 키를 추가하세요."
    );
  } else {
    console.warn("[crypto] ENCRYPTION_KEY 미설정 — 개발용 약키 사용 중. 운영 배포 전 반드시 설정하세요.");
  }
}

const KEY_HEX = envKey ?? FALLBACK_KEY_HEX;
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
