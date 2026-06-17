import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const FALLBACK_KEY_HEX = "0".repeat(63) + "f";

// 빌드 타임 모듈 평가 시 throw를 피하기 위해 lazy resolve
function resolveKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[crypto] ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. Railway 환경변수에 64자리 hex 키를 추가하세요."
      );
    }
    console.warn("[crypto] ENCRYPTION_KEY 미설정 — 개발용 약키 사용 중. 운영 배포 전 반드시 설정하세요.");
  }
  const keyHex = envKey ?? FALLBACK_KEY_HEX;
  return Buffer.from(keyHex.padEnd(64, "0").slice(0, 64), "hex");
}

export function encryptApiKey(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptApiKey(stored: string): string {
  const key = resolveKey();
  const [ivHex, tagHex, encHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// 암호화 실패(예: 운영 환경 ENCRYPTION_KEY 미설정)를 throw 대신 결과로 돌려준다.
// 서버 액션이 이 결과를 {ok:false,error}로 전달하면 폼이 버튼이 죽은 듯 보이는 대신 원인을 표시한다.
export function tryEncryptApiKey(
  plaintext: string
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: encryptApiKey(plaintext) };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const error = raw.includes("ENCRYPTION_KEY")
      ? "서버 암호화 키(ENCRYPTION_KEY)가 설정되지 않아 저장할 수 없습니다. 관리자에게 문의하세요."
      : "키 암호화에 실패했습니다.";
    return { ok: false, error };
  }
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "sk-****";
  return `${apiKey.slice(0, 7)}****${apiKey.slice(-4)}`;
}
