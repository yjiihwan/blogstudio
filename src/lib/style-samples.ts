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

export * from "./style-samples-core";

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
