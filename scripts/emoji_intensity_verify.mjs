// 이모지 강도 0/2/3 실생성 육안검증 하니스.
// 같은 주제·같은 페르소나에서 emoji_intensity 만 바꿔 실제 파이프라인으로 본문을 생성하고,
// 이모지 개수/문단별 배치를 분석해 output/emoji_verify/ 에 저장한다.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const { rawSqlite } = await import("../src/db/client.ts");
const { generateDraftFromBrief } = await import("../src/lib/pipeline.ts");

const OUT = path.resolve("output/emoji_verify");
fs.mkdirSync(OUT, { recursive: true });

const sq = rawSqlite;
// admin 유저 (system/openai)
const admin = sq.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!admin) throw new Error("no admin user");

// 테스트 블로그 + 페르소나(엔짐 프리미엄 피트니스, 1인칭 후기) 1회 생성
const blogId = crypto.randomUUID();
sq.prepare(
  `INSERT INTO blogs (id, naver_blog_id, display_name, niche, owner_id, status)
   VALUES (?,?,?,?,?, 'active')`
).run(blogId, "emoji_verify_" + blogId.slice(0, 8), "엔짐 강남 (이모지검증)", "프리미엄 피트니스", admin.id);

const personaId = crypto.randomUUID();
const facilities = JSON.stringify(["최신 수입 웨이트 머신", "1:1 PT룸", "프리미엄 샤워/라운지", "그룹 필라테스 스튜디오"]);
sq.prepare(
  `INSERT INTO personas
   (id, blog_id, is_active, purpose, audience, brand_voice, point_of_view, formality,
    focus_keywords_json, facilities_json, absent_facilities_json, preferred_length_min, preferred_length_max)
   VALUES (?,?,1,?,?,?, 'first_person', 'neutral', ?, ?, '[]', 1500, 2200)`
).run(
  personaId, blogId,
  "엔짐 강남점 방문 경험을 진솔한 후기로 전달해 신규 방문을 유도한다",
  "운동을 다시 시작하려는 30~40대 직장인",
  "따뜻하고 진솔한 경험담. 과장 없이 담백하되 감정이 실린 순간엔 온도를 낸다.",
  personaId, facilities // focus_keywords 임시로 아무거나(비어있지 않게)
);
// focus_keywords 를 제대로
sq.prepare("UPDATE personas SET focus_keywords_json=? WHERE id=?")
  .run(JSON.stringify(["엔짐 강남", "헬스장 후기", "PT"]), personaId);

const TITLE = "엔짐 강남점 2주 다녀본 솔직 후기";
const BRIEF =
  "운동을 몇 년 쉬다가 엔짐 강남점을 2주간 다녀본 개인 후기. 처음 등록할 때의 망설임, " +
  "최신 수입 머신과 1:1 PT룸을 써본 느낌, 샤워/라운지 시설, 2주 뒤 몸과 마음의 변화. " +
  "시설은 담백하게 사실 위주로, 감정이 올라오는 순간(첫 등록의 두려움·PT 후 성취감·2주 뒤 뿌듯함)엔 솔직하게. 약 1800자.";

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function analyze(bodyMd) {
  const total = (bodyMd.match(EMOJI_RE) || []).length;
  const lines = bodyMd.split(/\n/);
  const headerEmoji = lines.filter((l) => /^#{1,6}\s/.test(l) && EMOJI_RE.test(l)).length;
  const paras = bodyMd.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const perPara = paras.map((p) => (p.match(EMOJI_RE) || []).length);
  const paraWith = perPara.filter((n) => n > 0).length;
  return { total, headerEmoji, paraCount: paras.length, paraWith, perPara };
}

const results = [];
for (const level of [0, 2, 3]) {
  sq.prepare("UPDATE personas SET emoji_intensity=? WHERE id=?").run(level, personaId);
  // 백그라운드 경로와 동일하게 placeholder draft 후 existingDraftId 로 되묻기 우회
  const placeholderId = crypto.randomUUID();
  sq.prepare(
    "INSERT INTO drafts (id, blog_id, title, status) VALUES (?,?,?, 'draft')"
  ).run(placeholderId, blogId, TITLE);

  process.stderr.write(`\n[gen] level ${level} 생성 시작…\n`);
  const t0 = Date.now();
  const res = await generateDraftFromBrief({
    blogId,
    callerUserId: admin.id,
    title: TITLE,
    brief: BRIEF,
    keywords: ["엔짐 강남", "헬스장 후기"],
    photoMode: "auto",
    existingDraftId: placeholderId,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  const body = res.bodyMd || "";
  const a = analyze(body);
  fs.writeFileSync(path.join(OUT, `level_${level}.md`), body, "utf8");
  results.push({ level, dt, ...a, chars: body.replace(/\s+/g, "").length });
  process.stderr.write(
    `[gen] level ${level} 완료 (${dt}s) — 이모지 ${a.total}개 / 문단 ${a.paraWith}/${a.paraCount}에 분포 / 헤더이모지 ${a.headerEmoji} / ${body.replace(/\s+/g, "").length}자\n`
  );
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2), "utf8");
process.stderr.write("\n=== SUMMARY ===\n");
for (const r of results) {
  process.stderr.write(
    `level ${r.level}: 총 ${r.total} · 문단분포 ${r.perPara.join(",")} · 헤더이모지 ${r.headerEmoji} · ${r.chars}자\n`
  );
}
process.exit(0);
