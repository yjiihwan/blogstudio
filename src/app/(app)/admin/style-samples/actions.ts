"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import {
  normalizeCategory,
  normalizeConfig,
  recomputeAllStyleMetrics,
  saveStyleSampleConfig,
  type StyleCategory,
} from "@/lib/style-samples";
import { computeStyleMetrics } from "@/lib/style-metrics";

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type SampleInput = {
  id?: string | null;
  category: string;
  title: string;
  body: string;
  sourceUrl: string;
  memo: string;
  isActive: boolean;
  sortOrder: number;
};

function validate(input: SampleInput): { cat: StyleCategory } | { error: string } {
  const cat = normalizeCategory(input.category);
  if (!cat) return { error: "카테고리를 선택해주세요." };
  if (!input.title.trim()) return { error: "제목을 입력해주세요." };
  if (!input.body.trim()) return { error: "본문(원문)을 붙여넣어 주세요." };
  return { cat };
}

/** 신규 저장 / 기존 갱신(id 유무로 분기). */
export async function saveSampleAction(input: SampleInput): Promise<SaveResult> {
  await requireAdmin();
  const v = validate(input);
  if ("error" in v) return { ok: false, error: v.error };

  const values = {
    category: v.cat,
    title: input.title.trim(),
    body: input.body, // 원문 그대로 보관(trim 하지 않는다 — 붙여넣은 형태 유지)
    sourceUrl: input.sourceUrl.trim() || null,
    memo: input.memo.trim() || null,
    isActive: !!input.isActive,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    // 규칙 기반이라 LLM 비용 0 — 저장할 때마다 본문에서 다시 뽑는다.
    styleMetricsJson: JSON.stringify(computeStyleMetrics(input.body)),
    updatedAt: new Date().toISOString(),
  };

  if (input.id) {
    const existing = await db.query.styleSamples.findFirst({
      where: eq(schema.styleSamples.id, input.id),
    });
    if (!existing) return { ok: false, error: "이미 삭제된 샘플입니다." };
    await db
      .update(schema.styleSamples)
      .set(values)
      .where(eq(schema.styleSamples.id, input.id));
    revalidatePath("/admin/style-samples");
    return { ok: true, id: input.id };
  }

  const [row] = await db.insert(schema.styleSamples).values(values).returning();
  revalidatePath("/admin/style-samples");
  return { ok: true, id: row.id };
}

export async function deleteSampleAction(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  await db.delete(schema.styleSamples).where(eq(schema.styleSamples.id, id));
  revalidatePath("/admin/style-samples");
  return { ok: true };
}

export async function toggleActiveAction(id: string, isActive: boolean) {
  await requireAdmin();
  await db
    .update(schema.styleSamples)
    .set({ isActive, updatedAt: new Date().toISOString() })
    .where(eq(schema.styleSamples.id, id));
  revalidatePath("/admin/style-samples");
}

/** 기존 저장분 일괄 재계산. force=true 면 최신 버전이어도 다시 뽑는다(규칙 변경 후 사용). */
export async function recomputeMetricsAction(
  force = true
): Promise<{ scanned: number; updated: number }> {
  await requireAdmin();
  const r = await recomputeAllStyleMetrics(force);
  revalidatePath("/admin/style-samples");
  return r;
}

export async function saveConfigAction(count: number, maxChars: number) {
  await requireAdmin();
  await saveStyleSampleConfig(normalizeConfig({ count, maxChars }));
  revalidatePath("/admin/style-samples");
}
