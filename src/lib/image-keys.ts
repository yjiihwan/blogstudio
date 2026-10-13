import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "./crypto";
import {
  IMAGE_SOURCE_CONFIG_SETTING_KEY,
  normalizeImageSourceConfig,
  type ImageSourceConfig,
} from "./image-source-config";

export type ImageKeySet = {
  unsplash: string | null;
  pexels: string | null;
  googleAi: string | null;
};

export type ImageSourceResolution = {
  mode: "system" | "user_key";
  keys: ImageKeySet;
  /** AI 생성 폴백(gpt-image-1)·심사(비전)에 쓰는 OpenAI 키 — 글 생성용 키 공용 */
  openai: string | null;
  config: ImageSourceConfig;
};

const EMPTY_KEYS: ImageKeySet = { unsplash: null, pexels: null, googleAi: null };

export async function resolveImageKeys(userId: string): Promise<ImageKeySet> {
  return (await resolveImageSources(userId)).keys;
}

/** 키 + 사용여부/순서/검증 설정을 한 번에. 유저 키 모드면 유저 설정, 아니면 시스템 설정. */
export async function resolveImageSources(userId: string): Promise<ImageSourceResolution> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) {
    return { mode: "system", keys: EMPTY_KEYS, openai: null, config: normalizeImageSourceConfig(null) };
  }

  const mode = (user.imageApiKeyMode ?? "system") as "system" | "user_key";
  const openai = await resolveOpenAIKeyForUser(user);

  if (mode === "user_key") {
    return {
      mode,
      keys: {
        unsplash: user.unsplashKey ? tryDecrypt(user.unsplashKey) : null,
        pexels: user.pexelsKey ? tryDecrypt(user.pexelsKey) : null,
        googleAi: user.googleAiKey ? tryDecrypt(user.googleAiKey) : null,
      },
      openai,
      config: normalizeImageSourceConfig(user.imageSourceConfigJson),
    };
  }

  const [unsplash, pexels, googleAi, config] = await Promise.all([
    getSystemKey("unsplash_access_key"),
    getSystemKey("pexels_api_key"),
    getSystemKey("google_ai_api_key"),
    getSystemImageSourceConfig(),
  ]);
  return { mode, keys: { unsplash, pexels, googleAi }, openai, config };
}

export async function getSystemImageSourceConfig(): Promise<ImageSourceConfig> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, IMAGE_SOURCE_CONFIG_SETTING_KEY),
  });
  return normalizeImageSourceConfig(row?.valueJson ?? null);
}

/** 시스템/유저 OpenAI 키 (AI 생성 폴백·이미지 심사용). 글 생성 키와 동일한 우선순위. */
export async function resolveOpenAIKey(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return resolveOpenAIKeyForUser(user ?? null);
}

async function resolveOpenAIKeyForUser(
  user: { apiKeyMode?: string | null; openaiApiKey?: string | null } | null
): Promise<string | null> {
  if (user?.apiKeyMode === "user_key" && user.openaiApiKey) {
    const k = tryDecrypt(user.openaiApiKey);
    if (k) return k;
  }
  return getSystemKey("openai_api_key");
}

async function getSystemKey(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  if (!row) return null;
  try {
    const v = JSON.parse(row.valueJson) as string | null;
    return typeof v === "string" && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function tryDecrypt(enc: string): string | null {
  try { return decryptApiKey(enc); } catch { return null; }
}
