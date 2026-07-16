// 실생성 육안검증: 같은 주제("직원이 회원에게 여름 운동 루틴 소개")·같은 엔짐 페르소나에서
//   A) 화자 미지정(페르소나=고객 1인칭)  → 하위호환 baseline(고객 후기 톤 나옴 = 문제 재현)
//   B) 화자=owner 지정                    → 근본수정 효과(직원/운영자 톤으로 전환)
//   C) [원인검증] 페르소나 POV를 owner로 바꾸고 미지정 → POV가 화자를 좌우함 확인
// 실제 파이프라인으로 생성해 화자 마커를 세고 output/brief_speaker/ 에 저장.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const { rawSqlite } = await import("../src/db/client.ts");
const { generateDraftFromBrief } = await import("../src/lib/pipeline.ts");

const OUT = path.resolve("output/brief_speaker");
fs.mkdirSync(OUT, { recursive: true });
const sq = rawSqlite;

const admin = sq.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!admin) throw new Error("no admin user");

const blogId = crypto.randomUUID();
sq.prepare(
  `INSERT INTO blogs (id, naver_blog_id, display_name, niche, owner_id, status)
   VALUES (?,?,?,?,?, 'active')`
).run(blogId, "spk_verify_" + blogId.slice(0, 8), "엔짐 강남 (화자검증)", "프리미엄 피트니스", admin.id);

const personaId = crypto.randomUUID();
const facilities = JSON.stringify(["최신 수입 웨이트 머신", "1:1 PT룸", "프리미엄 샤워/라운지", "그룹 필라테스 스튜디오"]);
sq.prepare(
  `INSERT INTO personas
   (id, blog_id, is_active, purpose, audience, brand_voice, point_of_view, formality,
    focus_keywords_json, facilities_json, absent_facilities_json, preferred_length_min, preferred_length_max)
   VALUES (?,?,1,?,?,?, 'first_person', 'neutral', ?, ?, '[]', 1400, 1900)`
).run(
  personaId, blogId,
  "엔짐 강남점을 알려 신규 방문을 유도한다",
  "운동을 다시 시작하려는 30~40대 직장인",
  "진솔하고 담백한 톤. 프리미엄 시설을 과장 없이.",
  JSON.stringify(["엔짐 강남", "여름 운동 루틴", "PT"]), facilities
);

const TITLE = "여름 운동 루틴, 엔짐 강남에서 이렇게 시작하세요";
const BRIEF =
  "엔짐 강남점 직원이 회원에게 여름철 운동 루틴을 소개하는 글. " +
  "주 3~4회 기준 상·하체 분할, 유산소 배치, 최신 수입 웨이트 머신과 1:1 PT룸 활용법, 샤워/라운지로 마무리하는 동선. " +
  "직원이 회원에게 안내하듯 친절하게. 약 1600자.";

// 화자 마커 사전
const OWNER_RE = /(저희|갖춰|마련했|준비했|찾아주|안내해|운영하|저희 엔짐|이렇게 두었|비치해)/g;
const CUSTOMER_RE = /(다녀왔|가보니|방문해보|등록했|등록하면서|추천하고 싶|받아보니|다녀온|가봤|첫 방문에)/g;
const NARRATIVE_RE = /(저는 |제가 |쉬다가|망설|두려움|다시 잡|복귀하)/g;

function analyze(md) {
  const owner = (md.match(OWNER_RE) || []).length;
  const customer = (md.match(CUSTOMER_RE) || []).length;
  const narr = (md.match(NARRATIVE_RE) || []).length;
  return { owner, customer, narr, chars: md.replace(/\s+/g, "").length };
}

async function gen(label, { speaker, personaPov }) {
  sq.prepare("UPDATE personas SET point_of_view=? WHERE id=?").run(personaPov, personaId);
  const placeholderId = crypto.randomUUID();
  sq.prepare("INSERT INTO drafts (id, blog_id, title, status) VALUES (?,?,?, 'draft')")
    .run(placeholderId, blogId, TITLE);
  process.stderr.write(`\n[gen] ${label} (speaker=${speaker ?? "미지정"}, personaPOV=${personaPov}) …\n`);
  const t0 = Date.now();
  const res = await generateDraftFromBrief({
    blogId, callerUserId: admin.id, title: TITLE, brief: BRIEF,
    keywords: ["엔짐 강남", "여름 운동 루틴"], photoMode: "auto",
    existingDraftId: placeholderId, speaker,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  const body = res.bodyMd || "";
  const a = analyze(body);
  fs.writeFileSync(path.join(OUT, `${label}.md`), body, "utf8");
  process.stderr.write(`[gen] ${label} 완료(${dt}s) — owner:${a.owner} customer:${a.customer} narrative:${a.narr} ${a.chars}자\n`);
  return { label, speaker: speaker ?? "미지정", personaPov, ...a };
}

const results = [];
results.push(await gen("A_persona1p_no_speaker", { speaker: undefined, personaPov: "first_person" }));
results.push(await gen("B_persona1p_speaker_owner", { speaker: "owner", personaPov: "first_person" }));
results.push(await gen("C_personaOwner_no_speaker", { speaker: undefined, personaPov: "owner" }));

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2), "utf8");

// 정리: 임시 블로그 제거
sq.prepare("DELETE FROM drafts WHERE blog_id=?").run(blogId);
sq.prepare("DELETE FROM personas WHERE blog_id=?").run(blogId);
sq.prepare("DELETE FROM blogs WHERE id=?").run(blogId);

process.stderr.write("\n=== SUMMARY (owner마커↑ = 직원톤 / customer·narrative↑ = 고객후기톤) ===\n");
for (const r of results) {
  process.stderr.write(`${r.label}: owner ${r.owner} · customer ${r.customer} · narrative ${r.narr} · ${r.chars}자\n`);
}
process.exit(0);
