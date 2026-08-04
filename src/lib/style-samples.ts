/**
 * 베스트 후기 원문(style_samples) — 문체 근거 few-shot (서버 전용: DB 접근 포함).
 *
 * WHY: "네이버 실제 후기 문체" 규칙의 근거가 예문 한 쌍뿐이라 빈약했다. 네이버는 블로그
 * 본문 API 를 제공하지 않아 자동 수집이 불가하므로, 운영자가 좋은 글을 직접 붙여넣어
 * 관리하고 초안 생성 시 카테고리가 맞는 글을 프롬프트에 넣는다.
 *
 * ⚠️ 주입되는 건 '말투'뿐이다. 내용·고유명사·수치가 새어 나오면 그 글은 날조가 된다.
 * 가드 문구는 style-samples-core.ts 참고(샘플 앞뒤로 두 번 감싼다).
 */
import { db, schema } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import {
  DEFAULT_STYLE_SAMPLE_CONFIG,
  STYLE_SAMPLE_CONFIG_KEY,
  normalizeCategory,
  normalizeConfig,
  truncateSample,
  type StyleSampleConfig,
  type StyleSampleRef,
} from "./style-samples-core";

// WHY: `export *` 는 tsx(ESM) 런타임에서 재노출이 안 잡히는 경우가 있어 명시적으로 나열한다.
export {
  STYLE_CATEGORIES,
  STYLE_SAMPLE_CONFIG_KEY,
  STYLE_SAMPLE_GUARD,
  STYLE_SAMPLE_GUARD_TAIL,
  DEFAULT_STYLE_SAMPLE_CONFIG,
  isStyleCategory,
  normalizeCategory,
  normalizeConfig,
  truncateSample,
  styleSampleBlock,
} from "./style-samples-core";
export type {
  StyleCategory,
  StyleSampleConfig,
  StyleSampleRef,
} from "./style-samples-core";

import {
  aggregateStyleMetrics,
  computeStyleMetrics,
  parseStyleMetrics,
  styleMetricsDirective,
  type StyleMetrics,
  type StyleMetricsAggregate,
} from "./style-metrics";

export async function getStyleSampleConfig(): Promise<StyleSampleConfig> {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(schema.settings.key, STYLE_SAMPLE_CONFIG_KEY),
    });
    if (!row) return DEFAULT_STYLE_SAMPLE_CONFIG;
    return normalizeConfig(JSON.parse(row.valueJson) as Partial<StyleSampleConfig>);
  } catch {
    return DEFAULT_STYLE_SAMPLE_CONFIG;
  }
}

export async function saveStyleSampleConfig(cfg: StyleSampleConfig): Promise<void> {
  const value = JSON.stringify(normalizeConfig(cfg));
  await db
    .insert(schema.settings)
    .values({ key: STYLE_SAMPLE_CONFIG_KEY, valueJson: value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { valueJson: value, updatedAt: new Date().toISOString() },
    });
}

/**
 * 해당 카테고리의 활성 샘플을 sort_order 우선으로 가져온다.
 * category 미지정(null)이거나 등록 0편이면 빈 배열 → 주입 자체를 건너뛴다(기존 동작 유지).
 */
export async function loadStyleSamples(
  category: string | null | undefined,
  cfg?: StyleSampleConfig
): Promise<StyleSampleRef[]> {
  const cat = normalizeCategory(category);
  if (!cat) return [];
  const config = cfg ?? (await getStyleSampleConfig());
  if (config.count <= 0) return [];
  try {
    const rows = await db.query.styleSamples.findMany({
      where: and(eq(schema.styleSamples.category, cat), eq(schema.styleSamples.isActive, true)),
      orderBy: [asc(schema.styleSamples.sortOrder), asc(schema.styleSamples.createdAt)],
      limit: config.count,
    });
    return rows
      .filter((r) => r.body && r.body.trim())
      .map((r) => ({
        title: r.title?.trim() || "(제목 없음)",
        body: truncateSample(r.body, config.maxChars).text,
      }));
  } catch (err) {
    // 샘플 조회 실패가 초안 생성을 막아선 안 된다 — 없는 셈 치고 진행(회귀 금지).
    console.error("[style-samples] load failed:", String(err));
    return [];
  }
}

/* ============================================================
   문체 지표 — 저장 시 계산, 카테고리 단위 집계
   ============================================================ */

/** 저장된 지표를 읽되, 없거나 구버전이면 본문에서 즉석 재계산(순수 함수라 비용 없음). */
export function metricsOf(row: { body: string; styleMetricsJson: string | null }): StyleMetrics {
  return parseStyleMetrics(row.styleMetricsJson) ?? computeStyleMetrics(row.body);
}

/**
 * 카테고리의 «활성 샘플 전체»로 지표를 집계한다.
 * WHY: 프롬프트에 넣는 원문은 count 편으로 제한되지만, 목표 수치는 등록된 글 전부를
 * 근거로 잡는 게 표본이 크고 안정적이다(요청 사양 ②).
 */
export async function loadStyleMetricsAggregate(
  category: string | null | undefined
): Promise<StyleMetricsAggregate | null> {
  const cat = normalizeCategory(category);
  if (!cat) return null;
  try {
    const rows = await db.query.styleSamples.findMany({
      where: and(eq(schema.styleSamples.category, cat), eq(schema.styleSamples.isActive, true)),
      orderBy: [asc(schema.styleSamples.sortOrder), asc(schema.styleSamples.createdAt)],
    });
    return aggregateStyleMetrics(
      rows.filter((r) => r.body?.trim()).map((r) => metricsOf(r))
    );
  } catch (err) {
    console.error("[style-samples] metrics aggregate failed:", String(err));
    return null;
  }
}

/** 프롬프트에 실을 자연어 지시문. 샘플 0편이면 빈 문자열(기존 동작 유지). */
export async function loadStyleMetricsDirective(
  category: string | null | undefined
): Promise<string> {
  return styleMetricsDirective(await loadStyleMetricsAggregate(category));
}

/** 저장된 지표가 없거나 구버전인 행을 전부 재계산한다. 반환 = {검사, 갱신}. */
export async function recomputeAllStyleMetrics(
  force = false
): Promise<{ scanned: number; updated: number }> {
  const rows = await db.query.styleSamples.findMany();
  let updated = 0;
  for (const r of rows) {
    if (!force && parseStyleMetrics(r.styleMetricsJson)) continue;
    await db
      .update(schema.styleSamples)
      .set({ styleMetricsJson: JSON.stringify(computeStyleMetrics(r.body)) })
      .where(eq(schema.styleSamples.id, r.id));
    updated += 1;
  }
  return { scanned: rows.length, updated };
}
