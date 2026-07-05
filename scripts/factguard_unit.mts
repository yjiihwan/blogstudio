/**
 * 단위 검증: findFabricationHits(업종 무관 결정론 탐지기) + buildGroundingText.
 * LLM 불필요. 근거 없는 구체 주장은 잡고, 근거 있는 값·incidental 숫자는 통과해야 한다.
 * 실행: npx tsx scripts/factguard_unit.mts
 */
import { findFabricationHits, buildGroundingText, type PersonaInput } from "@/lib/llm/prompts";

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

const basePersona = (over: Partial<PersonaInput> = {}): PersonaInput => ({
  blogName: "테스트업체",
  niche: null,
  purpose: "",
  audience: "",
  brandVoice: "",
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
  preferredLengthMin: 1000,
  preferredLengthMax: 2000,
  imagesPerPostMin: 1,
  imagesPerPostMax: 3,
  notes: null,
  ...over,
});

const kinds = (text: string, g: string, absent: string[] = []) =>
  findFabricationHits(text, g, absent).map((h) => `${h.kind}:${h.match}`);

console.log("== A. 근거 없는 구체 주장은 검출 ==");
const g0 = ""; // 확정 사실 없음
check("가격(15,000원) 검출", kinds("메뉴는 15,000원입니다.", g0).some((x) => x.startsWith("가격")));
check("연혁(20년 전통) 검출", kinds("저희는 20년 전통의 맛집입니다.", g0).some((x) => x.startsWith("연혁")));
check("수상(미쉐린) 검출", kinds("미쉐린에 선정되었습니다.", g0).some((x) => x.startsWith("수상")));
check("순위(1위) 검출", kinds("지역 1위 학원입니다.", g0).some((x) => x.startsWith("수상")));
check(
  "실적%(만족도 98%) 검출",
  kinds("수강생 만족도 98%를 자랑합니다.", g0).some((x) => x.startsWith("실적"))
);
check("규모(5호점) 검출", kinds("현재 5호점까지 운영 중입니다.", g0).some((x) => x.startsWith("규모")));
check(
  "평점(후기 300개) 검출",
  kinds("네이버 후기 300개가 쌓였습니다.", g0).some((x) => x.startsWith("평점"))
);

console.log("== B. 근거 있는 값·incidental 숫자는 통과(오탐 없음) ==");
check(
  "grounding에 있는 가격은 통과",
  kinds("수업료는 30만 원입니다.", "- 확정: 수업료 30만 원").length === 0,
  JSON.stringify(kinds("수업료는 30만 원입니다.", "- 확정: 수업료 30만 원"))
);
check("시각(오후 6시)은 미검출", kinds("오후 6시에 문을 엽니다.", g0).length === 0);
check("층수(3층)는 미검출", kinds("건물 3층에 있습니다.", g0).length === 0);
check(
  "일반 %(체지방)는 실적문맥 아니면 통과",
  kinds("사람마다 체감이 다릅니다. 20% 정도요.", g0).length === 0,
  JSON.stringify(kinds("사람마다 체감이 다릅니다. 20% 정도요.", g0))
);

console.log("== C. 없는 시설(빈 absent여도 안전) + grounding 빌더 ==");
const p1 = basePersona({ absentFacilities: ["수영", "주차장"], facilities: ["웨이트존"] });
check("없는 시설(수영) 검출", kinds("실내 수영도 가능합니다.", "", p1.absentFacilities).some((x) => x.startsWith("없는 시설")));
check("absent 비어도 크래시 없음", findFabricationHits("아무 텍스트 12345원", "").length >= 0);
const gt = buildGroundingText(p1, { title: "제목", primaryKeyword: "헬스장", userBrief: "신규 이벤트 안내" });
check("grounding에 확정 시설 포함", gt.includes("웨이트존"));
check("grounding에 사용자 입력 포함", gt.includes("신규 이벤트 안내"));
check("grounding에 상호 포함", gt.includes("테스트업체"));

console.log(`\n===== 결과: ${pass} pass / ${fail} fail =====`);
process.exit(fail === 0 ? 0 : 1);
