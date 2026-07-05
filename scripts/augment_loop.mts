/**
 * 검증: 정보 부족 시 대화형 보강 루프 (conversational augmentation).
 * 실행: npx tsx scripts/augment_loop.mts
 *
 * 파이프라인이 쓰는 실제 export 함수(assessInsufficiency / assessSupplementProgress /
 * isLengthUnfillable / buildGroundingText / augmentedPreamble)를 파이프라인과 동일한 순서로
 * 구동해 4개 시나리오를 검증한다. LLM/DB 불필요(게이트 로직은 순수 함수).
 *
 *  (1) 정보 부족 → 되묻기 발동
 *  (2) 추가 정보 입력 → 재생성 + 누적 반영(이전 요청+받은 정보 전부)
 *  (3) 무의미/동일 재입력 → 루프 종료 + 한계 고지
 *  (4) 정상 충분 케이스 → 되묻지 않고 바로 생성
 */
import {
  assessInsufficiency,
  assessSupplementProgress,
  isLengthUnfillable,
  buildGroundingText,
  augmentedPreamble,
  limitationNotice,
  type PersonaInput,
} from "@/lib/llm/prompts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const persona = (over: Partial<PersonaInput> = {}): PersonaInput => ({
  blogName: "테스트업체", niche: null, purpose: "", audience: "", brandVoice: "",
  pointOfView: "first_person", formality: "neutral", ageGroup: null, gender: null,
  focusKeywords: [], forbiddenWords: [], ctas: [], qualityRules: [],
  facilities: [], absentFacilities: [], sampleSnippets: [],
  preferredLengthMin: 1800, preferredLengthMax: 2400, imagesPerPostMin: 1, imagesPerPostMax: 3,
  notes: null, ...over,
});

/** 파이프라인의 mergeAugment + 착수 전 게이트 결정을 그대로 재현한다. */
type Decision =
  | { action: "ask"; missing: string[] }
  | { action: "generate"; supplements: string[]; limited: boolean };
function decidePreGate(
  p: PersonaInput,
  opts: { lengthTarget?: number | null; userBrief?: string },
  augment: { supplements: string[]; newSupplement?: string }
): Decision {
  // mergeAugment
  const prior = augment.supplements.filter((s) => s && s.trim());
  const incoming = augment.newSupplement?.trim();
  let supplements = prior;
  let stalled = false;
  if (incoming) {
    const prog = assessSupplementProgress(prior, incoming);
    if (prog.progressed) supplements = [...prior, incoming];
    else stalled = true;
  }
  // 착수 전 판정
  const report = assessInsufficiency(p, { lengthTarget: opts.lengthTarget, userBrief: opts.userBrief, supplements });
  if (!report.sufficient && !stalled) return { action: "ask", missing: report.missingFields };
  return { action: "generate", supplements, limited: !report.sufficient && stalled };
}

const TARGET = 2100;

console.log("\n== 시나리오 1: 정보 부족 → 되묻기 발동 ==");
{
  // 목적·타겟·톤 공백 + 시설 없음 + 목표 2100자 → ①② 모두 신호
  const p = persona();
  const d = decidePreGate(p, { lengthTarget: TARGET }, { supplements: [] });
  check("되묻기(ask) 상태로 전환", d.action === "ask", `→ ${JSON.stringify(d)}`);
  if (d.action === "ask") {
    check("무엇이 부족한지 구체 안내(필드 목록 존재)", d.missing.length > 0, `missing=${d.missing}`);
    const report = assessInsufficiency(p, { lengthTarget: TARGET, supplements: [] });
    check("안내문에 '정보' 요청 문구 포함", /정보가 조금 부족|알려주시면/.test(report.requestMessage));
    console.log("    · 안내문 예시:\n" + report.requestMessage.split("\n").map((l) => "      " + l).join("\n"));
  }
}

console.log("\n== 시나리오 2: 추가 정보 입력 → 재생성 + 누적 반영 ==");
{
  const p = persona();
  // 라운드1: 부족 → ask
  const r1 = decidePreGate(p, { lengthTarget: TARGET }, { supplements: [] });
  check("R1 되묻기", r1.action === "ask");

  // 라운드2: 톤/목적/타겟을 담은 충분한 보강 입력 제출
  const supp1 = "타겟은 20~30대 직장인. 목적은 신규 회원 등록 유도. 톤은 친근한 존댓말. 제공 서비스는 1:1 PT, 그룹 GX, 인바디 측정, 식단 코칭, 24시간 개방입니다.";
  const r2 = decidePreGate(p, { lengthTarget: TARGET }, { supplements: [], newSupplement: supp1 });
  check("R2 충분해져 생성(generate)로 전환", r2.action === "generate", `→ ${JSON.stringify(r2).slice(0,120)}`);
  if (r2.action === "generate") {
    check("보강 입력이 누적에 반영(supplements 1건)", r2.supplements.length === 1 && r2.supplements[0] === supp1);
    check("한계 고지 아님(정상 진전)", r2.limited === false);
    // 누적 정보가 grounding + preamble 에 실제로 반영되는가
    const grounding = buildGroundingText(p, { title: "헬스장 이용 가이드", supplements: r2.supplements });
    check("누적 정보가 grounding 근거로 편입(PT·식단 코칭 포함)", /1:1 PT|식단 코칭/.test(grounding));
    const pre = augmentedPreamble("BASE_PREAMBLE", r2.supplements);
    check("누적 정보가 시스템 프리앰블에 주입", pre.includes("사용자가 추가로 제공한 확정 정보") && pre.includes("식단 코칭"));
  }

  // 라운드3: 이전 정보 유지한 채 새 정보 추가 → 이전+신규 모두 누적
  const supp2 = "주차는 건물 지하 2시간 무료, 위치는 강남역 3번 출구 도보 5분입니다.";
  const r3 = decidePreGate(p, { lengthTarget: TARGET }, { supplements: r2.action === "generate" ? r2.supplements : [], newSupplement: supp2 });
  check("R3 이전 요청+받은 정보 전부 누적(2건, 리프레시 없음)",
    r3.action === "generate" && r3.supplements.length === 2 && r3.supplements[0] === supp1 && r3.supplements[1] === supp2,
    `→ ${r3.action === "generate" ? r3.supplements.length : r3.action}`);
}

