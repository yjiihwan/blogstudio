"use server";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "anthropic_api_key";
const UNSPLASH_KEY = "unsplash_access_key";
const PEXELS_KEY = "pexels_api_key";
const GOOGLE_AI_KEY = "google_ai_api_key";
const TELEGRAM_TOKEN_KEY = "telegram_bot_token";
const TELEGRAM_CHAT_ID_KEY = "telegram_chat_id";

function maskKey(key: string): string {
  if (key.length <= 12) return "sk-ant-****";
  return `${key.slice(0, 8)}****...${key.slice(-4)}`;
}

function maskShortKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****...${key.slice(-4)}`;
}

export async function getStoredApiKeyMasked(): Promise<string | null> {
  await requireUser();
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, SETTINGS_KEY),
  });
  if (!row) return null;
  const key = JSON.parse(row.valueJson) as string;
  if (!key) return null;
  return maskKey(key);
}

export async function saveApiKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireUser();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };

  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, valueJson: JSON.stringify(key) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        valueJson: JSON.stringify(key),
        updatedAt: new Date().toISOString(),
      },
    });

  revalidatePath("/settings");
  return { ok: true, masked: maskKey(key) };
}

async function resolveApiKey(): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, SETTINGS_KEY),
  });
  if (row) {
    const key = JSON.parse(row.valueJson) as string;
    if (key) return key;
  }
  return process.env.ANTHROPIC_API_KEY ?? null;
}

export async function testApiKeyAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requireUser();
  const key = await resolveApiKey();
  if (!key) {
    return { ok: false, message: "저장된 API 키가 없습니다." };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    const model = response.model ?? "claude-haiku";
    return { ok: true, message: `연결됨 — ${model}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("401") ||
      msg.includes("invalid_api_key") ||
      msg.includes("authentication_error")
    ) {
      return { ok: false, message: "잘못된 API 키입니다." };
    }
    if (
      msg.includes("credit") ||
      msg.includes("billing") ||
      msg.includes("quota") ||
      msg.includes("overloaded")
    ) {
      return { ok: false, message: "크레딧 부족 또는 결제 오류입니다." };
    }
    return { ok: false, message: `연결 실패: ${msg.slice(0, 80)}` };
  }
}

// ── Unsplash ──────────────────────────────────────────────────────────────────

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

export async function getStoredUnsplashKeyMasked(): Promise<string | null> {
  await requireUser();
  const key = await getStoredKey(UNSPLASH_KEY);
  if (!key) return null;
  return maskShortKey(key);
}

export async function saveUnsplashKeyAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireUser();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(UNSPLASH_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testUnsplashKeyAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requireUser();
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
  await requireUser();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(PEXELS_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testPexelsKeyAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requireUser();
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
  await requireUser();
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "API 키를 입력해주세요." };
  await saveKey(GOOGLE_AI_KEY, key);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(key) };
}

export async function testGoogleAiKeyAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requireUser();
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

export async function getStoredTelegramConfigMasked(): Promise<{
  tokenMasked: string | null;
  chatIdMasked: string | null;
}> {
  await requireUser();
  const [token, chatId] = await Promise.all([
    getStoredKey(TELEGRAM_TOKEN_KEY),
    getStoredKey(TELEGRAM_CHAT_ID_KEY),
  ]);
  return {
    tokenMasked: token ? maskToken(token) : null,
    chatIdMasked: chatId ? maskShortKey(chatId) : null,
  };
}

export async function saveTelegramTokenAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireUser();
  const token = String(formData.get("botToken") ?? "").trim();
  if (!token) return { ok: false, error: "Bot Token을 입력해주세요." };
  await saveKey(TELEGRAM_TOKEN_KEY, token);
  revalidatePath("/settings");
  return { ok: true, masked: maskToken(token) };
}

export async function saveTelegramChatIdAction(
  formData: FormData
): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  await requireUser();
  const chatId = String(formData.get("chatId") ?? "").trim();
  if (!chatId) return { ok: false, error: "Chat ID를 입력해주세요." };
  await saveKey(TELEGRAM_CHAT_ID_KEY, chatId);
  revalidatePath("/settings");
  return { ok: true, masked: maskShortKey(chatId) };
}

export async function testTelegramAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requireUser();
  const [token, chatId] = await Promise.all([
    getStoredKey(TELEGRAM_TOKEN_KEY),
    getStoredKey(TELEGRAM_CHAT_ID_KEY),
  ]);
  if (!token) return { ok: false, message: "Bot Token이 저장되지 않았습니다." };
  if (!chatId) return { ok: false, message: "Chat ID가 저장되지 않았습니다." };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ 블로그 스튜디오 — 텔레그램 연결 테스트 성공!",
          parse_mode: "HTML",
        }),
        cache: "no-store",
      }
    );
    if (res.ok) return { ok: true, message: "테스트 메시지 전송됨 ✓" };
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    const desc = data.description ?? `HTTP ${res.status}`;
    if (res.status === 401 || desc.includes("Unauthorized")) {
      return { ok: false, message: "Bot Token이 올바르지 않습니다." };
    }
    if (desc.includes("chat not found") || desc.includes("Bad Request")) {
      return { ok: false, message: "Chat ID가 올바르지 않습니다." };
    }
    return { ok: false, message: `전송 실패: ${desc.slice(0, 80)}` };
  } catch (err) {
    return {
      ok: false,
      message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`,
    };
  }
}
