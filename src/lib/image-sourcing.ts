/**
 * 사진 요청 슬롯의 자동 이미지 소싱.
 *  - "stock"        : Unsplash → Pexels 에서 적절한 무료 이미지 검색
 *  - "ai"           : Google imagen → OpenAI(dall-e-3) 로 이미지 생성
 *  - "stock_then_ai": 스톡 먼저, 결과 없으면 AI 생성으로 폴백
 * 결과 이미지를 storage에 저장하고 images 행 + imageRequests(uploaded) 갱신.
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { resolveImageKeys } from "./image-keys";
import { decryptApiKey } from "./crypto";
import { llm } from "./llm";
import OpenAI from "openai";
import { nanoid } from "nanoid";
import path from "node:path";
import fs from "node:fs/promises";

export type AutoMode = "stock" | "ai" | "stock_then_ai";

const STORAGE_DIR = path.join(process.cwd(), "public", "storage");

type Sourced = { buffer: Buffer; mimeType: string; ext: string; source: "stock_free" | "ai_generated"; meta: Record<string, unknown> };

/** 한국어 묘사(+선택 피드백) → 영어 스톡 검색 키워드 (실패 시 원문 폴백) */
async function toEnglishQuery(description: string, userId: string, feedback?: string): Promise<string> {
  try {
    const res = await llm({
      system: "You convert Korean image descriptions into concise English stock-photo search queries.",
      messages: [
        {
          role: "user",
          content: [
            `Description (Korean): ${description}`,
            feedback?.trim() ? `User feedback to incorporate (Korean): ${feedback.trim()}` : "",
            `Return ONLY 3~6 English keywords, space-separated, no punctuation, no quotes.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      callerUserId: userId,
      maxTokens: 30,
    });
    const q = res.text.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return q || description;
  } catch {
    return description;
  }
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function searchUnsplash(query: string, key: string): Promise<Sourced | null> {
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      results?: Array<{ urls?: { regular?: string }; user?: { name?: string }; links?: { html?: string } }>;
    };
    const hit = data.results?.[0];
    const url = hit?.urls?.regular;
    if (!url) return null;
    const buffer = await fetchBytes(url);
    if (!buffer) return null;
    return {
      buffer,
      mimeType: "image/jpeg",
      ext: "jpg",
      source: "stock_free",
      meta: { provider: "unsplash", query, author: hit?.user?.name, link: hit?.links?.html },
    };
  } catch {
    return null;
  }
}

async function searchPexels(query: string, key: string): Promise<Sourced | null> {
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      photos?: Array<{ src?: { large?: string }; photographer?: string; url?: string }>;
    };
    const hit = data.photos?.[0];
    const url = hit?.src?.large;
    if (!url) return null;
    const buffer = await fetchBytes(url);
    if (!buffer) return null;
    return {
      buffer,
      mimeType: "image/jpeg",
      ext: "jpg",
      source: "stock_free",
      meta: { provider: "pexels", query, author: hit?.photographer, link: hit?.url },
    };
  } catch {
    return null;
  }
}

async function genImagen(description: string, key: string, feedback?: string): Promise<Sourced | null> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: aiPrompt(description, feedback) }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" },
        }),
        cache: "no-store",
      }
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return null;
    return {
      buffer: Buffer.from(b64, "base64"),
      mimeType: data.predictions![0].mimeType || "image/png",
      ext: "png",
      source: "ai_generated",
      meta: { provider: "imagen-3.0", prompt: description },
    };
  } catch {
    return null;
  }
}

async function genOpenAI(description: string, key: string, feedback?: string): Promise<Sourced | null> {
  try {
    const client = new OpenAI({ apiKey: key });
    // gpt-image-1 은 항상 b64_json 반환(response_format 파라미터 없음).
    const res = await client.images.generate({
      model: "gpt-image-1",
      prompt: aiPrompt(description, feedback),
      size: "1536x1024",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return null;
    return {
      buffer: Buffer.from(b64, "base64"),
      mimeType: "image/png",
      ext: "png",
      source: "ai_generated",
      meta: { provider: "gpt-image-1", prompt: description },
    };
  } catch {
    return null;
  }
}

function aiPrompt(description: string, feedback?: string): string {
  const fb = feedback?.trim() ? ` Adjust per this feedback: ${feedback.trim()}.` : "";
  return `${description}.${fb} Editorial blog photograph, photorealistic, natural lighting, high quality, no text, no watermark, no logo.`;
}

/** 시스템/유저 OpenAI 키 (AI 생성 폴백용) */
async function resolveOpenAIKey(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (user?.apiKeyMode === "user_key" && user.openaiApiKey) {
    try { return decryptApiKey(user.openaiApiKey); } catch { /* fall through */ }
  }
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, "openai_api_key"),
  });
  if (!row) return null;
  try { return JSON.parse(row.valueJson) as string | null; } catch { return null; }
}

async function sourceByMode(mode: AutoMode, description: string, userId: string, feedback?: string): Promise<Sourced | { error: string }> {
  const keys = await resolveImageKeys(userId);

  const tryStock = async (): Promise<Sourced | null> => {
    if (!keys.unsplash && !keys.pexels) return null;
    const query = await toEnglishQuery(description, userId, feedback);
    if (keys.unsplash) {
      const u = await searchUnsplash(query, keys.unsplash);
      if (u) return u;
    }
    if (keys.pexels) {
      const p = await searchPexels(query, keys.pexels);
      if (p) return p;
    }
    return null;
  };

  const tryAi = async (): Promise<Sourced | null> => {
    if (keys.googleAi) {
      const g = await genImagen(description, keys.googleAi, feedback);
      if (g) return g;
    }
    const oa = await resolveOpenAIKey(userId);
    if (oa) {
      const o = await genOpenAI(description, oa, feedback);
      if (o) return o;
    }
    return null;
  };

  if (mode === "stock") {
    if (!keys.unsplash && !keys.pexels)
      return { error: "스톡 키(Unsplash/Pexels)가 설정에 없습니다." };
    const r = await tryStock();
    return r ?? { error: "적절한 스톡 이미지를 찾지 못했습니다. 다른 슬롯이거나 AI 생성을 써보세요." };
  }
  if (mode === "ai") {
    const r = await tryAi();
    return r ?? { error: "AI 이미지 생성에 실패했습니다. 키(Google AI 또는 OpenAI)와 크레딧을 확인하세요." };
  }
  // stock_then_ai
  const s = await tryStock();
  if (s) return s;
  const a = await tryAi();
  return a ?? { error: "스톡·AI 모두 실패했습니다. 키 설정과 크레딧을 확인하세요." };
}

/**
 * 사진 요청 1건을 자동 소싱해 저장하고 요청을 uploaded로 갱신한다.
 * feedback이 있으면 반려+재생성(검색어/프롬프트에 반영), 기존 이미지는 교체·삭제한다.
 */
export async function autoSourceForRequest(opts: {
  requestId: string;
  mode: AutoMode;
  userId: string;
  feedback?: string;
}): Promise<{ ok: true; provider: string; imageUrl: string } | { ok: false; error: string }> {
  const req = await db.query.imageRequests.findFirst({
    where: eq(schema.imageRequests.id, opts.requestId),
    with: { draft: true },
  });
  if (!req) return { ok: false, error: "요청을 찾을 수 없습니다." };

  const sourced = await sourceByMode(opts.mode, req.description, opts.userId, opts.feedback);
  if ("error" in sourced) return { ok: false, error: sourced.error };

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const fileName = `${nanoid(16)}.${sourced.ext}`;
  await fs.writeFile(path.join(STORAGE_DIR, fileName), sourced.buffer);

  const [img] = await db
    .insert(schema.images)
    .values({
      blogId: req.draft.blogId,
      draftId: req.draftId,
      source: sourced.source,
      filePath: `/storage/${fileName}`,
      mimeType: sourced.mimeType,
      fileSize: sourced.buffer.length,
      sourceMetaJson: JSON.stringify({
        slot: req.slot,
        ...sourced.meta,
        ...(opts.feedback?.trim() ? { feedback: opts.feedback.trim() } : {}),
      }),
    })
    .returning();

  // 이전 이미지(있으면) 교체 — 슬롯엔 1장만. 파일 + 행 정리.
  const prevImageId = req.uploadedImageId;

  await db
    .update(schema.imageRequests)
    .set({
      status: "uploaded",
      uploadedImageId: img.id,
      uploadedAt: new Date().toISOString(),
    })
    .where(eq(schema.imageRequests.id, opts.requestId));

  if (prevImageId && prevImageId !== img.id) {
    const prev = await db.query.images.findFirst({ where: eq(schema.images.id, prevImageId) });
    if (prev) {
      if (prev.filePath?.startsWith("/storage/")) {
        await fs.rm(path.join(process.cwd(), "public", prev.filePath), { force: true }).catch(() => {});
      }
      await db.delete(schema.images).where(eq(schema.images.id, prevImageId));
    }
  }

  return { ok: true, provider: String(sourced.meta.provider ?? sourced.source), imageUrl: img.filePath };
}
