"use server";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { decryptApiKey, maskApiKey, tryEncryptApiKey } from "@/lib/crypto";

const SETTINGS_ANTHROPIC_KEY = "anthropic_api_key";
const SETTINGS_OPENAI_KEY = "openai_api_key";
const UNSPLASH_KEY = "unsplash_access_key";
const PEXELS_KEY = "pexels_api_key";
const GOOGLE_AI_KEY = "google_ai_api_key";
const TELEGRAM_TOKEN_KEY = "telegram_bot_token";

function maskKey(key: string): string {
  if (key.length <= 12) return "sk-ant-****";
  return `${key.slice(0, 8)}****...${key.slice(-4)}`;
}

function maskShortKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****...${key.slice(-4)}`;
}

// ── Anthropic 시스템 키 (어드민) ─────────────────────────────────────────────

export async function getStoredApiKeyMasked(): Promise<string | null> {
  await requireUser();
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, SETTINGS_ANTHROPIC_KEY),
  });
  if (!row) return null;
  const key = JSON.parse(row.valueJson) as string;
  if (!key) return null;
  return maskKey(key);
}

export async function saveApiKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };

  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_ANTHROPIC_KEY, valueJson: JSON.stringify(key) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { valueJson: JSON.stringify(key), updatedAt: new Date().toISOString() },
    });

  revalidatePath("/settings");
  return { ok: true, masked: maskKey(key) };
}

async function resolveSystemApiKey(provider: "anthropic" | "openai"): Promise<string | null> {
  const settingsKey = provider === "anthropic" ? SETTINGS_ANTHROPIC_KEY : SETTINGS_OPENAI_KEY;
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, settingsKey),
  });
  if (row) {
    const key = JSON.parse(row.valueJson) as string;
    if (key) return key;
  }
  return provider === "anthropic"
    ? (process.env.ANTHROPIC_API_KEY ?? null)
    : (process.env.OPENAI_API_KEY ?? null);
}

export async function testApiKeyAction(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const key = await resolveSystemApiKey("anthropic");
  if (!key) return { ok: false, message: "저장된 API 키가 없습니다." };

  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, message: `연결됨 — ${response.model ?? "claude-haiku"}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("authentication_error")) {
      return { ok: false, message: "잘못된 API 키입니다." };
    }
    if (msg.includes("credit") || msg.includes("billing") || msg.includes("quota") || msg.includes("overloaded")) {
      return { ok: false, message: "크레딧 부족 또는 결제 오류입니다." };
    }
    return { ok: false, message: `연결 실패: ${msg.slice(0, 80)}` };
  }
}

// ── OpenAI 시스템 키 (어드민) ────────────────────────────────────────────────

export async function getStoredSystemOpenAIKeyMasked(): Promise<string | null> {
  await requireUser();
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, SETTINGS_OPENAI_KEY),
  });
  if (!row) return null;
  const key = JSON.parse(row.valueJson) as string;
  return key ? maskKey(key) : null;
}

export async function saveSystemOpenAIKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };

  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_OPENAI_KEY, valueJson: JSON.stringify(key) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { valueJson: JSON.stringify(key), updatedAt: new Date().toISOString() },
    });

  revalidatePath("/settings");
  return { ok: true, masked: maskKey(key) };
}

export async function testSystemOpenAIKeyAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const key = await resolveSystemApiKey("openai");
  if (!key) return { ok: false, message: "저장된 OpenAI API 키가 없습니다." };

  try {
    const client = new OpenAI({ apiKey: key });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
    });
    return { ok: true, message: `연결됨 — ${res.model}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("Incorrect API key")) {
      return { ok: false, message: "잘못된 API 키입니다." };
    }
    if (msg.includes("429") || msg.includes("quota") || msg.includes("billing")) {
      return { ok: false, message: "크레딧 부족 또는 결제 오류입니다." };
    }
    return { ok: false, message: `연결 실패: ${msg.slice(0, 80)}` };
  }
}

// ── 공통 설정 키 헬퍼 ─────────────────────────────────────────────────────────

async function getStoredKey(settingsKey: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, settingsKey),
  });
  if (!row) return null;
  return JSON.parse(row.valueJson) as string | null;
}

async function saveKey(settingsKey: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: settingsKey, valueJson: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { valueJson: JSON.stringify(value), updatedAt: new Date().toISOString() },
    });
}

// ── Unsplash ──────────────────────────────────────────────────────────────────

export async function getStoredUnsplashKeyMasked(): Promise<string | null> {
  await requireUser();
  const key = await getStoredKey(UNSPLASH_KEY);
  if (!key) return null;
  return maskShortKey(key);
}

export async function saveUnsplashKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(UNSPLASH_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testUnsplashKeyAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const key = await getStoredKey(UNSPLASH_KEY);
  if (!key) return { ok: false, message: "저장된 키가 없습니다." };

  try {
    const res = await fetch("https://api.unsplash.com/photos?per_page=1", {
      headers: { Authorization: `Client-ID ${key}` },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 401) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

// ── Pexels ────────────────────────────────────────────────────────────────────

export async function getStoredPexelsKeyMasked(): Promise<string | null> {
  await requireUser();
  const key = await getStoredKey(PEXELS_KEY);
  if (!key) return null;
  return maskShortKey(key);
}

export async function savePexelsKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(PEXELS_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testPexelsKeyAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const key = await getStoredKey(PEXELS_KEY);
  if (!key) return { ok: false, message: "저장된 키가 없습니다." };

  try {
    const res = await fetch("https://api.pexels.com/v1/search?query=test&per_page=1", {
      headers: { Authorization: key },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 401) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

// ── Google Imagen ─────────────────────────────────────────────────────────────

export async function getStoredGoogleAiKeyMasked(): Promise<string | null> {
  await requireUser();
  const key = await getStoredKey(GOOGLE_AI_KEY);
  if (!key) return null;
  return maskShortKey(key);
}

export async function saveGoogleAiKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(GOOGLE_AI_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testGoogleAiKeyAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const key = await getStoredKey(GOOGLE_AI_KEY);
  if (!key) return { ok: false, message: "저장된 키가 없습니다." };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 400 || res.status === 403) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function maskToken(token: string): string {
  if (token.length <= 10) return "****";
  return `${token.slice(0, 10)}****...${token.slice(-4)}`;
}

export async function getStoredTelegramTokenMasked(): Promise<string | null> {
  await requireAdmin();
  const token = await getStoredKey(TELEGRAM_TOKEN_KEY);
  return token ? maskToken(token) : null;
}

export async function saveTelegramTokenAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireAdmin();
  const token = String(formData.get("botToken") ?? "").trim();
  if (!token) return { ok: false, error: "Bot Token을 입력해주세요." };
  await saveKey(TELEGRAM_TOKEN_KEY, token);
  revalidatePath("/settings");
  return { ok: true, masked: maskToken(token) };
}

export async function testTelegramAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const token = await getStoredKey(TELEGRAM_TOKEN_KEY);
  if (!token) return { ok: false, message: "Bot Token이 저장되지 않았습니다." };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { result?: { username?: string } };
      const uname = data.result?.username;
      return { ok: true, message: uname ? `연결됨 — @${uname}` : "Bot Token 유효 ✓" };
    }
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    const desc = data.description ?? `HTTP ${res.status}`;
    if (res.status === 401 || desc.includes("Unauthorized")) {
      return { ok: false, message: "Bot Token이 올바르지 않습니다." };
    }
    return { ok: false, message: `검증 실패: ${desc.slice(0, 80)}` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

// ── 사용자별 LLM 설정 ─────────────────────────────────────────────────────────

export type LLMProviderInfo = {
  provider: "anthropic" | "openai";
  mode: "system" | "user_key";
  anthropicMasked: string | null;
  openaiMasked: string | null;
  role: "admin" | "user";
};

export async function getLLMProviderInfo(): Promise<LLMProviderInfo> {
  const user = await requireUser();
  const provider = (user.llmProvider ?? "anthropic") as "anthropic" | "openai";
  const mode = (user.apiKeyMode ?? "user_key") as "system" | "user_key";

  function decryptMasked(enc: string | null | undefined): string | null {
    if (!enc) return null;
    try { return maskApiKey(decryptApiKey(enc)); } catch { return null; }
  }

  return {
    provider,
    mode,
    anthropicMasked: decryptMasked(user.anthropicApiKey),
    openaiMasked: decryptMasked(user.openaiApiKey),
    role: user.role as "admin" | "user",
  };
}

export async function saveLLMProviderAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const provider = String(formData.get("provider") ?? "").trim();
  if (provider !== "anthropic" && provider !== "openai") {
    return { ok: false, error: "올바른 provider 값이 아닙니다." };
  }
  await db
    .update(schema.users)
    .set({ llmProvider: provider, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
  return { ok: true };
}

// 사용자 Anthropic 개인 키
export async function getUserApiKeyInfo(): Promise<{
  mode: "system" | "user_key";
  masked: string | null;
  role: "admin" | "user";
}> {
  const user = await requireUser();
  const mode = (user.apiKeyMode ?? "user_key") as "system" | "user_key";
  if (mode !== "user_key" || !user.anthropicApiKey) {
    return { mode, masked: null, role: user.role as "admin" | "user" };
  }
  try {
    const plain = decryptApiKey(user.anthropicApiKey);
    return { mode, masked: maskApiKey(plain), role: user.role as "admin" | "user" };
  } catch {
    return { mode, masked: null, role: user.role as "admin" | "user" };
  }
}

export async function saveUserApiKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.apiKeyMode !== "user_key") {
    return { ok: false, error: "현재 계정은 유저 키 모드가 아닙니다." };
  }
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };

  const enc = tryEncryptApiKey(key);
  if (!enc.ok) return { ok: false, error: enc.error };
  await db
    .update(schema.users)
    .set({ anthropicApiKey: enc.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  revalidatePath("/settings");
  return { ok: true, masked: maskApiKey(key) };
}

export async function testUserApiKeyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (user.apiKeyMode !== "user_key") {
    return { ok: false, message: "현재 계정은 유저 키 모드가 아닙니다." };
  }
  if (!user.anthropicApiKey) {
    return { ok: false, message: "저장된 Anthropic API 키가 없습니다." };
  }
  let key: string;
  try {
    key = decryptApiKey(user.anthropicApiKey);
  } catch {
    return { ok: false, message: "키 복호화에 실패했습니다." };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, message: `연결됨 — ${response.model}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("authentication_error")) {
      return { ok: false, message: "잘못된 API 키입니다." };
    }
    return { ok: false, message: `연결 실패: ${msg.slice(0, 80)}` };
  }
}

