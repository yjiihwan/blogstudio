/**
 * 완화 작업(2026-08-04) 실측 덤프 — 실제 코드 경로가 만들어내는 프롬프트 전문 + 게이트 판정.
 * LLM 호출 없음(결정론). 실행: npx tsx scripts/relax_prompt_dump_20260804.mts
 *
 * 2026-08-04 확장: 「베스트 후기 원문」(style_samples) 주입 결과도 함께 덤프한다.
 *   - DB 에 실제 등록된 샘플로 덤프하려면: STYLE_SAMPLE_CATEGORY=헬스 npx tsx scripts/...
 *     (DATABASE_URL 이 가리키는 DB 를 읽는다. 미지정이면 내장 예시 샘플로 블록만 보여준다.)
 */
import {
  personaPreamble,
  reviewSpecBlock,
  outlinePrompt,
  reviewRubricPrompt,
  reviewChecklist,
  countSlotPlaceholders,
  deriveSpeakerPersona,
  REVIEW_V1,
  type PersonaInput,
} from "@/lib/llm/prompts";
import { slotOverflowRejection } from "@/lib/pipeline";
import {
  styleSampleBlock,
  truncateSample,
  DEFAULT_STYLE_SAMPLE_CONFIG,
  type StyleSampleRef,
} from "@/lib/style-samples-core";
import {
  aggregateStyleMetrics,
  computeStyleMetrics,
  styleMetricsDirective,
} from "@/lib/style-metrics";

/** prod 실측 페르소나 재현 — 엔짐 영등포점(1인칭 + facilities 빈 배열). */
const ydp: PersonaInput = {
  blogName: "엔짐 영등포점",
  niche: "프리미엄 헬스장",
  purpose: "신규 회원 유치",
  audience: "영등포 직장인",
  brandVoice: "프리미엄하지만 친근하게",
  pointOfView: "first_person",
  formality: "neutral",
  ageGroup: null,
  gender: null,
  focusKeywords: ["영등포 헬스장"],
  forbiddenWords: [],
  ctas: [],
  qualityRules: [],
  facilities: [], // ← 재료 0 (사고 재현 조건)
  absentFacilities: [],
  sampleSnippets: [],
  preferredLengthMin: 1500,
  preferredLengthMax: 2500,
  imagesPerPostMin: 3,
  imagesPerPostMax: 6,
  notes: null,
};

const out: string[] = [];
const h = (t: string) => out.push(`\n${"=".repeat(78)}\n${t}\n${"=".repeat(78)}`);

h("1. personaPreamble — 시스템 프롬프트 전문 (신설 '네이버 실제 후기 문체' 포함)");
out.push(personaPreamble(ydp));

h("2. reviewSpecBlock — review_v1 지침 블록 전문");
out.push(reviewSpecBlock(ydp));

h("3. outlinePrompt — 아웃라인 지시문 (섹션 고정 → 참고 흐름)");
out.push(
  outlinePrompt({
    persona: ydp,
    topic: {
      title: "영등포 헬스장 여름 퇴근 후 운동 후기",
      angle: null,
      primaryKeyword: "영등포 헬스장",
      secondaryKeywords: [],
    },
  })
);

h("4. reviewRubricPrompt — 채점 프롬프트 (슬롯 가점 → 감점)");
out.push(
  reviewRubricPrompt({
    title: "(샘플)",
    bodyMd: "(본문 생략)",
    speaker: deriveSpeakerPersona(ydp),
  })
);

/* --- 게이트 실증: prod 사고 초안 yXQcD5utiIvb5nwt 발췌(슬롯 다수)를 그대로 통과시켜 본다 --- */
const prodBadDraft = `저는 영등포에서 일하는 3년차 직장인입니다. 퇴근 후 운동할 곳을 찾다가 엔짐을 알게 됐어요.

처음 간 날엔 입구에서 괜히 한 번 멈췄어요.

엔짐 영등포점은 방문 당시 기준으로 [슬롯: 입구 분위기/안내 동선] 쪽이 먼저 눈에 들어왔고, 운동 공간 규모는 [슬롯: 실제 운동 공간 규모 또는 층수]였어요.

기구는 [슬롯: 대표 기구 브랜드]와 [슬롯: 유산소 기구 대수]가 있었고, 프리웨이트존은 [슬롯: 프리웨이트존 규모]였습니다.

회비는 [슬롯: 1개월 회비], [슬롯: 3개월 회비], [슬롯: 12개월 회비]처럼 안내받았고, PT는 [슬롯: PT 상담 기준 가격/횟수]로 안내받았어요.

샤워실은 [슬롯: 샤워실 규모], 락커는 [슬롯: 락커 수]였습니다.

아쉬운 점은 [슬롯: 실제 아쉬웠던 점]이었어요.`;

