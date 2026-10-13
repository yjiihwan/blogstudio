/**
 * 이미지 소스 사용여부·시도순서·자동검증 설정 (시스템 키 / 유저 키 양쪽 공통 스키마).
 * 저장 위치: settings.image_source_config (시스템) / users.image_source_config_json (유저).
 * 서버·클라이언트 공용(순수 함수만). DB 접근은 image-keys.ts.
 */
export type StockSource = "unsplash" | "pexels";
export type AiSource = "google_ai" | "openai_image";
export type ImageSource = StockSource | AiSource;

export type ImageSourceConfig = {
  enabled: Record<ImageSource, boolean>;
  order: { stock: StockSource[]; ai: AiSource[] };
  verify: { enabled: boolean; minMatch: number; minQuality: number };
};

export const IMAGE_SOURCE_CONFIG_SETTING_KEY = "image_source_config";

export const STOCK_SOURCES: readonly StockSource[] = ["unsplash", "pexels"];
export const AI_SOURCES: readonly AiSource[] = ["google_ai", "openai_image"];

export const SOURCE_LABEL: Record<ImageSource, string> = {
  unsplash: "Unsplash",
  pexels: "Pexels",
  google_ai: "Google Imagen",
  openai_image: "OpenAI gpt-image-1",
};

// 심사 합격 기준 기본값(설정 폼에서 조정 가능). match·quality 모두 0~10.
export const DEFAULT_JUDGE_MIN_MATCH = 7;
export const DEFAULT_JUDGE_MIN_QUALITY = 6;

export const DEFAULT_IMAGE_SOURCE_CONFIG: ImageSourceConfig = {
  enabled: { unsplash: true, pexels: true, google_ai: true, openai_image: true },
  order: { stock: ["unsplash", "pexels"], ai: ["google_ai", "openai_image"] },
  verify: { enabled: true, minMatch: DEFAULT_JUDGE_MIN_MATCH, minQuality: DEFAULT_JUDGE_MIN_QUALITY },
};

function normalizeOrder<T extends string>(raw: unknown, all: readonly T[]): T[] {
  const out: T[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && (all as readonly string[]).includes(v) && !out.includes(v as T)) {
        out.push(v as T);
      }
    }
  }
  // 빠진 소스는 기본 순서대로 뒤에 붙인다(저장본이 불완전해도 모든 소스가 한 번씩 등장).
  for (const s of all) if (!out.includes(s)) out.push(s);
  return out;
}

function clampScore(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(0, Math.round(n)));
}

/** 저장본(JSON 문자열·객체·null)을 완전한 설정으로 보정. 잘못된 값은 기본값으로. */
export function normalizeImageSourceConfig(raw: unknown): ImageSourceConfig {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try { obj = (JSON.parse(raw) as Record<string, unknown>) ?? {}; } catch { obj = {}; }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const en = (obj.enabled ?? {}) as Record<string, unknown>;
  const order = (obj.order ?? {}) as Record<string, unknown>;
  const verify = (obj.verify ?? {}) as Record<string, unknown>;
  const d = DEFAULT_IMAGE_SOURCE_CONFIG;
  const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
  return {
    enabled: {
      unsplash: bool(en.unsplash, d.enabled.unsplash),
      pexels: bool(en.pexels, d.enabled.pexels),
      google_ai: bool(en.google_ai, d.enabled.google_ai),
      openai_image: bool(en.openai_image, d.enabled.openai_image),
    },
    order: {
      stock: normalizeOrder(order.stock, STOCK_SOURCES),
      ai: normalizeOrder(order.ai, AI_SOURCES),
    },
    verify: {
      enabled: bool(verify.enabled, d.verify.enabled),
      minMatch: clampScore(verify.minMatch, d.verify.minMatch),
      minQuality: clampScore(verify.minQuality, d.verify.minQuality),
    },
  };
}

/** 현재 설정 기준 시도 순서 안내 문구("스톡: Pexels → Unsplash · AI: ..."). 꺼진 소스는 제외. */
export function describeOrder(cfg: ImageSourceConfig): { stock: string; ai: string } {
  const join = (list: ImageSource[]) => {
    const on = list.filter((s) => cfg.enabled[s]).map((s) => SOURCE_LABEL[s]);
    return on.length ? on.join(" → ") : "(켜진 소스 없음)";
  };
  return { stock: join(cfg.order.stock), ai: join(cfg.order.ai) };
}
