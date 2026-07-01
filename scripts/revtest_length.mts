/**
 * QA 진단: 반려 재작성에서 '글자수/분량 요청'이 반영되는지 + humanize 패스가 분량을 깎는지 실측.
 * - 라이브 DB 사본(/tmp/blog_revtest_len.db)에서만 동작. 라이브 미변경(DATABASE_URL 오버라이드).
 * - 같은 시드에 동일 길이요청을 humanize ON / OFF 두 조건으로 돌려 글자수 before/after 비교.
 * 실행: DATABASE_URL=/tmp/blog_revtest_len.db tsx scripts/revtest_length.mts
 */
import { reviseDraftWithFeedback } from "@/lib/pipeline";
import { rawSqlite } from "@/db/client";
import fs from "node:fs";

const BLOG_ID = "QAIv9X7BoElZtnOi"; // 엔짐 영등포점 (persona formal, 길이 1200~2200)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin(openai gpt-4o)
const DRAFT_ID = "revtest_len_draft";
const GUIDE_KEY = "global_writing_guide";

const SEED_BODY = [
  "# 엔짐 영등포점, 프리미엄 피트니스의 기준",
  "",
  "안녕하세요. 오늘은 엔짐 영등포점의 차별점을 소개해 드리겠습니다.",
  "엔짐은 고급 수입 장비와 전문 트레이너를 갖춘 프리미엄 피트니스 시설입니다.",
  "회원님의 운동 목표를 체계적으로 관리해 드립니다.",
  "쾌적한 환경에서 운동에 집중하실 수 있습니다.",
].join("\n");

// 누적 회차: 늘려 → 더 늘려 → 줄여
const ROUNDS = [
  { feedback: "분량을 1.5배 이상으로 대폭 늘려줘. 내용을 더 풍부하고 길게.", tags: ["분량"] },
  { feedback: "아직 짧아. 지금보다 2배는 더 길게, 훨씬 더 자세하게 늘려줘.", tags: ["분량"] },
  { feedback: "너무 길다. 핵심만 남기고 절반 분량으로 확 줄여줘.", tags: ["분량"] },
];

const noWs = (s: string) => s.replace(/\s+/g, "").length;
const nowIso = () => new Date().toISOString();

function setHumanize(enabled: boolean) {
  rawSqlite
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`
    )
    .run(GUIDE_KEY, JSON.stringify({ enabled, text: enabled ? defaultGuideText() : "" }), nowIso());
}

// getGlobalWritingGuide의 DEFAULT를 모르면 enabled=true+빈text면 humanize가 스킵되므로
// ON 조건엔 최소한의 실제 가이드 텍스트를 넣어 패스가 실제로 돌게 한다.
function defaultGuideText() {
  return [
    "다음 'AI가 쓴 티'를 모두 제거하라:",
    "- 상투적 도입('바쁜 일상 속에서'), 과장된 마무리",
    "- 똑같은 종결어미 연속 반복, 공허한 일반론",
    "- 불필요한 접속사 남발, 기계적 나열",
  ].join("\n");
}

function seedDraft() {
  rawSqlite.prepare("DELETE FROM approvals WHERE draft_id = ?").run(DRAFT_ID);
  rawSqlite.prepare("DELETE FROM draft_versions WHERE draft_id = ?").run(DRAFT_ID);
  rawSqlite.prepare("DELETE FROM drafts WHERE id = ?").run(DRAFT_ID);
  rawSqlite
    .prepare(
      `INSERT INTO drafts (id, blog_id, title, summary, body_md, status, revision_round, char_count, image_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ready_for_review', 0, ?, 0, ?, ?)`
    )
    .run(DRAFT_ID, BLOG_ID, "엔짐 영등포점, 프리미엄 피트니스의 기준", "엔짐 영등포점 소개", SEED_BODY, noWs(SEED_BODY), nowIso(), nowIso());
}

function readDraft() {
  return rawSqlite
    .prepare("SELECT title, body_md FROM drafts WHERE id = ?")
    .get(DRAFT_ID) as { title: string; body_md: string };
}

// 이번 회차 reject를 approvals에 사후 삽입(다음 회차 priorFeedbacks로 잡히도록)
function insertReject(revision: number, feedback: string, tags: string[]) {
  rawSqlite
    .prepare(
      `INSERT INTO approvals (id, draft_id, reviewer_user_id, decision, revision, feedback, feedback_tags_json, created_at)
       VALUES (?, ?, ?, 'reject', ?, ?, ?, ?)`
    )
    .run(`rej_len_${revision}_${Math.floor(Math.random() * 1e6)}`, DRAFT_ID, ADMIN_ID, revision, feedback, JSON.stringify(tags), nowIso());
}

async function runCondition(label: string, humanize: boolean) {
  setHumanize(humanize);
  seedDraft();
  const log: any[] = [];
  const seedLen = noWs(SEED_BODY);
  log.push({ round: 0, request: "(시드)", chars: seedLen, ratioVsPrev: 1, ratioVsSeed: 1 });
  let prevLen = seedLen;
  for (let i = 0; i < ROUNDS.length; i++) {
    const r = ROUNDS[i];
    const before = readDraft();
    await reviseDraftWithFeedback({
      draftId: DRAFT_ID,
      feedback: r.feedback,
      feedbackTags: r.tags,
      reviewerUserId: ADMIN_ID,
      callerUserId: ADMIN_ID,
    });
    insertReject(i, r.feedback, r.tags); // 다음 회차 누적 반영용
    const after = readDraft();
    const len = noWs(after.body_md);
    log.push({
      round: i + 1,
      request: r.feedback,
      chars: len,
      ratioVsPrev: +(len / prevLen).toFixed(2),
      ratioVsSeed: +(len / seedLen).toFixed(2),
      bodyPreview: after.body_md.slice(0, 120).replace(/\n/g, " "),
    });
    prevLen = len;
    void before;
  }
  return { label, humanize, log };
}

async function main() {
  console.log("[revtest_length] DB:", process.env.DATABASE_URL);
  const results: any[] = [];
  results.push(await runCondition("humanize_ON", true));
  results.push(await runCondition("humanize_OFF", false));

  for (const c of results) {
    console.log(`\n===== ${c.label} (humanize=${c.humanize}) =====`);
    for (const row of c.log) {
      console.log(
        `R${row.round} chars=${row.chars} (vsPrev ×${row.ratioVsPrev}, vsSeed ×${row.ratioVsSeed}) :: ${row.request}`
      );
    }
  }
  const out = `/tmp/revtest_length_result.json`;
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log("\n[saved]", out);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
