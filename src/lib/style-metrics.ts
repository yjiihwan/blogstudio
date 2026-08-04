/**
 * 문체 지표(style metrics) — 베스트 후기 원문에서 «말투의 형태»를 숫자로 뽑는다.
 *
 * WHY: 원문만 LLM 에 던지면 토큰만 먹고 모방이 흐려진다. "문장 평균 32자, 종결어미는
 * ~더라고요 중심" 같은 구체적 목표를 함께 주면 맞출 대상이 분명해진다.
 *
 * ⚠️ 전부 규칙 기반(정규식·문장분리)이다. LLM 호출이 없어야 저장할 때마다 비용이 안 든다.
 * ⚠️ DB 의존 금지 — 어드민 화면(클라이언트 컴포넌트)이 붙여넣는 즉시 계산해 보여준다.
 */

export const STYLE_METRICS_VERSION = 2;

export type IntroType =
  | "질문형"
  | "결론선제시"
  | "장면묘사"
  | "상황설명"
  | "자기소개"
  | "unknown";

export type Tally = { label: string; count: number; ratio: number };

export type StyleMetrics = {
  version: number;
  /** 총 글자수(공백 포함) / 공백 제외 */
  totalChars: number;
  totalCharsNoSpace: number;
  sentenceCount: number;
  paragraphCount: number;
  /** 문장 길이(공백 포함 글자수) */
  avgSentenceChars: number;
  medianSentenceChars: number;
  longestSentence: { chars: number; text: string };
  shortestSentence: { chars: number; text: string };
  avgSentencesPerParagraph: number;
  /** 종결어미 분포 상위 5 */
  endings: Tally[];
  introType: IntroType;
  /** 도입부 판별 근거(규칙 미매칭이면 null → introType=unknown) */
  introEvidence: string | null;
  /** 구어체 군말·감탄 빈도 상위 */
  fillers: Tally[];
  /** 1000자당 군말 횟수 */
  fillerPer1000: number;
  /** 문어체·번역투 지표 */
  formal: { items: Tally[]; passiveCount: number; per1000: number };
  computedAt: string;
};

/* ============================================================
   문단·문장 분리
   ============================================================ */

const norm = (s: string) => (s ?? "").replace(/\r\n?/g, "\n");

