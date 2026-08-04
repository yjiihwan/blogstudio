/**
 * 베스트 후기 원문 — 문체 지표 일괄 재계산.
 *
 * 실행: npx tsx scripts/recompute_style_metrics.mts            (지표 없는 행만)
 *       npx tsx scripts/recompute_style_metrics.mts --force    (전부 다시 계산)
 *
 * LLM 호출 없음(규칙 기반). DATABASE_URL 이 가리키는 DB 를 그대로 쓴다.
 */
import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { recomputeAllStyleMetrics, metricsOf } from "@/lib/style-samples";

const force = process.argv.includes("--force");

const r = await recomputeAllStyleMetrics(force);
console.log(
  `문체 지표 재계산 — 검사 ${r.scanned}편 / 갱신 ${r.updated}편${force ? " (--force)" : ""}`
);

const rows = await db.query.styleSamples.findMany({
  orderBy: [asc(schema.styleSamples.category), asc(schema.styleSamples.sortOrder)],
});
if (!rows.length) {
  console.log("(등록된 샘플이 없습니다)");
} else {
  console.log("\n카테고리 | 제목 | 평균문장 | 중앙값 | 문단당문장 | 도입부 | 상위 종결어미");
  console.log("-".repeat(100));
  for (const row of rows) {
    const m = metricsOf(row);
    const top = m.endings
      .slice(0, 3)
      .map((e) => `${e.label} ${e.ratio}%`)
      .join(", ");
    console.log(
      [
        row.category,
        (row.title || "(제목 없음)").slice(0, 24),
        `${m.avgSentenceChars}자`,
        `${m.medianSentenceChars}자`,
        `${m.avgSentencesPerParagraph}`,
        m.introType,
        top || "—",
      ].join(" | ")
    );
  }
}

// 저장 여부 실증 — 컬럼에 실제로 JSON 이 들어갔는지(마이그레이션 누락 조기 발견).
const missing = rows.filter((r2) => !r2.styleMetricsJson).length;
console.log(
  `\nstyle_metrics_json 저장 확인: ${rows.length - missing}/${rows.length}편` +
    (missing ? ` ⚠️ ${missing}편 미저장(컬럼 존재 여부 확인 필요)` : " ✅")
);
