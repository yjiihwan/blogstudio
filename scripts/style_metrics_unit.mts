/**
 * 단위 검증: 문체 지표(style-metrics) 순수 함수.
 * LLM·DB 불필요(결정론). 실행: npx tsx scripts/style_metrics_unit.mts
 */
import {
  computeStyleMetrics,
  aggregateStyleMetrics,
  styleMetricsDirective,
  parseStyleMetrics,
  splitParagraphs,
  splitSentences,
  STYLE_METRICS_VERSION,
} from "@/lib/style-metrics";
import { styleSampleBlock } from "@/lib/style-samples-core";

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
const h = (t: string) => console.log(`\n── ${t} ──`);

/* ========== 1. 문단·문장 분리 ========== */
h("1. 문단·문장 분리");
check("빈 줄로 문단 분리", splitParagraphs("가나다.\n\n라마바.").length === 2);
check(
  "빈 줄이 없으면 줄 = 문단(네이버 붙여넣기 형태)",
  splitParagraphs("가나다.\n라마바.\n사아자.").length === 3
);
check("마침표로 문장 분리", splitSentences("첫 문장이다. 둘째 문장이다.").length === 2);
check(
  "마침표가 없어도 줄바꿈이 경계",
  splitSentences("마침표 없는 첫 줄\n마침표 없는 둘째 줄").length === 2
);
check("공백만 있는 본문 = 0문장", computeStyleMetrics("   \n\n  ").sentenceCount === 0);

/* ========== 2. 종결어미 ========== */
h("2. 종결어미 라벨 (형태소 기준 — 3글자 자르기 금지)");
const endingOf = (s: string) => computeStyleMetrics(s).endings[0]?.label ?? "(없음)";
check("~더라고요", endingOf("생각보다 사람이 많더라고요.") === "~더라고요", endingOf("많더라고요."));
check(
  "«만족해요» 가 ~족해요 로 잘리지 않는다",
  endingOf("전체적으로 만족해요.") === "~해요",
  endingOf("만족해요.")
);
check("~했어요", endingOf("어제 처음 가봤어요. 진짜 좋았어요.") !== "(없음)");
check("~습니다체", endingOf("수건도 함께 제공합니다.") === "~습니다체");
check("~네요", endingOf("생각보다 넓네요.") === "~네요");
check("~거든요", endingOf("제가 원래 겁이 많거든요.") === "~거든요");
check("~인데요/는데요", endingOf("가격은 좀 있는데요.") === "~인데요/는데요");
check("~예요/이에요", endingOf("여기가 제 단골이에요.") === "~예요/이에요");
check("질문형 어미", endingOf("다들 어떻게 하시나요?") === "~까요?/나요?");
check("해라체 과거", endingOf("나는 어제 헬스장에 갔었다.") === "~었다(과거)");
check("음슴체", endingOf("오늘도 운동함") === "~음/슴(음슴체)");
check(
  "비율 합이 100 근처(상위 5 기준)",
  computeStyleMetrics("좋아요.\n좋아요.\n좋아요.\n좋아요.").endings[0].ratio === 100
);

/* ========== 3. 도입부 유형 ========== */
h("3. 도입부 유형");
const introOf = (s: string) => computeStyleMetrics(s).introType;
check("질문형", introOf("헬스장 고를 때 뭐부터 보시나요?\n저는 거리부터 봤어요.") === "질문형");
check(
  "결론선제시",
  introOf("결론부터 말하면 재등록했어요.\n이유는 아래에 적을게요.") === "결론선제시"
);
check(
  "장면묘사",
  introOf("어제 퇴근하고 처음 가봤어요.\n입구에서 잠깐 멈췄네요.") === "장면묘사"
);
check(
  "상황설명",
  introOf("요즘 어깨가 안 좋아서 알아보다가 등록했어요.\n집이랑 가까웠거든요.") === "상황설명"
);
check("자기소개", introOf("저는 영등포 사는 직장인입니다.\n운동은 3년차예요.") === "자기소개");
check(
  "«이사 오고 나서 … 돌아봤는데요» 도 상황설명 (staging 실측 반영)",
  introOf("이사 오고 나서 근처 카페를 하나씩 돌아봤는데요.\n결국 여기로 정착했어요.") ===
    "상황설명",
  introOf("이사 오고 나서 근처 카페를 하나씩 돌아봤는데요.\n결국 여기로 정착했어요.")
);
check(
  "판별 안 되면 unknown (억지 분류 금지)",
  introOf("가나다라마바사.\n아자차카타파하.") === "unknown"
);

/* ========== 4. 군말 · 문어체 ========== */
h("4. 군말 · 문어체·번역투");
const m4 = computeStyleMetrics("근데 진짜 그냥 좀 좋았어요.\n솔직히 또 갈 것 같아요.");
check(
  "군말을 잡는다",
  ["근데", "진짜", "그냥", "좀", "솔직히"].every((w) =>
    m4.fillers.some((f) => f.label === w)
  ),
  JSON.stringify(m4.fillers)
);
check(
  "«좀»이 다른 단어 속에서 오검출되지 않는다",
  computeStyleMetrics("조좀조좀한 곳이었어요.").fillers.every((f) => f.label !== "좀")
);
check(
  "«것 같다» 를 번역투로 잡는다",
  m4.formal.items.some((f) => f.label === "~것 같다/것 같아요")
);
check(
  "피동형(에 의해)을 센다",
  computeStyleMetrics("트레이너에 의해 안내되었습니다.").formal.passiveCount > 0
);
check(
  "구어체 글은 문어체 지표가 0",
  computeStyleMetrics("근데 그냥 좋더라고요.\n또 갈래요.").formal.per1000 === 0
);