h("5. 게이트 실증 — prod 사고 초안(슬롯 다수) 재판정");
out.push(`슬롯 개수: ${countSlotPlaceholders(prodBadDraft)}개 (허용 ${REVIEW_V1.slotMaxAllowed}개)`);
const chk = reviewChecklist({ bodyMd: prodBadDraft, imgMarkerCount: 0, emojiLevel: 1 });
out.push(`reviewChecklist 미충족: ${chk.failed.length ? chk.failed.join(" | ") : "(없음)"}`);
const rej = slotOverflowRejection(prodBadDraft);
out.push(`slotOverflowRejection: ${rej ? `반려(status=failed) — ${rej.reason}` : "통과"}`);
out.push(
  `→ 완화 전이었다면: 사진슬롯 미충족만 걸리고 슬롯은 루브릭에서 '증거 자리'로 가점 → ready_for_review 저장(실제 사고).`
);

h("6. 정상 후기(슬롯 2개, 사진 0장) — 통과해야 함");
const okDraft = `저는 영등포에서 일하는 3년차 직장인이에요. 퇴근하고 갈 헬스장을 찾다가 다녀왔습니다.

첫날이라 문이 어디에 있는지도 몰라 헤맸네요. 건물 뒤쪽에 입구가 따로 있더라고요.

운동 공간은 생각보다 넓었어요. 저녁 8시쯤 갔는데 벤치 대기가 없어서 좋았습니다.

회비는 [슬롯: 1개월 회비] 정도로 안내받았고, PT는 [슬롯: PT 상담 가격]이라고 하셨어요. 참고로 상담은 예약 없이도 됐습니다.

아쉬운 건 주차가 좀 불편하다는 점이에요. 근데 저는 지하철로 다녀서 상관없었어요.

아 여기 등록하길 잘했다 싶더라고요. 붐비는 거 싫어하시는 분이면 괜찮을 거예요.`;
out.push(`슬롯 개수: ${countSlotPlaceholders(okDraft)}개`);
const chk2 = reviewChecklist({ bodyMd: okDraft, imgMarkerCount: 0, emojiLevel: 1 });
out.push(`reviewChecklist 미충족: ${chk2.failed.length ? chk2.failed.join(" | ") : "(없음) ✅"}`);
out.push(`slotOverflowRejection: ${slotOverflowRejection(okDraft) ? "반려" : "통과 ✅"}`);

/* =========================================================================
   7. 베스트 후기 원문(style_samples) 주입 — 실제 buildSystemPreamble 이 붙이는 블록
   ========================================================================= */
const FALLBACK_SAMPLES: StyleSampleRef[] = [
  {
    title: "(내장 예시) 동네 헬스장 3개월 후기",
    body: `이사하고 나서 운동을 다시 시작했는데요. 집에서 걸어서 5분 거리라 그냥 여기로 정했어요.
근데 막상 다녀보니 저녁 시간엔 사람이 좀 많더라고요. 8시 넘어가면 벤치가 다 차 있어요.
참고로 락커는 따로 돈 안 받고 그냥 쓸 수 있었습니다. 수건도 주고요.
아무튼 3개월 끊었는데 지금까진 만족해요.`,
  },
];

async function loadFromDbOrFallback(): Promise<{
  label: string;
  samples: StyleSampleRef[];
  directive: string;
}> {
  const cat = process.env.STYLE_SAMPLE_CATEGORY?.trim();
  if (!cat) {
    // DB 미조회여도 지표 지시문이 어떻게 생겼는지는 보여준다(내장 예시로 즉석 계산).
    const agg = aggregateStyleMetrics(FALLBACK_SAMPLES.map((s) => computeStyleMetrics(s.body)));
    return {
      label: "내장 예시 샘플(DB 미조회)",
      samples: FALLBACK_SAMPLES,
      directive: styleMetricsDirective(agg),
    };
  }
  const { loadStyleSamples, getStyleSampleConfig, loadStyleMetricsDirective } = await import(
    "@/lib/style-samples"
  );
  const cfg = await getStyleSampleConfig();
  const rows = await loadStyleSamples(cat, cfg);
  return {
    label: `DB 조회 — category="${cat}", 설정 count=${cfg.count} maxChars=${cfg.maxChars}, 조회 ${rows.length}편`,
    samples: rows,
    directive: rows.length ? await loadStyleMetricsDirective(cat) : "",
  };
}

