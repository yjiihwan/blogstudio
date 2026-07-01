/**
 * QA: 신규 작성(반자동) 경로 명시 글자수 실측.
 * 페르소나 기본 분량(1200~2200)을 벗어나는 길이를 brief에 명시 → 실제로 그 길이로 나오는지 검증.
 * 실행: DATABASE_URL=/tmp/blog_newtest.db tsx scripts/newtest_length.mts
 */
import { generateDraftFromBrief } from "@/lib/pipeline";

const BLOG_ID = "QAIv9X7BoElZtnOi"; // 엔짐 영등포점 E2E (페르소나 길이 1200~2200)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin(openai)
const noWs = (s: string) => s.replace(/\s+/g, "").length;

async function runCase(label: string, title: string, brief: string, target: number) {
  const draft = await generateDraftFromBrief({
    blogId: BLOG_ID,
    callerUserId: ADMIN_ID,
    title,
    brief,
    photoMode: "auto",
  });
  const chars = noWs(draft.bodyMd);
  const pct = Math.round((chars / target) * 100);
  const ok = pct >= 80 && pct <= 135;
  console.log(
    `\n[${label}] brief="${brief}"\n  결과=${chars}자  요청목표=${target}자  (목표대비 ${pct}%)  ${ok ? "✅ 근접" : "❌ 미달/초과"}`
  );
  return { label, brief, chars, target, pct, ok };
}

async function main() {
  console.log("[newtest_length] DB:", process.env.DATABASE_URL, "(페르소나 기본 1200~2200자)");
  const results = [];
  results.push(await runCase("증상 케이스 2000자", "엔짐 영등포점 운동 가이드", "엔짐 영등포점의 시설과 트레이닝 프로그램을 소개하는 글. 2000자로 작성해줘.", 2000));
  results.push(await runCase("하한 미만 700자", "엔짐 영등포점 빠른 소개", "엔짐 영등포점을 간단히 소개. 700자로 짧게 작성해줘.", 700));
  results.push(await runCase("상한 초과 3500자", "엔짐 영등포점 완벽 가이드", "엔짐 영등포점의 시설, 장비, 트레이너, 이용법을 아주 자세히. 3500자로 작성해줘.", 3500));
  console.log("\n===== 요약 (페르소나 기본 1200~2200) =====");
  for (const r of results) console.log(`${r.label}: ${r.chars}자 (목표 ${r.target}, ${r.pct}%) ${r.ok ? "✅" : "❌"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