/* ========== 5. 길이 지표 ========== */
h("5. 길이 지표");
const m5 = computeStyleMetrics("짧다.\n조금 더 긴 문장을 여기에 써 본다.");
check("문장 수 2", m5.sentenceCount === 2);
check("최장 > 최단", m5.longestSentence.chars > m5.shortestSentence.chars);
check(
  "중앙값이 최단~최장 사이",
  m5.medianSentenceChars >= m5.shortestSentence.chars &&
    m5.medianSentenceChars <= m5.longestSentence.chars
);
check(
  "공백 제외 글자수 < 공백 포함",
  m5.totalCharsNoSpace < m5.totalChars && m5.totalCharsNoSpace > 0
);

/* ========== 6. 직렬화 ========== */
h("6. 저장·복원");
const saved = JSON.stringify(computeStyleMetrics("좋더라고요.\n또 갈게요."));
check("round-trip 복원", parseStyleMetrics(saved)?.sentenceCount === 2);
check("null 은 null", parseStyleMetrics(null) === null);
check("깨진 JSON 은 null(재계산 유도)", parseStyleMetrics("{not json") === null);
check(
  "구버전은 null(재계산 유도)",
  parseStyleMetrics(JSON.stringify({ version: STYLE_METRICS_VERSION - 1 })) === null
);

/* ========== 7. 집계 → 지시문 ========== */
h("7. 집계 → 자연어 지시문");
const samples = [
  "요즘 어깨가 안 좋아서 알아보다가 등록했어요.\n근데 생각보다 사람이 많더라고요.\n그냥 저녁만 피하면 될 것 같아요.",
  "얼마 전부터 다니기 시작했는데요.\n락커는 그냥 무료로 쓰더라고요.\n참고로 수건도 줍니다.",
];
const agg = aggregateStyleMetrics(samples.map(computeStyleMetrics))!;
check("집계 편수", agg.sampleCount === 2);
check("평균 문장 길이 > 0", agg.avgSentenceChars > 0);
check("종결어미 집계 있음", agg.topEndings.length > 0);
check(
  "도입부 분포에 상황설명 포함",
  agg.introDistribution.some((d) => d.type === "상황설명")
);

const dir = styleMetricsDirective(agg);
check("지시문에 평균 문장 길이 문장이 있다", dir.includes("문장은 평균"));
check("지시문에 종결어미 지시가 있다", dir.includes("종결어미는"));
check("지시문에 도입부 지시가 있다", dir.includes("도입부는"));
check("숫자 표가 아니라 문장 형태다", dir.includes("맞춰라") && !dir.includes("|"));
check(
  "문단 지시 하한 2 — «문장 1개 문단»을 지시하지 않는다",
  !/문장 [01]개 안팎/.test(dir),
  dir.match(/한 문단은[^\n]*/)?.[0] ?? ""
);
check(
  "군말 지시 상한 10 — 짧은 샘플의 튄 빈도를 그대로 지시하지 않는다",
  (() => {
    const n = Number(dir.match(/1000자당 (\d+)회 정도/)?.[1] ?? "0");
    return n >= 1 && n <= 10;
  })(),
  dir.match(/1000자당[^\n]*/)?.[0] ?? ""
);
check(
  "🔴 지표에도 내용 차용 금지 경고가 붙는다",
  dir.includes("가져오라는 뜻이 절대 아니다")
);

/* ========== 8. 회귀 — 샘플 0편 ========== */
h("8. 회귀 검사 (샘플 0편이면 기존 프롬프트 그대로)");
check("aggregateStyleMetrics([]) === null", aggregateStyleMetrics([]) === null);
check('styleMetricsDirective(null) === ""', styleMetricsDirective(null) === "");
check(
  "빈 본문만 있으면 집계 null",
  aggregateStyleMetrics([computeStyleMetrics("  ")]) === null
);
check('styleSampleBlock([], dir) === "" — 지시문만 새어나가지 않는다', styleSampleBlock([], dir) === "");
check(
  "샘플이 있으면 지시문이 블록 안에 들어간다",
  styleSampleBlock([{ title: "t", body: "좋더라고요." }], dir).includes("목표 문체 지표")
);
check(
  "지시문이 유출 가드보다 «앞»에 온다(마지막은 언제나 가드)",
  (() => {
    const b = styleSampleBlock([{ title: "t", body: "좋더라고요." }], dir);
    return b.indexOf("목표 문체 지표") < b.indexOf("⛔ 위 참고 글은 여기서 끝이다");
  })()
);

console.log(`\n${"=".repeat(50)}\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
