/**
 * QA: 반려→AI 재작성이 '누적 반려 히스토리 전체'를 반영하는지 실측.
 * - 라이브 DB 사본(/tmp/blog_revtest.db)에서만 동작. 라이브 미변경.
 * - 엔짐 프리미엄 페르소나(formal) 초안 1건 시드 → 3회 연속 반려(서로 다른 요청).
 * - 각 회차마다 LLM에 실제 전달되는 user 프롬프트를 재구성·덤프(priorFeedbacks 포함여부 직접확인).
 *   (reviseDraftWithFeedback 내부 priorRejects 조회와 동일 쿼리·동일 입력으로 재구성 → 충실)
 */
import { reviseDraftWithFeedback } from "@/lib/pipeline";
import { revisePrompt } from "@/lib/llm/prompts";
import { rawSqlite } from "@/db/client";
import fs from "node:fs";

const BLOG_ID = "QAIv9X7BoElZtnOi"; // 엔짐 영등포점 (프리미엄, persona formal)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin(openai gpt-4o)
const SCENARIO = process.env.SCENARIO ?? "A";
const DRAFT_ID = SCENARIO === "B" ? "revtest_accum_draft_b" : "revtest_accum_draft";

const SEED_BODY = [
  "# 엔짐 영등포점, 프리미엄 피트니스의 기준",
  "",
  "안녕하세요. 오늘은 엔짐 영등포점의 차별점을 소개해 드리겠습니다.",
  "엔짐은 고급 수입 장비와 전문 트레이너를 갖춘 프리미엄 피트니스 시설입니다.",
  "회원님의 운동 목표를 체계적으로 관리해 드립니다.",
  "쾌적한 환경에서 운동에 집중하실 수 있습니다.",
].join("\n");

const ROUNDS_A = [
  { feedback: "전체 톤을 반말로 바꿔줘. 존댓말 쓰지 말고 친구한테 말하듯이.", tags: ["톤"] },
  { feedback: "장비랑 운동 효과 묘사를 훨씬 더 구체적으로. 어떤 머신이 있고 어떤 느낌인지 디테일하게.", tags: ["구체성"] },
  { feedback: "분량을 1.5배 이상으로 늘려줘. 내용을 더 풍부하게.", tags: ["분량"] },
];
// 시나리오 B: 모델이 충분히 반영 가능한 요청만 — 누적/회귀를 톤한계와 분리 검증
const ROUNDS_B = [
  { feedback: "글 곳곳에 '영등포 PT'라는 키워드를 자연스럽게 3회 이상 넣어줘.", tags: ["키워드"] },
  { feedback: "마지막에 '무료 체험 상담 예약' CTA 문장을 꼭 추가해줘.", tags: ["CTA"] },
  { feedback: "본문에 소제목(##)을 2개 이상 넣어 구조를 잡아줘.", tags: ["구조"] },
];
const ROUNDS = SCENARIO === "B" ? ROUNDS_B : ROUNDS_A;

function nowIso() {
  return new Date().toISOString();
}

function seedDraft() {
  rawSqlite.prepare("DELETE FROM approvals WHERE draft_id = ?").run(DRAFT_ID);
  rawSqlite.prepare("DELETE FROM draft_versions WHERE draft_id = ?").run(DRAFT_ID);
  rawSqlite.prepare("DELETE FROM drafts WHERE id = ?").run(DRAFT_ID);
  const charCount = SEED_BODY.replace(/\s+/g, "").length;
  rawSqlite
    .prepare(
      `INSERT INTO drafts (id, blog_id, title, summary, body_md, status, revision_round, char_count, image_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ready_for_review', 0, ?, 0, ?, ?)`
    )
    .run(
      DRAFT_ID,
      BLOG_ID,
      "엔짐 영등포점, 프리미엄 피트니스의 기준",
      "엔짐 영등포점 소개",
      SEED_BODY,
      charCount,
      nowIso(),
      nowIso()
    );
}

function readDraft() {
  return rawSqlite
    .prepare("SELECT title, body_md, char_count, revision_round, status FROM drafts WHERE id = ?")
    .get(DRAFT_ID) as {
    title: string;
    body_md: string;
    char_count: number;
    revision_round: number;
    status: string;
  };
}

// reviseDraftWithFeedback 내부 priorRejects 조회와 동일: decision='reject', revision asc, feedback 非공백
function currentPriorFeedbacks() {
  const rows = rawSqlite
    .prepare(
      "SELECT revision, feedback, feedback_tags_json FROM approvals WHERE draft_id = ? AND decision = 'reject' ORDER BY revision ASC"
    )
    .all(DRAFT_ID) as { revision: number; feedback: string | null; feedback_tags_json: string }[];
  return rows
    .filter((r) => (r.feedback ?? "").trim().length > 0)
    .map((r) => ({
      revision: r.revision,
      feedback: r.feedback ?? "",
      feedbackTags: JSON.parse(r.feedback_tags_json || "[]") as string[],
    }));
}

async function main() {
  seedDraft();
  const log: any = { startedAt: nowIso(), blogId: BLOG_ID, draftId: DRAFT_ID, seed: {}, rounds: [] };
  const d0 = readDraft();
  log.seed = { title: d0.title, charCount: d0.char_count, body: d0.body_md };
  console.log(`[seed] revision_round=${d0.revision_round} chars=${d0.char_count}`);

  for (let i = 0; i < ROUNDS.length; i++) {
    const round = ROUNDS[i];
    // (1) LLM에 들어갈 user 프롬프트 재구성(덤프) — 호출 직전 상태 = 함수 내부와 동일
    const before = readDraft();
    const priors = currentPriorFeedbacks();
    const dumpedPrompt = revisePrompt({
      persona: {} as any, // revisePrompt 출력은 persona 미사용
      currentTitle: before.title,
      currentBodyMd: before.body_md,
      feedback: round.feedback,
      feedbackTags: round.tags,
      priorFeedbacks: priors,
    });
    console.log(`\n[R${i + 1}] priorFeedbacks 포함 ${priors.length}건: ${priors.map((p) => `${p.revision + 1}차`).join(", ") || "(없음)"}`);

    // (2) 실제 재작성 호출 (실 LLM)
    const t0 = Date.now();
    const result = await reviseDraftWithFeedback({
      draftId: DRAFT_ID,
      feedback: round.feedback,
      feedbackTags: round.tags,
      reviewerUserId: ADMIN_ID,
      callerUserId: ADMIN_ID,
    });
    const ms = Date.now() - t0;
    const after = readDraft();
    console.log(`[R${i + 1}] done rev=${result.revision} chars=${after.char_count} (${ms}ms)`);

    log.rounds.push({
      round: i + 1,
      feedback: round.feedback,
      tags: round.tags,
      priorFeedbacksAtCall: priors.map((p) => ({ label: `${p.revision + 1}차`, feedback: p.feedback })),
      dumpedUserPrompt: dumpedPrompt,
      resultTitle: after.title,
      resultBody: after.body_md,
      resultCharCount: after.char_count,
      resultRevision: after.revision_round,
    });
  }

  log.finishedAt = nowIso();
  const out = SCENARIO === "B" ? "/tmp/revtest_accum_result_b.json" : "/tmp/revtest_accum_result.json";
  fs.writeFileSync(out, JSON.stringify(log, null, 2), "utf8");
  console.log(`\n[saved] ${out}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