// 사용자 OpenAI 개인 키
export async function getUserOpenAIKeyInfo(): Promise<{ masked: string | null }> {
  const user = await requireUser();
  if (!user.openaiApiKey) return { masked: null };
  try {
    return { masked: maskApiKey(decryptApiKey(user.openaiApiKey)) };
  } catch {
    return { masked: null };
  }
}

export async function saveUserOpenAIKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.apiKeyMode !== "user_key") {
    return { ok: false, error: "현재 계정은 유저 키 모드가 아닙니다." };
  }
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };

  const enc = tryEncryptApiKey(key);
  if (!enc.ok) return { ok: false, error: enc.error };
  await db
    .update(schema.users)
    .set({ openaiApiKey: enc.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  revalidatePath("/settings");
  return { ok: true, masked: maskApiKey(key) };
}

export async function testUserOpenAIKeyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.openaiApiKey) {
    return { ok: false, message: "저장된 OpenAI API 키가 없습니다." };
  }
  let key: string;
  try {
    key = decryptApiKey(user.openaiApiKey);
  } catch {
    return { ok: false, message: "키 복호화에 실패했습니다." };
  }

  try {
    const client = new OpenAI({ apiKey: key });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
    });
    return { ok: true, message: `연결됨 — ${res.model}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      return { ok: false, message: "잘못된 API 키입니다." };
    }
    if (msg.includes("429") || msg.includes("quota")) {
      return { ok: false, message: "크레딧 부족 또는 한도 초과입니다." };
    }
    return { ok: false, message: `연결 실패: ${msg.slice(0, 80)}` };
  }
}

// ── 이미지 소스 사용자 키 ─────────────────────────────────────────────────────

export async function getImageApiKeyInfo(): Promise<{
  mode: "system" | "user_key";
  unsplashMasked: string | null;
  pexelsMasked: string | null;
  googleAiMasked: string | null;
}> {
  const user = await requireUser();
  const mode = (user.imageApiKeyMode ?? "system") as "system" | "user_key";
  if (mode !== "user_key") {
    return { mode, unsplashMasked: null, pexelsMasked: null, googleAiMasked: null };
  }

  function decryptMasked(enc: string | null | undefined): string | null {
    if (!enc) return null;
    try { return maskShortKey(decryptApiKey(enc)); } catch { return null; }
  }

  return {
    mode,
    unsplashMasked: decryptMasked(user.unsplashKey ?? null),
    pexelsMasked: decryptMasked(user.pexelsKey ?? null),
    googleAiMasked: decryptMasked(user.googleAiKey ?? null),
  };
}

export async function saveUserUnsplashKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if ((user.imageApiKeyMode ?? "system") !== "user_key") {
    return { ok: false, error: "이미지 키 모드가 유저 키 모드가 아닙니다." };
  }
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  const enc = tryEncryptApiKey(key);
  if (!enc.ok) return { ok: false, error: enc.error };
  await db.update(schema.users)
    .set({ unsplashKey: enc.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function saveUserPexelsKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if ((user.imageApiKeyMode ?? "system") !== "user_key") {
    return { ok: false, error: "이미지 키 모드가 유저 키 모드가 아닙니다." };
  }
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  const enc = tryEncryptApiKey(key);
  if (!enc.ok) return { ok: false, error: enc.error };
  await db.update(schema.users)
    .set({ pexelsKey: enc.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function saveUserGoogleAiKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if ((user.imageApiKeyMode ?? "system") !== "user_key") {
    return { ok: false, error: "이미지 키 모드가 유저 키 모드가 아닙니다." };
  }
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  const enc = tryEncryptApiKey(key);
  if (!enc.ok) return { ok: false, error: enc.error };
  await db.update(schema.users)
    .set({ googleAiKey: enc.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testUserUnsplashKeyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.unsplashKey) return { ok: false, message: "저장된 키가 없습니다." };
  let key: string;
  try { key = decryptApiKey(user.unsplashKey); } catch { return { ok: false, message: "키 복호화 실패." }; }
  try {
    const res = await fetch("https://api.unsplash.com/photos?per_page=1", {
      headers: { Authorization: `Client-ID ${key}` }, cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 401) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

export async function testUserPexelsKeyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.pexelsKey) return { ok: false, message: "저장된 키가 없습니다." };
  let key: string;
  try { key = decryptApiKey(user.pexelsKey); } catch { return { ok: false, message: "키 복호화 실패." }; }
  try {
    const res = await fetch("https://api.pexels.com/v1/search?query=test&per_page=1", {
      headers: { Authorization: key }, cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 401) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}

export async function testUserGoogleAiKeyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.googleAiKey) return { ok: false, message: "저장된 키가 없습니다." };
  let key: string;
  try { key = decryptApiKey(user.googleAiKey); } catch { return { ok: false, message: "키 복호화 실패." }; }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (res.ok) return { ok: true, message: "연결됨 ✓" };
    if (res.status === 400 || res.status === 403) return { ok: false, message: "잘못된 API 키입니다." };
    return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` };
  }
}
