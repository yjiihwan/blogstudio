/**
 * QA: 자동 생성 경로(generateDraftForBlog) 목표 분량 준수 실측.
 * 페르소나 preferred_length(예: 1200~2200) 대비 실제 산출 글자수(공백 제외)를 측정한다.
 * 수정 전엔 48~77%(단일 패스)만 나왔다 — 수정 후 min~max 범위 안착 여부 검증.
 * 실행: DATABASE_URL=/tmp/blog_autotest.db tsx scripts/autotest_length.mts
 */
import { generateDraftForBlog } from "@/lib/pipeline";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

const BLOG_ID = "QAIv9X7BoElZtnOi"; // 엔짐 영등포점 (페르소나 1200~2200)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin
const noWs = (s: string) => s.replace(/\s+/g, "").length;

async function main() {
  console.log("[autotest_length] DB:", process.env.DATABASE_URL);
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, BLOG_ID),
    with: { personas: true },
  });
  const p = blog?.personas.find((x) => x.isActive) ?? blog?.personas[0];
  const min = p!.preferredLengthMin;
  const max = p!.preferredLengthMax;
  const mid = Math.round((min + max) / 2);
  console.log(`페르소나 목표 분량: ${min}~${max}자 (중앙값 ${mid})\n`);

  const results = [];
  const RUNS = 3;
  for (let i = 1; i <= RUNS; i++) {
    const draft = await generateDraftForBlog(BLOG_ID, ADMIN_ID);
    const chars = noWs(draft.bodyMd);
    const pctMid = Math.round((chars / mid) * 100);
    const inRange = chars >= min * 0.9 && chars <= max * 1.15;
    console.log(
      `[run ${i}] "${draft.title.slice(0, 34)}"\n  결과=${chars}자  (범위 ${min}~${max}, 중앙값대비 ${pctMid}%, 모델=${draft.llmModel})  ${inRange ? "✅ 범위 안착" : "❌ 범위 밖"}`
    );
    results.push({ i, chars, pctMid, inRange });
  }

  console.log("\n===== 요약 =====");
  const pass = results.filter((r) => r.inRange).length;
  const avg = Math.round(results.reduce((a, b) => a + b.pctMid, 0) / results.length);
  for (const r of results)
    console.log(`run ${r.i}: ${r.chars}자 (중앙값 ${r.pctMid}%) ${r.inRange ? "✅" : "❌"}`);
  console.log(`\n합격: ${pass}/${results.length}  평균 중앙값달성률: ${avg}%`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
