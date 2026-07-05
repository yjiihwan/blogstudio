/**
 * QA: '없는 시설 날조' 버그 수정 검증.
 * 엔짐 영등포점(헬스장, 수영장 없음) 페르소나에 시설 팩트를 시딩하고,
 * 완전자동 초안(generateDraftForBlog)을 5회 재생성해 제목·본문에 '수영/사우나' 등
 * 없는 시설이 다시 나오는지 검사한다(0건이어야 통과). 정상 헬스장 생성도 확인.
 *
 * 실행: cp blog_studio.db /tmp/facttest_ydp.db
 *      DATABASE_URL=/tmp/facttest_ydp.db npx tsx scripts/facttest_ydp.mts
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { generateDraftForBlog } from "@/lib/pipeline";
import { findAbsentFacilityHits } from "@/lib/llm/prompts";

const BLOG_ID = "SRNneUDofXRMhC--"; // 엔짐 영등포점 (실제 블로그)
const RUNS = 5;

// 영등포점 = 일반 헬스장. 수영장·사우나 없음.
const FACILITIES = [
  "웨이트 트레이닝존",
  "머신·프리웨이트",
  "유산소 존",
  "그룹운동(GX)",
  "1:1 퍼스널 트레이닝(PT)",
  "샤워실·탈의실",
];
const ABSENT = ["수영", "사우나", "스파", "골프", "찜질방", "테니스"];
// 정상 생성(과잉 차단 아님) 확인용 — 이 중 하나라도 본문에 있으면 헬스장 주제로 정상 생성된 것.
const POSITIVE = ["헬스", "웨이트", "머신", "pt", "퍼스널", "트레이닝", "운동", "gx"];

const noWs = (s: string) => s.replace(/\s+/g, "").length;

async function seedFacts() {
  const p = await db.query.personas.findFirst({ where: eq(schema.personas.blogId, BLOG_ID) });
  if (!p) throw new Error("페르소나 없음 — BLOG_ID 확인");
  await db
    .update(schema.personas)
    .set({
      facilitiesJson: JSON.stringify(FACILITIES),
      absentFacilitiesJson: JSON.stringify(ABSENT),
    })
    .where(eq(schema.personas.id, p.id));
  console.log(`[seed] 시설 팩트 주입 — 있음:${FACILITIES.length} / 없음:${ABSENT.join(",")}`);
}

async function adminId() {
  const u = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  if (!u) throw new Error("admin 없음");
  if (u.apiKeyMode !== "system")
    await db.update(schema.users).set({ apiKeyMode: "system" }).where(eq(schema.users.id, u.id));
  return u.id;
}

async function main() {
  console.log("[facttest] DB:", process.env.DATABASE_URL);
  await seedFacts();
  const admin = await adminId();

  const rows: Array<{ n: number; title: string; hits: string[]; chars: number; pos: boolean; model: string }> = [];
  for (let i = 1; i <= RUNS; i++) {
    const d = await generateDraftForBlog(BLOG_ID, admin);
    const hay = `${d.title}\n${d.bodyMd}`;
    const hits = findAbsentFacilityHits(hay, ABSENT);
    const pos = POSITIVE.some((k) => hay.toLowerCase().includes(k));
    rows.push({ n: i, title: d.title, hits, chars: noWs(d.bodyMd), pos, model: d.llmModel ?? "" });
    console.log(
      `\n[run ${i}] model=${d.llmModel}\n  제목: ${d.title}\n  글자수(공백제외): ${noWs(d.bodyMd)}` +
        `\n  없는시설 검출: ${hits.length ? "❌ " + hits.join(", ") : "✅ 0건"}` +
        `\n  헬스장 정상 생성(핵심어 존재): ${pos ? "✅" : "⚠️ 핵심어 없음"}`
    );
  }

  const totalHits = rows.reduce((a, r) => a + r.hits.length, 0);
  const allMock = rows.every((r) => r.model === "mock");
  const allPositive = rows.every((r) => r.pos);
  console.log("\n===== 요약 =====");
  for (const r of rows)
    console.log(`  run${r.n}: ${r.hits.length === 0 ? "✅" : "❌"} 없는시설=${r.hits.length} | ${r.title}`);
  console.log(
    `\n없는 시설 총 검출: ${totalHits}건  →  ${totalHits === 0 ? "✅ 통과(0건)" : "❌ 실패"}`
  );
  console.log(`정상 헬스장 생성(과잉차단 아님): ${allPositive ? "✅ 전건" : "⚠️ 일부 핵심어 없음"}`);
  if (allMock) console.log("⚠️ 전 run이 mock 모델 — 실 LLM 키 미작동. 실 검증으로 볼 수 없음.");
  process.exit(totalHits === 0 && !allMock ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
