/**
 * QA 진단: 다회차 누적 반려(서로 다른 요청)를 거치며 글 퀄리티(자연스러움/구조/중복)가 저하되는지 실측.
 * - 라이브 DB 사본에서만 동작. DATABASE_URL 오버라이드.
 * - 톤→구체성→분량 순으로 3회 누적 반려. 각 회차 본문 전문 + 지표(글자수/문장수/중복문장/키워드빈도) 덤프.
 * 실행: DATABASE_URL=/tmp/blog_revtest_q.db tsx scripts/revtest_quality.mts
 */
import { reviseDraftWithFeedback } from "@/lib/pipeline";
import { rawSqlite } from "@/db/client";
import fs from "node:fs";

const BLOG_ID = "QAIv9X7BoElZtnOi";
const ADMIN_ID = "rdCxk9rRFWb2wnJr";
const DRAFT_ID = "revtest_q_draft";

const SEED_BODY = [
  "# 엔짐 영등포점, 프리미엄 피트니스의 기준",
  "",
  "안녕하세요. 오늘은 엔짐 영등포점의 차별점을 소개해 드리겠습니다.",
  "엔짐은 고급 수입 장비와 전문 트레이너를 갖춘 프리미엄 피트니스 시설입니다.",
  "회원님의 운동 목표를 체계적으로 관리해 드립니다.",
  "쾌적한 환경에서 운동에 집중하실 수 있습니다.",
].join("\n");

const ROUNDS = [
  { feedback: "전체 톤을 좀 더 친근하고 부드럽게, 딱딱한 격식체 말고 편안한 해요체로 바꿔줘.", tags: ["톤"] },
  { feedback: "장비랑 운동 효과 묘사를 훨씬 더 구체적으로. 어떤 머신이 있고 어떤 느낌인지 디테일하게 적어줘.", tags: ["구체성"] },
  { feedback: "분량을 1.5배로 늘리고, 마지막에 '무료 체험 상담 예약' CTA 문장도 꼭 넣어줘.", tags: ["분량", "CTA"] },
];

const nowIso = () => new Date().toISOString();
const noWs = (s: string) => s.replace(/\s+/g, "").length;

// 본문 자연스러움 휴리스틱 지표
function metrics(body: string) {
  const sentences = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/(?<=[.!?다요])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  const norm = (s: string) => s.replace(/\s+/g, "");
  const seen = new Map<string, number>();
  for (const s of sentences) seen.set(norm(s), (seen.get(norm(s)) ?? 0) + 1);
  const dupSentences = [...seen.values()].filter((n) => n > 1).length;
  // 종결어미 연속 동일(기계적 나열 징후)
  const endings = sentences.map((s) => (s.match(/(습니다|해요|이에요|에요|네요|어요|니다|다)[.!?]?$/) ?? [""])[0]);
  let maxRunSameEnding = 0,
    run = 1;
  for (let i = 1; i < endings.length; i++) {
    if (endings[i] && endings[i] === endings[i - 1]) run++;
    else run = 1;
    maxRunSameEnding = Math.max(maxRunSameEnding, run);
  }
  // 상투어/AI 티 후보
  const cliche = ["바쁜 일상", "여러분", "오늘은", "소개해 드리", "함께", "어떠셨나요", "마무리"];
  const clicheHits = cliche.filter((c) => body.includes(c)).length;
  // 키워드 남발
  const kwCount = (body.match(/엔짐/g) ?? []).length;
  return {
    chars: noWs(body),
    sentenceCount: sentences.length,
    dupSentences,
    maxRunSameEnding,
    clicheHits,
    brandWordCount: kwCount,
  };
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
  return rawSqlite.prepare("SELECT title, body_md FROM drafts WHERE id = ?").get(DRAFT_ID) as {
    title: string;
    body_md: string;
  };
}

function insertReject(revision: number, feedback: string, tags: string[]) {
  rawSqlite
    .prepare(
      `INSERT INTO approvals (id, draft_id, reviewer_user_id, decision, revision, feedback, feedback_tags_json, created_at)
       VALUES (?, ?, ?, 'reject', ?, ?, ?, ?)`
    )
    .run(`rej_q_${revision}_${Math.floor(Math.random() * 1e6)}`, DRAFT_ID, ADMIN_ID, revision, feedback, JSON.stringify(tags), nowIso());
}

async function main() {
  console.log("[revtest_quality] DB:", process.env.DATABASE_URL);
  seedDraft();
  const dump: any[] = [];
  const seed = readDraft();
  dump.push({ round: 0, request: "(초안)", title: seed.title, body: seed.body_md, metrics: metrics(seed.body_md) });

  for (let i = 0; i < ROUNDS.length; i++) {
    const r = ROUNDS[i];
    await reviseDraftWithFeedback({
      draftId: DRAFT_ID,
      feedback: r.feedback,
      feedbackTags: r.tags,
      reviewerUserId: ADMIN_ID,
      callerUserId: ADMIN_ID,
    });
    insertReject(i, r.feedback, r.tags);
    const d = readDraft();
    dump.push({ round: i + 1, request: r.feedback, title: d.title, body: d.body_md, metrics: metrics(d.body_md) });
    console.log(`R${i + 1} done. metrics=`, metrics(d.body_md));
  }

  console.log("\n===== 지표 요약 =====");
  for (const d of dump) {
    const m = d.metrics;
    console.log(
      `R${d.round} chars=${m.chars} 문장=${m.sentenceCount} 중복문장=${m.dupSentences} 동일종결최대연속=${m.maxRunSameEnding} 상투어=${m.clicheHits} '엔짐'=${m.brandWordCount}`
    );
  }
  fs.writeFileSync("/tmp/revtest_quality_result.json", JSON.stringify(dump, null, 2));
  console.log("\n[saved] /tmp/revtest_quality_result.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
