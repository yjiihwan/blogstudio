// 결정론 검증(LLM 무호출): 초안 brief 화자 지정이 프리앰블·프롬프트·템플릿에 실제로 반영되는지.
// applyBriefSpeaker → personaPreamble / outlinePrompt / bodyPrompt / resolveWritingTemplate 를 조립해 단언한다.
import assert from "node:assert";

const {
  applyBriefSpeaker,
  personaPreamble,
  outlinePrompt,
  bodyPrompt,
  resolveWritingTemplate,
  deriveSpeakerPersona,
} = await import("../src/lib/llm/prompts.ts");

// 기준 페르소나: 엔짐 프리미엄 피트니스, 고객 1인칭(first_person)
const base = {
  blogName: "엔짐 강남",
  niche: "프리미엄 피트니스",
  purpose: "방문 유도",
  audience: "30~40대 직장인",
  brandVoice: "진솔",
  pointOfView: "first_person",
  formality: "neutral",
  focusKeywords: ["엔짐 강남"],
  forbiddenWords: [],
  ctas: ["방문 상담 예약"],
  qualityRules: [],
  facilities: ["수입 웨이트 머신", "1:1 PT룸"],
  absentFacilities: [],
  sampleSnippets: [],
  preferredLengthMin: 1500,
  preferredLengthMax: 2200,
  imagesPerPostMin: 3,
  imagesPerPostMax: 5,
  emojiIntensity: null,
  notes: null,
};
const topic = { title: "여름 운동 루틴", angle: null, primaryKeyword: "엔짐 강남", secondaryKeywords: [] };
const brief = "직원이 회원에게 여름 운동 루틴을 소개";

const cases = [
  { name: "미지정(하위호환)", speaker: undefined },
  { name: "owner(운영자·직원)", speaker: "owner" },
  { name: "first_person(고객후기)", speaker: "first_person" },
  { name: "expert(전문가)", speaker: "expert" },
];

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✅", msg); } else { fail++; console.log("  ❌", msg); } };

for (const c of cases) {
  const p = applyBriefSpeaker(base, c.speaker);
  const preamble = personaPreamble(p);
  const tmpl = resolveWritingTemplate(p);
  const sp = deriveSpeakerPersona(p);
  const body = bodyPrompt({ persona: p, topic, outline: {}, userBrief: brief });
  const outline = outlinePrompt({ persona: p, topic, userBrief: brief });
  console.log(`\n[${c.name}] pov=${p.pointOfView} template=${tmpl} speaker="${sp.type}"`);

  if (c.speaker === undefined) {
    ok(p.pointOfView === "first_person", "미지정 → 페르소나 POV(first_person) 그대로");
    ok(tmpl === "review_v1", "미지정 → 고객 1인칭이라 review_v1 유지");
    ok(preamble.includes("고객 1인칭 경험담"), "프리앰블 화법=고객 1인칭");
  }
  if (c.speaker === "owner") {
    ok(p.pointOfView === "owner", "owner 지정 → POV=owner 로 덮어씀");
    ok(tmpl === "standard", "owner → review 게이트 OFF(standard)");
    ok(preamble.includes("운영자·직원 1인칭"), "프리앰블 화법=운영자·직원 1인칭");
    ok(preamble.includes("방문 고객 후기 톤이 절대 아니다"), "프리앰블에 '고객 후기 톤 금지' 명시");
    ok(!body.includes("개정 글쓰기 가이드 (review_v1"), "본문 프롬프트에 review_v1 블록 미포함");
    ok(sp.type.includes("운영·근무"), "화자 도출=운영·근무하는 사람");
  }
  if (c.speaker === "first_person") {
    ok(tmpl === "review_v1", "first_person 지정 → review_v1 ON");
    ok(preamble.includes("고객 1인칭 경험담"), "프리앰블 화법=고객 1인칭");
  }
  if (c.speaker === "expert") {
    ok(p.pointOfView === "expert", "expert 지정 → POV=expert");
    ok(tmpl === "standard", "expert → review 게이트 OFF(standard)");
    ok(preamble.includes("전문가 해설"), "프리앰블 화법=전문가 해설");
  }
  // 공통: userBrief 는 여전히 반영(주제·내용)
  ok(outline.includes("사용자 지정 내용"), "outline 에 사용자 brief 블록 유지");
}

// 원본 불변(부작용 없음)
assert.strictEqual(base.pointOfView, "first_person", "base persona 불변");
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