/** 빈 줄로 문단을 나눈다. 빈 줄이 아예 없으면 줄 하나 = 문단(네이버 붙여넣기 형태). */
export function splitParagraphs(text: string): string[] {
  const t = norm(text).trim();
  if (!t) return [];
  const byBlank = t
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 문장 분리 — 줄바꿈 + 종결부호. 한국 블로그는 마침표를 자주 생략해 줄바꿈도 경계로 본다. */
export function splitSentences(block: string): string[] {
  const out: string[] = [];
  for (const line of norm(block).split("\n")) {
    const l = line.trim();
    if (!l) continue;
    for (const part of l.split(/(?<=[.!?…]["'”’)\]]*)\s+/)) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/** 지표 계산에서 제외할 껍데기(사진 마커·구분선·해시태그 줄). */
const NOISE = /^(!\[|#{1,6}\s|[-=*_]{3,}$|#[^\s#]+(\s+#[^\s#]+)*$)/;

function sentencesOf(text: string): { paragraphs: string[]; sentences: string[] } {
  const paragraphs = splitParagraphs(text).filter((p) => !NOISE.test(p));
  const sentences = paragraphs.flatMap(splitSentences).filter((s) => !NOISE.test(s));
  return { paragraphs, sentences };
}

/* ============================================================
   종결어미
   ============================================================ */

/** 문장 끝의 부호·이모지·공백을 걷어내고 한글 꼬리만 남긴다. */
function tail(sentence: string): string {
  return sentence
    .replace(/[\s"'”’)\]}>·…~!?.,\-–—:;]+$/u, "")
    .replace(/[^\p{Script=Hangul}\p{L}\p{N}]+$/gu, "");
}

type EndingRule = { label: string; re: RegExp };

// 순서 = 구체적인 것 먼저. 앞 규칙이 잡으면 뒤는 보지 않는다.
const ENDING_RULES: EndingRule[] = [
  { label: "~더라고요", re: /(더라[고구]요|드라[고구]요)$/ },
  { label: "~더라구", re: /더라$/ },
  { label: "~거든요", re: /거든요$/ },
  { label: "~잖아요", re: /잖아요$/ },
  { label: "~네요", re: /네요$/ },
  { label: "~군요/구나", re: /(군요|구나|네여)$/ },
  { label: "~인데요/는데요", re: /([은는인]데요)$/ },
  { label: "~는데(말끝흐림)", re: /([은는인]데)$/ },
  { label: "~같아요", re: /(같아요|같네요|같습니다)$/ },
  { label: "~까요?/나요?", re: /(까요|나요|을까|ㄹ까)$/ },
  { label: "~세요", re: /(세요|십시오|십시요)$/ },
  { label: "~죠/지요", re: /(죠|지요|쥬)$/ },
  { label: "~습니다체", re: /(습니다|입니다|합니다|ㅂ니다|됩니다|십니다)$/ },
  // 해요체 — 3글자 자르기가 아니라 «어미 형태소»로 라벨링한다(«만족해요»가 ~족해요 로 잘리면 안 된다).
  { label: "~예요/이에요", re: /(이에요|이예요|예요|에요)$/ },
  { label: "~했어요", re: /(했어요|했었어요|했네요)$/ },
  { label: "~었어요(과거)", re: /([었았였]어요)$/ },
  { label: "~해요", re: /해요$/ },
  { label: "~게요(의지)", re: /([을ㄹ]?게요|래요|려고요)$/ },
  { label: "~어요/아요", re: /([어아워와여]요)$/ },
  { label: "~요(기타)", re: /요$/ },
  // 해라체
  { label: "~했다", re: /했다$/ },
  { label: "~었다(과거)", re: /([었았였]다)$/ },
  { label: "~한다/~ㄴ다", re: /([는ㄴ]다)$/ },
  { label: "~이다", re: /(이다|아니다)$/ },
  { label: "~다(해라체)", re: /다$/ },
  { label: "~음/슴(음슴체)", re: /[음슴임함됨]$/ },
];

function endingLabel(sentence: string): string | null {
  const t = tail(sentence);
  if (!t) return null;
  for (const rule of ENDING_RULES) {
    if (rule.re.test(t)) return rule.label;
  }
  return null;
}

function tally(counts: Map<string, number>, total: number, top: number): Tally[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({
      label,
      count,
      ratio: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

/* ============================================================
   도입부 유형
   ============================================================ */

type IntroRule = { type: IntroType; re: RegExp; why: string };

const INTRO_RULES: IntroRule[] = [
  { type: "질문형", re: /\?\s*$|(까요|나요|을까요|궁금하[지신])/, why: "물음으로 연다" },
  {
    type: "결론선제시",
    re: /(결론부터|결론적으로|한마디로|미리 말하|먼저 말하|총평|바로 말하|스포하자면)/,
    why: "결론을 먼저 던진다",
  },
  {
    type: "장면묘사",
    re: /(오늘|어제|그제|엊그제|주말|아침|점심|저녁|밤에|새벽|퇴근길|출근길|퇴근하고|비가|눈이 오|햇살|바람이|문을 열|들어서|도착해|도착하니|올라가니|걸어가)/,
    why: "시간·장소 장면으로 연다",
  },
  {
    type: "상황설명",
    re: /(요즘|최근|얼마 전|며칠 전|그동안|원래|평소|한동안|계기|덕분에|때문에|이사|고 나서|고 나니|[아어]보다가|다니다가|하다가|하려고|찾아보|알아보|돌아보|둘러보|비교해보)/,
    why: "사연·배경부터 설명한다",
  },
  {
    type: "자기소개",
    re: /(^|\s)(저는|제가|나는|안녕하세요|반갑습니다)/,
    why: "자기소개로 연다",
  },
];

function detectIntro(sentences: string[]): { type: IntroType; evidence: string | null } {
  const head = sentences.slice(0, 2).join(" ");
  if (!head.trim()) return { type: "unknown", evidence: null };
  for (const r of INTRO_RULES) {
    if (r.re.test(head)) return { type: r.type, evidence: r.why };
  }
  return { type: "unknown", evidence: null };
}

/* ============================================================
   군말 · 문어체
   ============================================================ */

const FILLERS = [
  "진짜", "정말", "그냥", "좀", "근데", "솔직히", "완전", "되게", "약간", "뭔가",
  "아무튼", "암튼", "사실", "일단", "딱", "엄청", "참고로", "개인적으로", "막",
  "괜히", "은근", "확실히", "역시", "아무래도", "생각보다",
] as const;

// 한글엔 \b 가 없어서 앞뒤에 한글이 붙지 않은 경우만 센다(«좀»이 «조좀»에 걸리지 않게).
const hangulToken = (w: string) =>
  new RegExp(`(?<![\\p{Script=Hangul}])${w}(?![\\p{Script=Hangul}])`, "gu");

const FORMAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "~할 수 있습니다", re: /수 있습니다|수 있을 것입니다/g },
  { label: "~것 같다/것 같아요", re: /것 ?같|것같/g },
  { label: "~에 대해/~에 대한", re: /에 대[해한하]/g },
  { label: "~을 통해", re: /[을를] 통[해한]/g },
  { label: "~으로 인해", re: /[으]?로 인[해한]/g },
  { label: "~하는 것이 좋습니다", re: /것이 좋|것이 중요|필요가 있/g },
  { label: "~라고 할 수 있다", re: /라고 할 수 있/g },
  { label: "~에 위치하고 있다", re: /위치하고 있|자리하고 있/g },
];

const PASSIVE_PATTERNS: RegExp[] = [
  /에 의해/g,
  /되어지|되어집|되어진/g,
  /보여[진집]/g,
  /여겨[진집]/g,
  /생각되[어는]/g,
  /지게 된다|지게 됩니다/g,
];

function countAll(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/* ============================================================
   본 계산
   ============================================================ */

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStyleMetrics(body: string): StyleMetrics {
  const text = norm(body ?? "");
  const { paragraphs, sentences } = sentencesOf(text);
  const lens = sentences.map((s) => s.length);
  const sorted = [...lens].sort((a, b) => a - b);
  const sum = lens.reduce((a, b) => a + b, 0);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
    : 0;

  const longestIdx = lens.indexOf(Math.max(...lens, 0));
  const shortestIdx = lens.indexOf(Math.min(...(lens.length ? lens : [0])));

  const endingCounts = new Map<string, number>();
  let endingTotal = 0;
  for (const s of sentences) {
    const label = endingLabel(s);
    if (!label) continue;
    endingCounts.set(label, (endingCounts.get(label) ?? 0) + 1);
    endingTotal += 1;
  }

  const fillerCounts = new Map<string, number>();
  let fillerTotal = 0;
  for (const w of FILLERS) {
    const n = countAll(text, hangulToken(w));
    if (n > 0) {
      fillerCounts.set(w, n);
      fillerTotal += n;
    }
  }

  const formalCounts = new Map<string, number>();
  let formalTotal = 0;
  for (const p of FORMAL_PATTERNS) {
    const n = countAll(text, p.re);
    if (n > 0) {
      formalCounts.set(p.label, n);
      formalTotal += n;
    }
  }
  const passiveCount = PASSIVE_PATTERNS.reduce((a, re) => a + countAll(text, re), 0);

  const totalChars = text.length;
  const per1000 = (n: number) => (totalChars > 0 ? round1((n / totalChars) * 1000) : 0);
  const intro = detectIntro(sentences);

  return {
    version: STYLE_METRICS_VERSION,
    totalChars,
    totalCharsNoSpace: text.replace(/\s/g, "").length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgSentenceChars: sentences.length ? round1(sum / sentences.length) : 0,
    medianSentenceChars: median,
    longestSentence: {
      chars: lens.length ? lens[longestIdx] : 0,
      text: lens.length ? sentences[longestIdx] : "",
    },
    shortestSentence: {
      chars: lens.length ? lens[shortestIdx] : 0,
      text: lens.length ? sentences[shortestIdx] : "",
    },
    avgSentencesPerParagraph: paragraphs.length
      ? round1(sentences.length / paragraphs.length)
      : 0,
    endings: tally(endingCounts, endingTotal, 5),
    introType: intro.type,
    introEvidence: intro.evidence,
    fillers: tally(fillerCounts, fillerTotal, 8),
    fillerPer1000: per1000(fillerTotal),
    formal: {
      items: tally(formalCounts, formalTotal, 5),
      passiveCount,
      per1000: per1000(formalTotal + passiveCount),
    },
    computedAt: new Date().toISOString(),
  };
}

/** DB 에 저장된 JSON 문자열 → StyleMetrics. 깨졌거나 구버전이면 null(호출부가 재계산). */
export function parseStyleMetrics(json: string | null | undefined): StyleMetrics | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json) as StyleMetrics;
    if (!m || typeof m !== "object" || m.version !== STYLE_METRICS_VERSION) return null;
    return m;
  } catch {
    return null;
  }
}

/* ============================================================
   카테고리 집계 → 자연어 지시문
   ============================================================ */

export type StyleMetricsAggregate = {
  sampleCount: number;
  avgSentenceChars: number;
  medianSentenceChars: number;
  avgSentencesPerParagraph: number;
  avgTotalChars: number;
  longSentenceGuard: number;
  topEndings: Tally[];
  introDistribution: Array<{ type: IntroType; count: number }>;
  topFillers: Tally[];
  fillerPer1000: number;
  formalPer1000: number;
};

export function aggregateStyleMetrics(list: StyleMetrics[]): StyleMetricsAggregate | null {
  const ms = (list ?? []).filter((m) => m && m.sentenceCount > 0);
  if (!ms.length) return null;

  const mean = (pick: (m: StyleMetrics) => number) =>
    round1(ms.reduce((a, m) => a + pick(m), 0) / ms.length);

  // 종결어미: 편별 비율의 평균이 아니라 실제 등장 횟수 합으로 집계(긴 글의 표를 존중).
  const endingCounts = new Map<string, number>();
  let endingTotal = 0;
  const fillerCounts = new Map<string, number>();
  let fillerTotal = 0;
  const introCounts = new Map<IntroType, number>();
  for (const m of ms) {
    for (const e of m.endings) {
      endingCounts.set(e.label, (endingCounts.get(e.label) ?? 0) + e.count);
      endingTotal += e.count;
    }
    for (const f of m.fillers) {
      fillerCounts.set(f.label, (fillerCounts.get(f.label) ?? 0) + f.count);
      fillerTotal += f.count;
    }
    introCounts.set(m.introType, (introCounts.get(m.introType) ?? 0) + 1);
  }

  // 긴 문장 상한 = 실측 최장 문장들의 평균(너무 짧게 잡아 문장 리듬을 죽이지 않도록).
  const longGuard = Math.round(
    ms.reduce((a, m) => a + m.longestSentence.chars, 0) / ms.length
  );

  return {
    sampleCount: ms.length,
    avgSentenceChars: mean((m) => m.avgSentenceChars),
    medianSentenceChars: mean((m) => m.medianSentenceChars),
    avgSentencesPerParagraph: mean((m) => m.avgSentencesPerParagraph),
    avgTotalChars: Math.round(mean((m) => m.totalChars)),
    longSentenceGuard: longGuard,
    topEndings: tally(endingCounts, endingTotal, 5),
    introDistribution: [...introCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    topFillers: tally(fillerCounts, fillerTotal, 6),
    fillerPer1000: mean((m) => m.fillerPer1000),
    formalPer1000: mean((m) => m.formal.per1000),
  };
}

/**
 * 집계 → 프롬프트에 넣을 «자연어 지시문». 숫자 표를 그대로 던지지 않는다.
 * 샘플이 없으면 빈 문자열 → 주입 자체가 사라진다(회귀 금지).
 */
export function styleMetricsDirective(agg: StyleMetricsAggregate | null): string {
  if (!agg) return "";
  const L: string[] = [];
  L.push(`## 🎯 목표 문체 지표 (위 참고 글 ${agg.sampleCount}편을 실제로 재서 뽑은 수치)`);
  L.push(
    `아래는 참고 글들의 «문장 습관»을 잰 것이다. 내용이 아니라 형태에 대한 목표다. 네 글의 문장도 이 감각에 맞춰라.`
  );

  L.push(
    `- 문장은 평균 ${agg.avgSentenceChars}자 안팎으로 써라(중앙값 ${agg.medianSentenceChars}자). 짧은 문장과 긴 문장을 섞되, 한 문장이 ${Math.max(60, agg.longSentenceGuard)}자를 넘어가면 끊어라.`
  );

  if (agg.topEndings.length) {
    const top = agg.topEndings
      .slice(0, 3)
      .map((e) => `${e.label}(${e.ratio}%)`)
      .join(", ");
    L.push(
      `- 종결어미는 ${top} 를 중심으로 굴려라. 같은 어미를 세 문장 연속 쓰지 마라 — 참고 글도 계속 갈아탄다.`
    );
  }

  // 하한 2 — 붙여넣은 원문에 빈 줄이 없으면 «줄=문단»으로 잡혀 평균이 1대까지 내려간다.
  // 그 수치를 그대로 지시하면 한 문장짜리 문단만 나열하는 퇴행적인 글이 된다.
  L.push(
    `- 한 문단은 문장 ${Math.max(2, Math.round(agg.avgSentencesPerParagraph))}개 안팎에서 끊어라(참고 글 실측 평균 ${agg.avgSentencesPerParagraph}문장). 문단을 길게 뭉치지 마라.`
  );

  const introTop = agg.introDistribution.filter((d) => d.type !== "unknown")[0];
  if (introTop) {
    L.push(
      `- 도입부는 «${introTop.type}»으로 열어라(참고 글 ${agg.sampleCount}편 중 ${introTop.count}편이 그렇다). 광고 문구나 정의 설명으로 시작하지 마라.`
    );
  }

  if (agg.topFillers.length) {
    const words = agg.topFillers
      .slice(0, 5)
      .map((f) => `"${f.label}"`)
      .join(", ");
    // 상한 10 — 짧은 샘플일수록 1000자당 빈도가 튀는데, 그대로 지시하면 군말 범벅이 된다.
    const rate = Math.min(10, Math.max(1, Math.round(agg.fillerPer1000)));
    L.push(
      `- ${words} 같은 구어체 군말을 1000자당 ${rate}회 정도 자연스럽게 섞어라(참고 글 실측 ${agg.fillerPer1000}회). 개수를 채우려고 억지로 넣지는 마라.`
    );
  }

  L.push(
    agg.formalPer1000 < 2
      ? `- 참고 글에는 문어체·번역투("~할 수 있습니다", "~것 같다", "~에 의해" 같은 피동형)가 거의 없다. 너도 쓰지 마라.`
      : `- 문어체·번역투("~할 수 있습니다", "~것 같다", 피동형)는 참고 글에서도 드물다(1000자당 ${agg.formalPer1000}회). 최소로 줄여라.`
  );

  L.push(
    `⚠️ 이 수치는 «문장의 모양»에 대한 목표일 뿐이다. 참고 글의 소재·업체·수치를 가져오라는 뜻이 절대 아니다.`
  );
  return L.join("\n");
}
