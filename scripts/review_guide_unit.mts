/**
 * 단위 검증: 개정 글쓰기 가이드(review_v1) 순수 함수들.
 * resolveWritingTemplate / deriveSpeakerPersona / detectBrochureTone / reviewChecklist.
 * LLM 불필요(결정론). 실행: npx tsx scripts/review_guide_unit.mts
 */
import {
  resolveWritingTemplate,
  deriveSpeakerPersona,
  detectBrochureTone,
  reviewChecklist,
  reviewSpecBlock,
  REVIEW_V1,
  type PersonaInput,
} from "@/lib/llm/prompts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const base = (over: Partial<PersonaInput> = {}): PersonaInput => ({
  blogName: "엔짐 강남",
  niche: "프리미엄 헬스장",
  purpose: "신규 회원 유치",
  audience: "3040 직장인",
  brandVoice: "프리미엄",
  pointOfView: "first_person",
  formality: "neutral",
  ageGroup: null,
  gender: null,
  focusKeywords: [],
  forbiddenWords: [],
  ctas: [],
  qualityRules: [],
  facilities: [],
  absentFacilities: [],
  sampleSnippets: [],
  preferredLengthMin: 1500,
  preferredLengthMax: 2500,
  imagesPerPostMin: 3,
  imagesPerPostMax: 6,
  notes: null,
  ...over,
});

console.log("== resolveWritingTemplate ==");
check("1인칭 → review_v1(자동)", resolveWritingTemplate(base()) === "review_v1");
check("운영자 → standard(자동)", resolveWritingTemplate(base({ pointOfView: "owner" })) === "standard");
check("전문가 → standard(자동)", resolveWritingTemplate(base({ pointOfView: "expert" })) === "standard");
check("3인칭 → standard(자동)", resolveWritingTemplate(base({ pointOfView: "third_person" })) === "standard");
check(
  "명시 override standard(1인칭이어도)",
  resolveWritingTemplate(base({ writingTemplate: "standard" })) === "standard"
);
check(
  "명시 override review_v1(운영자여도)",
  resolveWritingTemplate(base({ pointOfView: "owner", writingTemplate: "review_v1" })) === "review_v1"
);

console.log("== deriveSpeakerPersona ==");
const sp1 = deriveSpeakerPersona(base());
check("1인칭 화자 타입=고객/방문자", /고객|방문/.test(sp1.type), JSON.stringify(sp1));
check("context에 niche/audience 반영", sp1.context.includes("프리미엄 헬스장"), JSON.stringify(sp1));
const sp2 = deriveSpeakerPersona(base({ speakerPersona: { type: "3년차 헬스러", context: "재등록 검토 중" } }));
check("명시 override 우선", sp2.type === "3년차 헬스러" && sp2.context === "재등록 검토 중");
const sp3 = deriveSpeakerPersona(base({ pointOfView: "owner" }));
check("운영자 화자 타입", /운영|근무/.test(sp3.type), JSON.stringify(sp3));

console.log("== detectBrochureTone ==");
check("'자랑합니다' 검출", detectBrochureTone("최고급 시설을 자랑합니다.").length > 0);
check("'완비하고' 검출", detectBrochureTone("주차장을 완비하고 있어요.").length > 0);
check("'차별화된 서비스' 검출", detectBrochureTone("차별화된 서비스를 제공합니다.").length > 0);
check("경험자 증언은 통과", detectBrochureTone("장비 세팅이 확실히 다르더라고요.").length === 0);

console.log("== reviewChecklist ==");
// 통과 케이스: 1인칭 + 사진3 + 흠 + 브로슈어 없음 + 구체 도입 + 이모지 헤더 없음
const goodBody = `저는 웨이트 3년차입니다. 집앞 헬스장 벤치 대기에 지쳐 엔짐을 보러 갔어요.
<!-- IMG:slot=0 -->
프리웨이트존이 넓고 대기가 없었습니다.
<!-- IMG:slot=1 -->
가격은 [슬롯: 월 회비]였어요. 상담이 인상 깊었습니다.
<!-- IMG:slot=2 -->
아쉬운 건 주차가 좀 불편하다는 점입니다. 미리 아셔야 할 것 같아요.
결국 등록했습니다. 붐비지 않는 환경을 원하는 분께 권합니다.💪`;
const goodImg = (goodBody.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
const good = reviewChecklist({ bodyMd: goodBody, imgMarkerCount: goodImg, emojiLevel: 1 });
check("정상 후기 → 미충족 0", good.failed.length === 0, good.failed.join(" | "));

// 실패 케이스: 3인칭 + 사진 부족 + 흠 없음 + 브로슈어 + 일반론 도입 + 이모지 헤더
const badBody = `## 🔥 헬스장 고를 때 중요한 것
헬스장을 고를 때 중요한 것은 여러 가지입니다. 엔짐은 최고급 시설을 자랑합니다.
완비된 최상의 서비스를 제공합니다.`;
const badImg = 0;
const bad = reviewChecklist({ bodyMd: badBody, imgMarkerCount: badImg, emojiLevel: 1 });
check("불량 글 → 사진 슬롯 미충족 검출", bad.failed.some((f) => f.includes("사진")), bad.failed.join(" | "));
check("불량 글 → 브로슈어 검출", bad.failed.some((f) => f.includes("브로슈어")), bad.failed.join(" | "));
check("불량 글 → 이모지 헤더 검출", bad.failed.some((f) => f.includes("이모지 헤더")), bad.failed.join(" | "));
check("불량 글 → 솔직한 흠 미충족", bad.failed.some((f) => f.includes("흠")), bad.failed.join(" | "));
check("불량 글 → 일반론 도입 검출", bad.failed.some((f) => f.includes("일반론")), bad.failed.join(" | "));

console.log("== reviewSpecBlock ==");
const block = reviewSpecBlock(base());
check("블록에 [슬롯] 강제 문구 포함", block.includes("[슬롯:"));
check("블록에 최소 증거 수 반영", block.includes(`${REVIEW_V1.evidenceMin}종`));
check("블록에 섹션 순서 6개", REVIEW_V1.sections.length === 6);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
