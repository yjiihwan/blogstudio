/**
 * 베스트 후기 원문(style_samples) — DB 의존 없는 순수 부분.
 * WHY: 어드민 화면·페르소나 편집기(클라이언트 컴포넌트)가 카테고리 목록을 쓰는데,
 * DB 모듈(better-sqlite3)을 import 하면 클라이언트 번들이 깨진다. 그래서 분리한다.
 * 서버 코드는 "@/lib/style-samples" 를 쓰면 이 모듈도 함께 재노출된다.
 */

/** 등록 가능한 카테고리(고정 14종). 순서 = 어드민 화면 탭 순서. */
export const STYLE_CATEGORIES = [
  "헬스",
  "PT",
  "GX",
  "복싱",
  "하이록스",
  "사우나",
  "웰니스",
  "수영",
  "크로스핏",
  "필라테스",
  "요가",
  "바레",
  "식당",
  "카페",
] as const;

export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

export function isStyleCategory(v: unknown): v is StyleCategory {
  return typeof v === "string" && (STYLE_CATEGORIES as readonly string[]).includes(v);
}

/** 폼 입력 등 신뢰할 수 없는 값을 카테고리로 정규화. 미지정/오값 = null. */
export function normalizeCategory(v: unknown): StyleCategory | null {
  return isStyleCategory(v) ? v : null;
}

/* ============================================================
   주입 설정
   ============================================================ */

export const STYLE_SAMPLE_CONFIG_KEY = "style_sample_config";

export type StyleSampleConfig = {
  /** 주입 편수(0 = 주입 안 함). */
  count: number;
  /** 편당 최대 글자수. 넘으면 앞부분만 자른다(문체는 도입부에 가장 잘 드러난다). */
  maxChars: number;
};

export const DEFAULT_STYLE_SAMPLE_CONFIG: StyleSampleConfig = {
  count: 3,
  maxChars: 1200,
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(n)));

export function normalizeConfig(
  raw: Partial<StyleSampleConfig> | null | undefined
): StyleSampleConfig {
  const count = Number(raw?.count);
  const maxChars = Number(raw?.maxChars);
  return {
    count: Number.isFinite(count) ? clamp(count, 0, 10) : DEFAULT_STYLE_SAMPLE_CONFIG.count,
    maxChars: Number.isFinite(maxChars)
      ? clamp(maxChars, 200, 6000)
      : DEFAULT_STYLE_SAMPLE_CONFIG.maxChars,
  };
}

/* ============================================================
   프롬프트 블록 (순수 — 덤프·테스트에서 그대로 호출)
   ============================================================ */

/** 프롬프트에 실을 최소 형태. */
export type StyleSampleRef = { title: string; body: string };

/** 글자수 상한 초과분은 뒤를 자른다(도입부 보존). */
export function truncateSample(
  body: string,
  maxChars: number
): { text: string; truncated: boolean } {
  const b = (body ?? "").trim();
  if (b.length <= maxChars) return { text: b, truncated: false };
  return { text: b.slice(0, maxChars).trimEnd(), truncated: true };
}

/** 🔴 유출 방지 가드 — 샘플 블록 앞에 붙는다(내용 차용 금지). */
export const STYLE_SAMPLE_GUARD = [
  `## 📚 문체 참고 자료 (실제 한국 블로거가 쓴 글 — 말투만 가져와라)`,
  `아래 글은 **문체·어투·문장 리듬·군말 사용법만** 참고하기 위한 실제 한국 블로거의 글이다.`,
  `**내용·사실·고유명사·수치·시설명·가격을 절대 가져오지 마라.**`,
  `참고 글에 나온 지점·기구·프로그램을 네 글에 등장시키면 그것은 명백한 오류다.`,
  `오직 '한국 사람이 실제로 이렇게 쓴다'는 말투 감각만 가져와라.`,
].join("\n");

/** 가드 재확인 — 샘플 뒤에 한 번 더(긴 예문 뒤에서 지시가 희석되는 걸 막는다). */
export const STYLE_SAMPLE_GUARD_TAIL = [
  `⛔ 위 참고 글은 여기서 끝이다. 다시 강조한다:`,
  `- 위 글에 나온 **업체명·지점명·기구 브랜드·프로그램명·가격·수치·지역명·인물**을 네 글에 쓰면 안 된다. 하나라도 새어 나오면 그 글은 날조로 폐기된다.`,
  `- 위 글의 **구성·소재·에피소드를 베끼지도 마라.** 가져올 것은 오직 문장 길이의 들쭉날쭉함, 종결어미의 변주, 군말("근데", "아무튼", "참고로")을 끼우는 감각, 담백하게 사실을 말하는 태도뿐이다.`,
  `- 네 글의 사실 재료는 **페르소나 설정·사용자 입력·주어진 주제**뿐이다(위 참고 글은 사실 재료가 아니다).`,
].join("\n");

/**
 * 시스템 프롬프트에 끼울 few-shot 블록. 샘플 0편이면 빈 문자열(= 기존 프롬프트 그대로).
 *
 * metricsDirective = 그 카테고리 활성 샘플 전체에서 뽑은 «목표 문체 지표» 자연어 지시문.
 * 원문과 지표 사이가 아니라 원문 «뒤»에 붙인다 — 긴 예문 뒤에서 지시가 희석되는 걸 막고,
 * 마지막은 언제나 유출 방지 가드가 오도록 순서를 고정한다.
 */
export function styleSampleBlock(
  samples: StyleSampleRef[],
  metricsDirective?: string
): string {
  const list = (samples ?? []).filter((s) => s?.body?.trim());
  if (!list.length) return "";
  const directive = (metricsDirective ?? "").trim();
  return [
    STYLE_SAMPLE_GUARD,
    "",
    ...list.flatMap((s, i) => [
      `### 참고 글 ${i + 1} — ${s.title}`,
      "```",
      s.body.trim(),
      "```",
      "",
    ]),
    ...(directive ? [directive, ""] : []),
    STYLE_SAMPLE_GUARD_TAIL,
  ].join("\n");
}
