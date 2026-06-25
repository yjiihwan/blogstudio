/**
 * QA(운영자 보고용): "고객 리뷰 시점 → 직원(사장) 시점 전환 → 글자수 늘리기" 실제 재현.
 * - 라이브 DB 사본(/tmp/blog_pov_test.db)에서만 동작. 라이브 미변경.
 * - 블로그 SRNneUDofXRMhC-- (엔짐 영등포점) — persona = first_person/여성 리뷰어(=고객 후기 시점).
 *   이 페르소나 자체가 '고객 리뷰 시점'을 시스템 프롬프트로 강하게 밀기 때문에,
 *   관리자 코멘트('직원 시점으로')가 시스템 기본값을 이기는지 검증하는 최악 케이스.
 * - 실 LLM(gpt-4o 시스템키)로 reviseDraftWithFeedback 2회 호출.
 *   R1: 고객→직원 시점 전환,  R2: 직원 시점 유지한 채 분량 증가.
 */
import { reviseDraftWithFeedback } from "@/lib/pipeline";
import { revisePrompt } from "@/lib/llm/prompts";
import { rawSqlite } from "@/db/client";
import fs from "node:fs";

const BLOG_ID = "SRNneUDofXRMhC--"; // 엔짐 영등포점 (first_person 여성 리뷰어 = 고객 후기 시점)
const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // system 모드 admin(openai gpt-4o)
const DRAFT_ID = "revtest_pov_draft";

// 시작점: 방문 고객이 후기 쓰듯 작성된 '고객 리뷰 스타일' 초안.
const SEED_BODY = [
  "## 영등포 헬스장 찾다가 엔짐 다녀온 후기",
  "",
  "요즘 운동을 다시 시작해보려고 영등포 헬스장을 한참 알아봤어요.",
  "집 근처에 여러 곳이 있었는데, 후기 보고 엔짐 영등포점에 직접 등록하고 다녀왔어요.",
  "",
  "제가 가보니 기구가 생각보다 훨씬 다양하더라고요.",
  "특히 처음 가는 사람도 눈치 안 보고 운동할 수 있는 분위기라 마음에 들었어요.",
  "트레이너분이 자세도 친절하게 봐주셔서 첫날부터 안심하고 운동했네요.",
  "",
  "운동 끝나고 샤워실도 깨끗해서 좋았고, 전체적으로 만족스러운 경험이었어요.",
  "영등포역 헬스장 알아보는 분들께 제 경험상 추천하고 싶어요.",
].join("\n");

const ROUNDS = [
  {
    feedback:
      "이 글을 방문 고객 후기가 아니라, 헬스장을 운영하는 직원(사장/사업자) 입장에서 쓴 글로 바꿔줘. '제가 손님으로 가보니'가 아니라, 우리가 운영하는 시설을 우리가 직접 소개하는 시점으로. 화자/주어를 운영자 시점으로 일관되게 전환해줘.",
    tags: ["시점전환"],
  },
  {
    feedback: "글자수를 훨씬 더 늘려줘. 내용을 풍부하게 추가해서 길게.",
    tags: ["분량"],
  },
];

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
      "영등포 헬스장 찾다가 엔짐 다녀온 후기",
      "엔짐 영등포점 방문 후기",
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

// 간이 시점 신호 카운트(휴리스틱). 정밀 판정은 사람이 본문 발췌로 확인.
function povSignals(body: string) {
  const customer = [
    "다녀온", "다녀왔", "가보니", "가봤", "등록하고", "방문", "후기",
    "추천하고 싶", "제가 손님", "이용해보니", "회원으로",
  ];
  const staff = [
    "저희", "우리", "운영", "준비했", "마련했", "갖추", "모시", "찾아주",
    "방문해 주", "오시면", "도와드리", "관리해 드리", "제공", "운영하는",
  ];
  const count = (arr: string[]) =>
    arr.reduce((s, w) => s + (body.split(w).length - 1), 0);
  return { customer: count(customer), staff: count(staff) };
}

async function main() {
  seedDraft();
  const log: any = {
    startedAt: nowIso(),
    scenario: "고객리뷰 → 직원시점 전환 → 글자수 증가",
    blogId: BLOG_ID,
    draftId: DRAFT_ID,
    seed: {},
    rounds: [],
  };
  const d0 = readDraft();
  log.seed = {
    title: d0.title,
    charCount: d0.char_count,
    body: d0.body_md,
    pov: povSignals(d0.body_md),
  };
  console.log(`[seed] chars=${d0.char_count} pov=${JSON.stringify(povSignals(d0.body_md))}`);

  for (let i = 0; i < ROUNDS.length; i++) {
    const round = ROUNDS[i];
    const before = readDraft();
    const priors = currentPriorFeedbacks();
    const dumpedPrompt = revisePrompt({
      persona: {} as any,
      currentTitle: before.title,
      currentBodyMd: before.body_md,
      feedback: round.feedback,
      feedbackTags: round.tags,
      priorFeedbacks: priors,
    });
    console.log(
      `\n[R${i + 1}] priorFeedbacks ${priors.length}건: ${priors.map((p) => `${p.revision + 1}차`).join(", ") || "(없음)"}`
    );

    const t0 = Date.now();
    await reviseDraftWithFeedback({
      draftId: DRAFT_ID,
      feedback: round.feedback,
      feedbackTags: round.tags,
      reviewerUserId: ADMIN_ID,
      callerUserId: ADMIN_ID,
    });
    const ms = Date.now() - t0;
    const after = readDraft();
    const pov = povSignals(after.body_md);
    console.log(
      `[R${i + 1}] done rev=${after.revision_round} chars=${after.char_count} pov=${JSON.stringify(pov)} (${ms}ms)`
    );

    log.rounds.push({
      round: i + 1,
      feedback: round.feedback,
      tags: round.tags,
      priorFeedbacksAtCall: priors.map((p) => ({ label: `${p.revision + 1}차`, feedback: p.feedback })),
      dumpedUserPrompt: dumpedPrompt,
      beforeCharCount: before.char_count,
      resultTitle: after.title,
      resultBody: after.body_md,
      resultCharCount: after.char_count,
      pov,
    });
  }

  log.finishedAt = nowIso();
  const out = "/tmp/revtest_pov_result.json";
  fs.writeFileSync(out, JSON.stringify(log, null, 2), "utf8");
  console.log(`\n[saved] ${out}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
