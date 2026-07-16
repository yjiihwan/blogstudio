// 글품질 2차 개선 검증: "재료 고갈 → 빈 껍데기" 수정 효과 확인.
// 답십리점과 동일 페르소나(시설 풍부·absent 공격적·POV first_person→review_v1)로
// 같은 주제("여름 상체 루틴")를 semi-auto 생성 → 상체 종목이 구체적으로 채워졌는지,
// 업체 고유 헛소리/absent 위반이 없는지 육안·자동 체크.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const { rawSqlite } = await import("../src/db/client.ts");
const { generateDraftFromBrief } = await import("../src/lib/pipeline.ts");
const { topicNeedsDomainMaterial, filterDomainMaterial } = await import("../src/lib/llm/prompts.ts");

// --- 0) 순수 함수 스모크 ---
const smoke = {
  needs_routine: topicNeedsDomainMaterial("답십리 헬스장 여름 상체 루틴은 가볍게"),
  needs_intro_false: topicNeedsDomainMaterial("엔짐 답십리점 오픈 안내"),
  filter_drops_price: filterDomainMaterial(
    ["벤치프레스는 가슴 대표 운동이다", "이 헬스장은 월 37,500원이다", "그룹수업으로 배우자"],
    ["그룹수업"]
  ),
};
console.log("SMOKE", JSON.stringify(smoke, null, 2));

const OUT = path.resolve("output/empty_content");
fs.mkdirSync(OUT, { recursive: true });
const sq = rawSqlite;
const admin = sq.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!admin) throw new Error("no admin user");

const blogId = crypto.randomUUID();
sq.prepare(
  `INSERT INTO blogs (id, naver_blog_id, display_name, niche, owner_id, status)
   VALUES (?,?,?,?,?, 'active')`
).run(blogId, "empty_verify_" + blogId.slice(0, 8), "엔짐 답십리(검증)", "프리미엄 피트니스", admin.id);

const facilities = JSON.stringify([
  "해머스트렝스·라이프휘트니스 등 고급 해외 머신 다수",
  "프리웨이트존: 렉 5대", "덤벨존 별도 구성", "유산소존: 천국의 계단 5대",
  "최신형 러닝머신 다수", "지상층 위치, 탁 트인 풍경", "아이스 아메리카노 무제한 제공",
  "샴푸·바디워시 구비된 개별 샤워부스", "7월 오픈 기념 월 37,500원 이용 이벤트",
]);
const absent = JSON.stringify([
  "그룹 운동", "그룹수업", "그룹 클래스", "클래스", "강사", "강사진", "GX",
  "PT프로그램", "개인 트레이닝 프로그램", "필라테스", "요가", "스피닝", "사우나", "수영", "골프", "키즈",
]);
const personaId = crypto.randomUUID();
sq.prepare(
  `INSERT INTO personas
   (id, blog_id, is_active, purpose, audience, brand_voice, point_of_view, formality,
    focus_keywords_json, facilities_json, absent_facilities_json, preferred_length_min, preferred_length_max)
   VALUES (?,?,1,?,?,?, 'first_person', 'neutral', ?, ?, ?, 1200, 1700)`
).run(
  personaId, blogId,
  "답십리점을 알려 신규 방문을 유도한다",
  "여름에 상체 운동을 시작하려는 30~40대",
  "진솔하고 담백한 톤. 과장 없이.",
  JSON.stringify(["답십리 헬스장", "여름 상체 루틴", "상체 운동"]),
  facilities, absent
);

const res = await generateDraftFromBrief({
  blogId,
  callerUserId: admin.id,
  title: "답십리 헬스장 여름 상체 루틴은 가볍게",
  brief: "여름에 상체 운동을 가볍게 시작하는 루틴을 소개하는 글. (운동 종목·순서 등 구체 재료는 일부러 주지 않음 — 재료 고갈 조건 재현)",
  keywords: ["답십리 헬스장", "여름 상체 루틴"],
  photoMode: "auto",
});

const body = res.bodyMd || "";
const noWs = body.replace(/\s+/g, "").length;
// 상체 대표 종목이 실제로 언급됐는지(구체성) 체크
const EXERCISES = ["벤치프레스", "벤치 프레스", "랫풀다운", "랫 풀다운", "숄더프레스", "숄더 프레스",
  "덤벨", "로우", "풀업", "친업", "딥스", "프레스", "컬", "레터럴", "래터럴", "체스트", "풀다운", "익스텐션"];
const found = [...new Set(EXERCISES.filter((e) => body.includes(e)))];
// absent 위반 체크
const norm = (s) => s.toLowerCase().replace(/[\s·・、,.]/g, "");
const absentArr = JSON.parse(absent);
const violations = absentArr.filter((a) => norm(body).includes(norm(a)));

const report = {
  charCount: noWs,
  seoIssues: JSON.parse(res.seoIssuesJson || "[]"),
  concreteExercisesFound: found,
  concreteCount: found.length,
  absentViolations: violations,
};
fs.writeFileSync(path.join(OUT, "body.md"), `# ${res.title}\n\n${body}`);
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log("REPORT", JSON.stringify(report, null, 2));
console.log("---BODY (first 1200)---\n", body.slice(0, 1200));

// 정리: 검증용 blog/persona 삭제 (FK 순서 준수)
sq.prepare("DELETE FROM draft_versions WHERE draft_id IN (SELECT id FROM drafts WHERE blog_id=?)").run(blogId);
sq.prepare("DELETE FROM image_requests WHERE draft_id IN (SELECT id FROM drafts WHERE blog_id=?)").run(blogId);
sq.prepare("DELETE FROM drafts WHERE blog_id=?").run(blogId);
sq.prepare("DELETE FROM topic_candidates WHERE blog_id=?").run(blogId);
sq.prepare("DELETE FROM personas WHERE blog_id=?").run(blogId);
sq.prepare("DELETE FROM blogs WHERE id=?").run(blogId);
console.log("cleaned up verify blog", blogId);