console.log("\n== 시나리오 3: 무의미/동일 재입력 → 루프 종료 + 한계 고지 ==");
{
  const p = persona();
  // 이미 한 번 받은 정보(불충분)를 누적한 상태
  const prior = ["헬스장입니다"]; // 4자 미만 앵커 — 여전히 부족

  // (a) 공백/무의미 재입력
  const dEmpty = decidePreGate(p, { lengthTarget: TARGET }, { supplements: prior, newSupplement: "   ..  " });
  check("(a) 무의미 입력 → 루프 종료(generate)", dEmpty.action === "generate", `→ ${dEmpty.action}`);
  check("(a) 한계 고지 플래그 on", dEmpty.action === "generate" && dEmpty.limited === true);

  // (b) 직전 제출과 사실상 동일(정규화 동일)
  const dupInput = "헬스장 입니다.."; // 정규화하면 prior[0]와 동일
  const prog = assessSupplementProgress(prior, dupInput);
  check("(b) 정규화 비교로 '동일' 판정(progressed=false)", prog.progressed === false && prog.reason === "duplicate", `→ ${JSON.stringify(prog)}`);
  const dDup = decidePreGate(p, { lengthTarget: TARGET }, { supplements: prior, newSupplement: dupInput });
  check("(b) 동일 재입력 → 루프 종료(generate)", dDup.action === "generate");
  check("(b) 누적은 늘지 않음(중복 미반영)", dDup.action === "generate" && dDup.supplements.length === 1);
  check("(b) 한계 고지 문구 생성", limitationNotice(["material"]).includes("정보 부족으로 일부 내용을 일반화"));

  // 대조: 실질적으로 새로운 내용이면 계속 되묻는다(루프 유지)
  const progNew = assessSupplementProgress(prior, "PT 3회권 15만원, 필라테스 소도구 수업 신설");
  check("(대조) 실질 진전 있으면 progressed=true", progNew.progressed === true);
}

console.log("\n== 시나리오 4: 정상 충분 케이스 → 바로 생성 ==");
{
  // 필수 필드 채워짐 + 시설 다수 → 앵커 충분
  const p = persona({
    purpose: "신규 회원 유치", audience: "20~40대 직장인", brandVoice: "친근한 존댓말",
    facilities: ["1:1 PT", "그룹 GX", "필라테스", "인바디 측정", "샤워실", "주차장"],
    focusKeywords: ["강남 헬스장", "PT"], qualityRules: ["과장 광고 금지"],
  });
  const d = decidePreGate(p, { lengthTarget: TARGET }, { supplements: [] });
  check("되묻지 않고 바로 생성(generate)", d.action === "generate", `→ ${d.action}`);
  check("한계 고지 없음", d.action === "generate" && d.limited === false);
  const report = assessInsufficiency(p, { lengthTarget: TARGET, supplements: [] });
  check("sufficient=true", report.sufficient === true);
}

console.log("\n== 생성 중 폴백(③): 목표 미달 + 근거없는 확장이 factGuard에 걸림 ==");
{
  // 목표 2100자인데 950자에서 정체 + 미검증 주장(가격·수상) 잔존 → 사실 소재 부족
  check("미달+날조 → unfillable=true",
    isLengthUnfillable({ reachedChars: 950, lengthTarget: 2100, fabricationKinds: ["가격·금액", "수상·인증·순위"] }) === true);
  // 목표 근접(1600/2100=76%>70%)이면 폴백 아님
  check("목표 근접이면 unfillable=false",
    isLengthUnfillable({ reachedChars: 1600, lengthTarget: 2100, fabricationKinds: ["가격·금액"] }) === false);
  // 미달이어도 날조 흔적 없으면(정상 확장 가능) 폴백 아님
  check("날조 없으면 unfillable=false",
    isLengthUnfillable({ reachedChars: 900, lengthTarget: 2100, fabricationKinds: [] }) === false);
  // 목표 길이 미지정이면 폴백 아님
  check("목표 미지정이면 unfillable=false",
    isLengthUnfillable({ reachedChars: 900, lengthTarget: null, fabricationKinds: ["가격·금액"] }) === false);
}

console.log(`\n${fail === 0 ? "✅ 전 시나리오 통과" : "❌ 실패 있음"} — pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
