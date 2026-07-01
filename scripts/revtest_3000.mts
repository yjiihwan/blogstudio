/**
 * QA: 명시 글자수 재작성 실측 — 600자→"3000자로 늘려" 확대 / 긴 글→"600자로 줄여" 축소.
 * 라이브 DB 사본에서만 동작(DATABASE_URL 오버라이드). 실 LLM(system openai 키) 사용.
 * 실행: DATABASE_URL=/tmp/blog_revtest_3000.db tsx scripts/revtest_3000.mts
 */
import { reviseDraftWithFeedback } from "@/lib/pipeline";
import { rawSqlite } from "@/db/client";

const BLOG_ID = "QAIv9X7BoElZtnOi"; // 엔짐 영등포점 E2E (길이 1200~2200)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin(openai)
const noWs = (s: string) => s.replace(/\s+/g, "").length;
const nowIso = () => new Date().toISOString();

const SHORT_SEED = [
  "# 엔짐 영등포점, 프리미엄 피트니스의 기준",
  "",
  "안녕하세요. 오늘은 영등포에서 운동할 곳을 찾고 계신 분들께 엔짐 영등포점을 소개해 드릴게요.",
  "엔짐은 고급 수입 장비와 전문 트레이너를 두루 갖춘 프리미엄 피트니스 시설이에요.",
  "근력 운동을 위한 머신부터 유산소 기구까지 폭넓게 마련해 두었고, 늘 청결하게 관리하고 있어요.",
  "전문 트레이너가 회원님 한 분 한 분의 운동 목표와 체력 수준에 맞춰 체계적으로 관리해 드려요.",
  "처음 헬스장을 찾으시는 분이라도 부담 없이 시작하실 수 있도록 기초부터 차근차근 안내해 드릴게요.",
  "넓고 쾌적한 공간에서 다른 사람 눈치 보지 않고 오롯이 운동에만 집중하실 수 있어요.",
  "샤워실과 라커룸 같은 편의 시설도 깔끔하게 갖춰 두어, 운동 전후로 편하게 이용하실 수 있어요.",
  "위치도 영등포역에서 가까워 직장인분들이 퇴근길에 들르시기에도 좋아요.",
  "건강한 변화를 원하신다면 엔짐 영등포점에서 그 첫걸음을 함께 시작해 보세요.",
].join("\n");

function seed(draftId: string, body: string) {
  rawSqlite.prepare("DELETE FROM approvals WHERE draft_id = ?").run(draftId);
  rawSqlite.prepare("DELETE FROM draft_versions WHERE draft_id = ?").run(draftId);
  rawSqlite.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);
  rawSqlite
    .prepare(
      `INSERT INTO drafts (id, blog_id, title, summary, body_md, status, revision_round, char_count, image_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ready_for_review', 0, ?, 0, ?, ?)`
    )
    .run(draftId, BLOG_ID, "엔짐 영등포점, 프리미엄 피트니스의 기준", "엔짐 영등포점 소개", body, noWs(body), nowIso(), nowIso());
}

function readBody(draftId: string) {
  return (rawSqlite.prepare("SELECT body_md FROM drafts WHERE id = ?").get(draftId) as { body_md: string }).body_md;
}

async function runCase(label: string, draftId: string, seedBody: string, feedback: string, reqTarget: number) {
  seed(draftId, seedBody);
  const before = noWs(seedBody);
  await reviseDraftWithFeedback({
    draftId,
    feedback,
    feedbackTags: ["분량"],
    reviewerUserId: ADMIN_ID,
    callerUserId: ADMIN_ID,
  });
  const after = noWs(readBody(draftId));
  const pct = Math.round((after / reqTarget) * 100);
  console.log(
    `\n[${label}] "${feedback}"\n  before=${before}자  after=${after}자  요청목표=${reqTarget}자  (목표대비 ${pct}%)  ${
      pct >= 80 && pct <= 130 ? "✅ 근접" : "❌ 미달/초과"
    }`
  );
  return { label, feedback, before, after, reqTarget, pct };
}

async function main() {
  console.log("[revtest_3000] DB:", process.env.DATABASE_URL);
  const results = [];
  results.push(await runCase("확대(얇은 5배+) 600→3000", "revtest_up_3000", SHORT_SEED, "3000자로 늘려서 작성해줘", 3000));
  // 현실적 2배: 방금 만든 중간 길이 글을 다시 3000으로
  const midBody = readBody("revtest_up_3000");
  results.push(await runCase("확대(현실 2배) →3000", "revtest_up2_3000", midBody, "3000자로 더 자세히 늘려줘", 3000));
  // 축소: 긴 글을 600으로
  const longBody = readBody("revtest_up2_3000");
  results.push(await runCase("축소 →600", "revtest_down_600", longBody, "600자로 확 줄여줘", 600));
  console.log("\n===== 요약 =====");
  for (const r of results) console.log(`${r.label}: ${r.before}→${r.after}자 (목표 ${r.reqTarget}, ${r.pct}%)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
