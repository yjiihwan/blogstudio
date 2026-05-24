/**
 * Lightweight heuristic scoring for SEO and "human-likeness".
 * These are intentionally simple — they're hints in the UI, not a hard gate.
 */

export type SeoCheck = {
  ok: boolean;
  label: string;
  detail?: string;
  weight: number;
};

export function scoreSeo(opts: {
  title: string;
  bodyMd: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  imageCount: number;
  minLen: number;
  maxLen: number;
}): { score: number; checks: SeoCheck[] } {
  const checks: SeoCheck[] = [];
  const body = opts.bodyMd ?? "";
  const titleLen = opts.title.length;
  const len = body.replace(/\s+/g, "").length;
  const firstParagraph = body.slice(0, 250);

  checks.push({
    ok: titleLen >= 25 && titleLen <= 45,
    label: "제목 길이 (25~45자)",
    detail: `${titleLen}자`,
    weight: 10,
  });

  checks.push({
    ok: opts.title.includes(opts.primaryKeyword),
    label: "메인 키워드가 제목에 포함",
    detail: opts.primaryKeyword,
    weight: 15,
  });

  checks.push({
    ok: firstParagraph.includes(opts.primaryKeyword),
    label: "도입부에 메인 키워드 등장",
    weight: 10,
  });

  const kwOccur = countOccurrences(body, opts.primaryKeyword);
  checks.push({
    ok: kwOccur >= 2 && kwOccur <= 6,
    label: "메인 키워드 본문 등장 2~6회",
    detail: `${kwOccur}회`,
    weight: 10,
  });

  const secCovered = opts.secondaryKeywords.filter((k) =>
    body.includes(k)
  ).length;
  checks.push({
    ok: secCovered >= Math.min(2, opts.secondaryKeywords.length),
    label: `보조 키워드 ${Math.min(2, opts.secondaryKeywords.length)}개 이상 등장`,
    detail: `${secCovered}/${opts.secondaryKeywords.length}`,
    weight: 10,
  });

  const h2Count = (body.match(/^##\s/gm) ?? []).length;
  checks.push({
    ok: h2Count >= 2 && h2Count <= 4,
    label: "H2 섹션 2~4개",
    detail: `${h2Count}개`,
    weight: 10,
  });

  checks.push({
    ok: len >= opts.minLen && len <= opts.maxLen,
    label: `본문 길이 ${opts.minLen}~${opts.maxLen}자`,
    detail: `${len}자`,
    weight: 15,
  });

  checks.push({
    ok: opts.imageCount >= 3,
    label: "이미지 3장 이상",
    detail: `${opts.imageCount}장`,
    weight: 10,
  });

  checks.push({
    ok: /\?\s*$/m.test(body) || /\?\s*\n/.test(body),
    label: "본문에 질문형 문장 포함 (체류시간↑)",
    weight: 5,
  });

  checks.push({
    ok: /(\d{4}년|\d{1,2}월)/.test(body),
    label: "시기 정보 포함 (최신성 신호)",
    weight: 5,
  });

  const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  return { score: Math.round((earned / total) * 100), checks };
}

export function scoreHuman(opts: {
  bodyMd: string;
  forbiddenWords: string[];
}) {
  const body = opts.bodyMd ?? "";
  const checks: SeoCheck[] = [];

  const forbiddenHits = opts.forbiddenWords.filter((w) =>
    body.includes(w)
  );
  checks.push({
    ok: forbiddenHits.length === 0,
    label: "금지어 미사용",
    detail: forbiddenHits.length ? forbiddenHits.join(", ") : undefined,
    weight: 25,
  });

  /* Sentence length variation — if all sentences ~equal length, robotic */
  const sentences = body
    .split(/[\.!\?。]\s+|\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  const lens = sentences.map((s) => s.length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const variance =
    lens.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, lens.length);
  const stdev = Math.sqrt(variance);
  checks.push({
    ok: stdev > 12,
    label: "문장 길이 변주",
    detail: `표준편차 ${stdev.toFixed(0)}`,
    weight: 15,
  });

  /* AI catchphrases */
  const aiClichesRe =
    /(다음과 같은 점이|먼저[, ]|결론적으로|마지막으로|이러한 점에서|살펴보겠습니다)/g;
  const cliches = (body.match(aiClichesRe) ?? []).length;
  checks.push({
    ok: cliches <= 1,
    label: "AI식 상투어 적음",
    detail: `${cliches}회`,
    weight: 15,
  });

  /* Emoji count */
  const emojis = (body.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  checks.push({
    ok: emojis <= 2,
    label: "이모지 과다 사용 없음",
    detail: `${emojis}개`,
    weight: 5,
  });

  /* Personal voice signals (Korean 1st-person particles, casual endings) */
  const personalSignals = (body.match(/(저는|제가|우리|동료|지난|어제|오늘|이번 주)/g) ?? []).length;
  checks.push({
    ok: personalSignals >= 2,
    label: "개인적 디테일 포함",
    detail: `${personalSignals}회`,
    weight: 15,
  });

  /* Concrete numbers (price, address, dates) */
  const concrete = (body.match(/\d+(?:,\d{3})*(?:원|시|분|km|m|일)/g) ?? []).length;
  checks.push({
    ok: concrete >= 1,
    label: "구체 수치·단위 포함",
    detail: `${concrete}개`,
    weight: 10,
  });

  /* Repeated sentence-starter pattern */
  const starters = sentences.map((s) => s.slice(0, 4));
  const starterCounts = starters.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const maxStart = Math.max(0, ...Object.values(starterCounts));
  checks.push({
    ok: maxStart <= 3,
    label: "같은 문두 반복 없음",
    detail: `최대 ${maxStart}회`,
    weight: 15,
  });

  const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  return { score: Math.round((earned / total) * 100), checks };
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}