const loaded = await loadFromDbOrFallback();

h("7. styleSampleBlock — 프롬프트에 실제로 주입되는 문체 샘플 블록");
out.push(`출처: ${loaded.label}`);
out.push(
  `기본 설정: count=${DEFAULT_STYLE_SAMPLE_CONFIG.count}편 · maxChars=${DEFAULT_STYLE_SAMPLE_CONFIG.maxChars}자/편`
);
for (const s of loaded.samples) {
  const t = truncateSample(s.body, DEFAULT_STYLE_SAMPLE_CONFIG.maxChars);
  const m = computeStyleMetrics(s.body);
  out.push(
    `  - "${s.title}" ${s.body.length}자${t.truncated ? " (상한 초과 → 앞부분만 사용)" : ""}` +
      ` | 평균문장 ${m.avgSentenceChars}자 · 도입부 ${m.introType} · 상위어미 ${
        m.endings[0] ? `${m.endings[0].label} ${m.endings[0].ratio}%` : "—"
      }`
  );
}
out.push("");
out.push(
  loaded.samples.length
    ? styleSampleBlock(loaded.samples, loaded.directive)
    : "(샘플 0편 → 빈 문자열)"
);

/* --- 7-1. 지표 계산 실증: 편별 지표를 그대로 펼쳐 본다 --- */
h("7-1. 편별 문체 지표 (규칙 기반 · LLM 호출 없음)");
for (const s of loaded.samples) {
  const m = computeStyleMetrics(s.body);
  out.push(`### ${s.title}`);
  out.push(
    `  문장 평균 ${m.avgSentenceChars}자 / 중앙값 ${m.medianSentenceChars}자 / 최장 ${m.longestSentence.chars}자 / 최단 ${m.shortestSentence.chars}자`
  );
  out.push(
    `  ${m.paragraphCount}문단 · ${m.sentenceCount}문장 · 문단당 ${m.avgSentencesPerParagraph}문장 · 총 ${m.totalChars}자(공백제외 ${m.totalCharsNoSpace}자)`
  );
  out.push(`  종결어미: ${m.endings.map((e) => `${e.label} ${e.ratio}%`).join(" · ") || "—"}`);
  out.push(`  도입부: ${m.introType}${m.introEvidence ? ` (${m.introEvidence})` : ""}`);
  out.push(
    `  군말: ${m.fillers.map((f) => `${f.label} ${f.count}회`).join(" · ") || "—"} (1000자당 ${m.fillerPer1000}회)`
  );
  out.push(
    `  문어체·번역투: ${m.formal.items.map((f) => `${f.label} ${f.count}회`).join(" · ") || "없음"} · 피동형 ${m.formal.passiveCount}회 (1000자당 ${m.formal.per1000}회)`
  );
  out.push("");
}

h("7-2. styleMetricsDirective — 프롬프트에 들어가는 «목표 문체» 자연어 지시문");
out.push(loaded.directive || "(집계 불가 → 빈 문자열)");

h("8. 회귀 검사 — 샘플 0편이면 블록이 완전히 비어야 한다(기존 프롬프트 그대로)");
const emptyBlock = styleSampleBlock([]);
out.push(`styleSampleBlock([]) === "" : ${emptyBlock === "" ? "✅ 통과" : "❌ 실패"}`);
out.push(
  `본문이 공백뿐인 샘플도 제외되는가: ${
    styleSampleBlock([{ title: "빈 글", body: "   " }]) === "" ? "✅ 통과" : "❌ 실패"
  }`
);
out.push(
  `지표 지시문이 있어도 샘플 0편이면 비는가: ${
    styleSampleBlock([], loaded.directive) === "" ? "✅ 통과" : "❌ 실패"
  }`
);
out.push(
  `aggregateStyleMetrics([]) === null : ${aggregateStyleMetrics([]) === null ? "✅ 통과" : "❌ 실패"}`
);
out.push(
  `styleMetricsDirective(null) === "" : ${styleMetricsDirective(null) === "" ? "✅ 통과" : "❌ 실패"}`
);

console.log(out.join("\n"));
