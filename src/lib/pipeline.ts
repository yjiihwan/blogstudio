/**
 * Draft generation pipeline. Orchestrates topic research → outline → body →
 * scoring, then persists a Draft row. Can run from a UI server action OR from
 * the cron tick script.
 */
import { db, schema } from "@/db/client";
import { and, desc, eq, gte } from "drizzle-orm";
import { llm, UserApiKeyMissingError, CreditExhaustedError } from "./llm";
export { UserApiKeyMissingError };
import {
  bodyPrompt,
  outlinePrompt,
  personaPreamble,
  type PersonaInput,
  revisePrompt,
  humanizePrompt,
  topicResearchPrompt,
  parseLengthIntent,
  parseExplicitLength,
  findAbsentFacilityHits,
  findForbiddenTopicHits,
  buildGroundingText,
  findFabricationHits,
  factGuardPrompt,
  assessInsufficiency,
  assessSupplementProgress,
  isLengthUnfillable,
  limitationNotice,
  buildAugmentationRequest,
  augmentedPreamble,
  resolveEmojiIntensity,
  type EmojiIntensity,
  resolveWritingTemplate,
  reviewChecklist,
  reviewRubricPrompt,
  reviewRewritePrompt,
  deriveSpeakerPersona,
  applyBriefSpeaker,
  type BriefSpeaker,
  topicNeedsDomainMaterial,
  domainMaterialPrompt,
  filterDomainMaterial,
} from "./llm/prompts";
import { scoreHuman, scoreSeo } from "./scoring";
import { sanitizeBody } from "./markdown";
import { sendTelegramToUser } from "./telegram";
import { globalGuideBlock, getGlobalWritingGuide } from "./global-guide";
import { saveImageBuffer } from "./storage";

/**
 * 본문 생성 후 'AI 티'를 걷어내는 사람화 리라이트 패스.
 * 전역 가이드가 켜져 있을 때만 동작. 결과가 비정상(너무 짧거나 이미지 마커 유실)이면
 * 원본을 유지한다. 토큰/비용 델타를 반환한다.
 */
async function humanizeBody(opts: {
  bodyMd: string;
  title: string;
  preamble: string;
  callerUserId?: string;
  model: string;
  brandName?: string;
  primaryKeyword?: string;
  /** 분량 늘리기 반려 직후 호출 시, 결과가 이 글자수(공백 제외) 미만이면 humanize를 버리고 입력을 유지한다. */
  minChars?: number;
  /** 큰 본문은 기본 4096토큰에서 잘리므로 호출부가 천장을 올려 전달한다. */
  maxTokens?: number;
  /** 실효 이모지 레벨(0~3) — anti-ai 이모지 판정을 레벨 인지로 전환(§5). */
  emojiLevel?: EmojiIntensity;
}): Promise<{ bodyMd: string; inTokens: number; outTokens: number; costCents: number }> {
  const zero = { bodyMd: opts.bodyMd, inTokens: 0, outTokens: 0, costCents: 0 };
  if (opts.model === "mock") return zero;
  const guide = await getGlobalWritingGuide();
  if (!guide.enabled || !guide.text.trim()) return zero;
  try {
    const res = await llm({
      system: opts.preamble,
      callerUserId: opts.callerUserId,
      maxTokens: opts.maxTokens,
      messages: [
        {
          role: "user",
          content: humanizePrompt({
            title: opts.title,
            bodyMd: opts.bodyMd,
            rules: guide.text,
            brandName: opts.brandName,
            primaryKeyword: opts.primaryKeyword,
            minChars: opts.minChars,
            emojiLevel: opts.emojiLevel,
          }),
        },
      ],
    });
    const out = res.text
      .trim()
      .replace(/^```(?:markdown)?/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const origImgs = (opts.bodyMd.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
    const newImgs = (out.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
    // 안전장치: 결과가 절반 미만이거나 이미지 마커를 잃으면 원본 유지(토큰은 정산).
    // 분량 늘리기 반려(minChars)면 humanize가 길이를 깎는 걸 막기 위해 floor를 minChars의 95%로 올린다.
    const outChars = out.replace(/\s+/g, "").length;
    const floor = opts.minChars ? opts.minChars * 0.95 : opts.bodyMd.length * 0.5;
    const measured = opts.minChars ? outChars : out.length;
    if (measured < floor || newImgs < origImgs) {
      return { bodyMd: opts.bodyMd, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents };
    }
    return { bodyMd: out, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents };
  } catch {
    return zero;
  }
}

/**
 * 발행 전 사실검증(fact-guard) 리라이트 패스 — 업종 무관 '완전 차단' 층.
 * 확정 사실(grounding)로 뒷받침되지 않는 구체 주장(가격·수치·할인·연혁·수상·규모·시설·이벤트)을
 * LLM이 걷어낸(또는 일반화한) 본문을 돌려준다. 전역 가이드가 켜져 있을 때만, mock 제외.
 * 안전장치는 humanize와 동일 — 이미지 마커 유실/과도 축소면 원본 유지(토큰만 정산).
 */
async function factGuardBody(opts: {
  bodyMd: string;
  title: string;
  groundingText: string;
  forbiddenTerms?: string[];
  preamble: string;
  callerUserId?: string;
  model: string;
  maxTokens?: number;
}): Promise<{
  bodyMd: string;
  removed: string[];
  /** 자가감사 후에도 결정론 게이트에 잔존한 금지 소재(있으면 하드 위반) */
  forbiddenHits: string[];
  inTokens: number;
  outTokens: number;
  costCents: number;
}> {
  const forbidden = opts.forbiddenTerms ?? [];
  const zero = {
    bodyMd: opts.bodyMd,
    removed: [] as string[],
    forbiddenHits: findForbiddenTopicHits(`${opts.title}\n${opts.bodyMd}`, forbidden),
    inTokens: 0,
    outTokens: 0,
    costCents: 0,
  };
  if (opts.model === "mock") return zero;
  const guide = await getGlobalWritingGuide();
  if (!guide.enabled || !guide.text.trim()) return zero;

  let cur = opts.bodyMd;
  const removedAll: string[] = [];
  let inTokens = 0;
  let outTokens = 0;
  let costCents = 0;

  // 자가감사(fact-audit) 패스 — 결정론 게이트가 깨끗해질 때까지 최대 2회(2차는 잔존 금지어 타깃).
  for (let pass = 0; pass < 2; pass++) {
    try {
      const res = await llm({
        system: opts.preamble,
        callerUserId: opts.callerUserId,
        maxTokens: opts.maxTokens,
        messages: [
          {
            role: "user",
            content: factGuardPrompt({
              groundingText: opts.groundingText,
              forbiddenTerms: forbidden,
              title: opts.title,
              bodyMd: cur,
            }),
          },
        ],
      });
      inTokens += res.inputTokens;
      outTokens += res.outputTokens;
      costCents += res.costCents;
      const parsed = safeJson<{ removed?: string[]; bodyMd?: string }>(res.text);
      if (parsed && typeof parsed.bodyMd === "string") {
        const out = parsed.bodyMd
          .trim()
          .replace(/^```(?:markdown|json)?/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        const origImgs = (cur.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
        const newImgs = (out.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
        const outChars = out.replace(/\s+/g, "").length;
        const origChars = cur.replace(/\s+/g, "").length;
        if (Array.isArray(parsed.removed)) {
          removedAll.push(...parsed.removed.filter((s) => typeof s === "string"));
        }
        // 이미지 마커 유실·과도 축소·빈 응답이 아니면 채택(제거 목록은 감사용으로 항상 보존).
        if (!(newImgs < origImgs || outChars < origChars * 0.5 || out.length < 50)) {
          cur = out;
        }
      }
    } catch {
      break;
    }
    // 결정론 재검증 — 금지 소재가 남지 않았으면 조기 종료.
    if (findForbiddenTopicHits(`${opts.title}\n${cur}`, forbidden).length === 0) break;
  }

  const forbiddenHits = findForbiddenTopicHits(`${opts.title}\n${cur}`, forbidden);
  return { bodyMd: cur, removed: removedAll, forbiddenHits, inTokens, outTokens, costCents };
}

const IMG_MARKER_RE = /<!--\s*IMG:slot=\d+\s*-->/g;

/**
 * 개정 가이드 자가검증 게이트(review_v1 전용). §4 결정론 체크리스트 + §7 LLM 루브릭으로
 * '사람다움'을 검사하고, 미충족(필수요소 미달 또는 루브릭 7점 미만)이면 한 번 재작성한다.
 * standard 템플릿·mock·가이드 비활성이면 통과(원본 유지). 이미지 마커 유실/과도 축소면 원본 유지.
 * 결과 issues 는 seoIssues 에 얹혀 검수자에게 노출된다.
 */
async function reviewVerifyPass(opts: {
  persona: PersonaInput;
  bodyMd: string;
  title: string;
  preamble: string;
  callerUserId?: string;
  model: string;
  maxTokens?: number;
  primaryKeyword?: string;
  minChars?: number;
}): Promise<{
  bodyMd: string;
  rubricScore: number | null;
  issues: string[];
  rewritten: boolean;
  inTokens: number;
  outTokens: number;
  costCents: number;
}> {
  const passthrough = {
    bodyMd: opts.bodyMd,
    rubricScore: null as number | null,
    issues: [] as string[],
    rewritten: false,
    inTokens: 0,
    outTokens: 0,
    costCents: 0,
  };
  if (resolveWritingTemplate(opts.persona) !== "review_v1") return passthrough;
  if (opts.model === "mock") return passthrough;
  const guide = await getGlobalWritingGuide();
  if (!guide.enabled || !guide.text.trim()) return passthrough;

  const level = resolveEmojiIntensity(opts.persona).level;
  const speaker = deriveSpeakerPersona(opts.persona);
  let inTokens = 0;
  let outTokens = 0;
  let costCents = 0;

  const evaluate = async (body: string) => {
    const imgCount = (body.match(IMG_MARKER_RE) || []).length;
    const det = reviewChecklist({ bodyMd: body, imgMarkerCount: imgCount, emojiLevel: level });
    let rubricScore: number | null = null;
    let rubricIssues: string[] = [];
    try {
      const res = await llm({
        system: opts.preamble,
        callerUserId: opts.callerUserId,
        maxTokens: 900,
        messages: [
          { role: "user", content: reviewRubricPrompt({ title: opts.title, bodyMd: body, speaker }) },
        ],
      });
      inTokens += res.inputTokens;
      outTokens += res.outputTokens;
      costCents += res.costCents;
      const parsed = safeJson<{ score?: number; issues?: string[] }>(res.text);
      if (parsed && typeof parsed.score === "number") rubricScore = parsed.score;
      if (parsed && Array.isArray(parsed.issues)) {
        rubricIssues = parsed.issues.filter((s) => typeof s === "string" && s.trim()).slice(0, 6);
      }
    } catch {
      // 루브릭 호출 실패 시 결정론 체크리스트만으로 판정한다.
    }
    const belowRubric = rubricScore !== null && rubricScore < REVIEW_V1_PASS;
    const pass = det.failed.length === 0 && !belowRubric;
    return { det, rubricScore, rubricIssues, pass };
  };

  const first = await evaluate(opts.bodyMd);
  if (first.pass) {
    return { ...passthrough, rubricScore: first.rubricScore, inTokens, outTokens, costCents };
  }

  // 미달 → 지적사항을 담아 한 번 재작성 후 재평가. 개선되면 채택, 아니면 원본 유지.
  let finalBody = opts.bodyMd;
  let rewritten = false;
  try {
    const res = await llm({
      system: opts.preamble,
      callerUserId: opts.callerUserId,
      maxTokens: opts.maxTokens,
      messages: [
        {
          role: "user",
          content: reviewRewritePrompt({
            title: opts.title,
            bodyMd: opts.bodyMd,
            persona: opts.persona,
            failedChecks: first.det.failed,
            rubricIssues: first.rubricIssues,
            primaryKeyword: opts.primaryKeyword,
            minChars: opts.minChars,
          }),
        },
      ],
    });
    inTokens += res.inputTokens;
    outTokens += res.outputTokens;
    costCents += res.costCents;
    const out = res.text
      .trim()
      .replace(/^```(?:markdown)?/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const origImgs = (opts.bodyMd.match(IMG_MARKER_RE) || []).length;
    const newImgs = (out.match(IMG_MARKER_RE) || []).length;
    const outChars = out.replace(/\s+/g, "").length;
    const floor = opts.minChars ? opts.minChars * 0.9 : opts.bodyMd.replace(/\s+/g, "").length * 0.6;
    // 이미지 마커 보존 + 과도 축소 아님일 때만 재작성본 재평가.
    if (newImgs >= origImgs && outChars >= floor && out.length > 50) {
      const second = await evaluate(out);
      // 재작성이 결정론 미달 수를 줄였거나 루브릭 점수를 올렸으면 채택.
      const improved =
        second.det.failed.length < first.det.failed.length ||
        (second.rubricScore ?? 0) > (first.rubricScore ?? 0) ||
        second.pass;
      if (improved) {
        finalBody = out;
        rewritten = true;
        return {
          bodyMd: finalBody,
          rubricScore: second.rubricScore,
          issues: buildReviewIssues(second.det.failed, second.rubricScore, second.rubricIssues),
          rewritten,
          inTokens,
          outTokens,
          costCents,
        };
      }
    }
  } catch {
    // 재작성 실패 → 원본 유지 + 1차 판정 issues 노출.
  }

  return {
    bodyMd: finalBody,
    rubricScore: first.rubricScore,
    issues: buildReviewIssues(first.det.failed, first.rubricScore, first.rubricIssues),
    rewritten,
    inTokens,
    outTokens,
    costCents,
  };
}

const REVIEW_V1_PASS = 7; // §7: 7점 미만 재작성

/** 검수자 노출용 issue 라벨 조립(seoIssues 에 얹음). */
function buildReviewIssues(
  failed: string[],
  rubricScore: number | null,
  rubricIssues: string[]
): string[] {
  const out: string[] = [];
  if (failed.length) out.push(`📝 후기 필수요소 미충족: ${failed.join(", ")}`);
  if (rubricScore !== null && rubricScore < REVIEW_V1_PASS) {
    out.push(`📝 사람다움 루브릭 ${rubricScore}/10 (기준 ${REVIEW_V1_PASS})${rubricIssues.length ? ` — ${rubricIssues.slice(0, 3).join(" / ")}` : ""}`);
  }
  return out;
}

/**
 * 목표 길이에 못 미친 본문을 목표까지 반복 확장한다(최대 3패스).
 * WHY: 모델은 큰 분량을 단일 패스로 잘 안 따른다(자동·반자동 공통). "전체를 다시 길게 써라"는
 * 방식은 gpt-4o가 비슷한 길이로 리라이트해버려 증가가 안 됐다(실측 982자에서 정체).
 * 그래서 "아직 안 다룬 소주제로 이어질 새 H2 섹션만 작성"하게 하고 기존 본문 뒤에 덧붙인다 —
 * 증가가 구조적으로 보장되고 모델이 훨씬 잘 따른다. 목표의 95%에 도달하거나 새 내용을
 * 못 만들면 중단한다. 자동·반자동 경로가 이 한 함수를 공유한다.
 */
async function expandBodyToTarget(opts: {
  rawBody: string;
  lengthTarget: number;
  preamble: string;
  callerUserId?: string;
  maxTokens?: number;
  /** 페르소나 '없는 시설/금지 소재' — 분량 확보 시 지어내지 못하게 명시 열거한다. */
  forbiddenTerms?: string[];
  /** 일반 상식 소재 — 패딩 대신 실재료로 확장하도록 참고 제공. */
  domainMaterial?: string[];
}): Promise<{ bodyMd: string; inTokens: number; outTokens: number; costCents: number }> {
  const noWs = (s: string) => s.replace(/\s+/g, "").length;
  let rawBody = opts.rawBody;
  let cur = noWs(rawBody);
  let inTokens = 0;
  let outTokens = 0;
  let costCents = 0;
  // 갭이 클수록 패스를 더 준다 — 새 내용을 못 만들면 아래에서 자동 중단되므로 비용 안전.
  const maxPasses = opts.lengthTarget - cur >= 1000 ? 3 : 2;
  for (let pass = 0; pass < maxPasses && cur < opts.lengthTarget * 0.95; pass++) {
    const gap = opts.lengthTarget - cur;
    const addSections = Math.max(2, Math.round(gap / 450));
    const more = await llm({
      system: opts.preamble,
      callerUserId: opts.callerUserId,
      maxTokens: opts.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            `# 작업: 아래 블로그 본문에 이어질 새 섹션을 작성`,
            `현재 본문은 공백 제외 약 ${cur}자입니다. 목표 약 ${opts.lengthTarget}자까지 약 ${gap}자가 더 필요합니다.`,
            `아래 "기존 본문"에서 아직 다루지 않은 소주제로 새 H2(##) 섹션을 ${addSections}개 작성하세요. 각 섹션은 공백 제외 300~500자 분량의 구체적 내용으로.`,
            `- 기존 본문 내용을 반복하지 말고, 새로운 정보·관점·이용 팁·자주 묻는 질문 등으로 다양화하세요.`,
            `- 글의 톤·말투·격식·금지어는 기존 본문과 동일하게 유지하세요.`,
            `- 확인되지 않은 시설·프로그램·수치·가격을 지어내지 마세요(없는 사실 날조 금지). 확실한 것의 디테일·독자 관점·일반적 정황으로 자연스럽게 채우세요.`,
            opts.forbiddenTerms?.length
              ? `- **다음은 이 업체에 없으므로 절대 언급 금지(띄어쓰기·표현 우회도 금지): ${opts.forbiddenTerms.join(", ")}.** 분량이 부족해도 이것들로 채우지 마세요.`
              : null,
            opts.domainMaterial?.length
              ? `- 아래 "일반 상식 소재"를 구체적으로 활용해 채우세요(막연한 분위기 문장 금지). 단 이 업체가 제공하는 프로그램으로 단정하진 마세요:\n${opts.domainMaterial
                  .map((s) => `    · ${s}`)
                  .join("\n")}`
              : null,
            `- 제목(#)·인사말·마무리 CTA·이미지 마커(<!-- IMG -->)는 넣지 마세요. 오직 새 ## 섹션 본문만 출력.`,
            ``,
            `**기존 본문 (참고용 — 다시 출력하지 마세요)**:`,
            "```markdown",
            rawBody,
            "```",
            ``,
            `이어질 새 ## 섹션들의 Markdown만 출력하세요.`,
          ]
            .filter((x) => x !== null)
            .join("\n"),
        },
      ],
    });
    const add = more.text
      .trim()
      .replace(/^```(?:markdown)?/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    inTokens += more.inputTokens;
    outTokens += more.outputTokens;
    costCents += more.costCents;
    if (noWs(add) < 80) break; // 모델이 새 내용을 못 만들면 직전 최선값 유지하고 중단
    rawBody = `${rawBody.trimEnd()}\n\n${add}`;
    cur = noWs(rawBody);
  }
  return { bodyMd: rawBody, inTokens, outTokens, costCents };
}

/**
 * 일반 상식 소재 채널 — how-to/콘텐츠성 주제일 때 '검증된 일반 지식'을 재료로 모은다.
 * WHY: 업체 고유 사실(시설)은 있어도 '주제를 채울 일반 상식'(운동 종목·순서 등)이 없으면
 * 생성이 구체 정보 대신 분위기 문장으로 분량만 채운다(빈 껍데기). LLM 자체 일반 지식을
 * 소스로 뽑아 헛소리·업체주장 오염을 filterDomainMaterial 로 걸러 순수 일반 지식만 남긴다.
 * 발동 조건 미충족이면 빈 배열(비용·오남용 절제). mock/가이드 비활성이면 스킵.
 */
async function collectDomainMaterial(opts: {
  title: string;
  primaryKeyword: string;
  niche?: string;
  angleOrBrief?: string | null;
  absentFacilities: string[];
  preamble: string;
  callerUserId?: string;
  model: string;
}): Promise<{ material: string[]; inTokens: number; outTokens: number; costCents: number }> {
  const zero = { material: [] as string[], inTokens: 0, outTokens: 0, costCents: 0 };
  if (opts.model === "mock") return zero;
  const probe = `${opts.title}\n${opts.primaryKeyword}\n${opts.angleOrBrief ?? ""}`;
  if (!topicNeedsDomainMaterial(probe)) return zero;
  try {
    const res = await llm({
      system: opts.preamble,
      callerUserId: opts.callerUserId,
      maxTokens: 900,
      reasoningEffort: "low", // 구조적 소재 수집 — 프로즈 아님, 속도↑
      messages: [
        {
          role: "user",
          content: domainMaterialPrompt({
            title: opts.title,
            primaryKeyword: opts.primaryKeyword,
            niche: opts.niche,
            angleOrBrief: opts.angleOrBrief,
            absentFacilities: opts.absentFacilities,
          }),
        },
      ],
    });
    const parsed = safeJson<{ material?: string[] }>(res.text);
    const raw = Array.isArray(parsed?.material) ? parsed!.material!.filter((s) => typeof s === "string") : [];
    const material = filterDomainMaterial(raw, opts.absentFacilities);
    return { material, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents };
  } catch {
    return zero;
  }
}

/**
 * 정보 부족 시 대화형 보강 루프의 요청 신호.
 * 억지 생성 대신 "이런 정보를 더 달라"고 되물을 때 던진다 — 서버 액션이 잡아 폼에 안내를 돌려주고,
 * 사용자가 추가 입력하면 supplements(누적)에 얹어 재호출한다. 누적 정보는 라운드마다 유지된다.
 */
export class NeedsMoreInfoError extends Error {
  requestMessage: string;
  missingFields: string[];
  supplements: string[];
  constructor(requestMessage: string, missingFields: string[], supplements: string[]) {
    super(requestMessage);
    this.name = "NeedsMoreInfoError";
    this.requestMessage = requestMessage;
    this.missingFields = missingFields;
    this.supplements = supplements;
  }
}

export type AugmentArg = {
  /** 지금까지 누적된 이전 라운드 입력들(폼이 hidden 필드로 되돌려 준다). */
  supplements?: string[];
  /** 이번 라운드에 새로 받은 추가 입력. */
  newSupplement?: string;
};

/**
 * 이번 라운드 입력을 누적에 병합하고 '진전 여부'를 판정한다([B] 무한 요청 방지).
 * 진전이 있으면 누적하고 계속 되묻고, 없으면(공백/무의미/직전과 동일) stalled=true 로
 * 되묻기를 멈춘다(호출부는 누적 정보만으로 최선 생성 + 한계 고지).
 */
function mergeAugment(augment?: AugmentArg): { supplements: string[]; stalled: boolean } {
  const prior = (augment?.supplements ?? []).filter((s) => s && s.trim());
  const incoming = augment?.newSupplement?.trim();
  if (!incoming) return { supplements: prior, stalled: false };
  const prog = assessSupplementProgress(prior, incoming);
  if (prog.progressed) return { supplements: [...prior, incoming], stalled: false };
  return { supplements: prior, stalled: true };
}

/**
 * 시스템 프롬프트 = 서비스 전체 공통 가이드(최우선) + 블로그 페르소나.
 * 모든 초안 생성/재작성이 이걸 써서, 전역 규칙이 페르소나보다 우선 적용된다.
 */
async function buildSystemPreamble(persona: PersonaInput): Promise<string> {
  const guide = await globalGuideBlock();
  const personaText = personaPreamble(persona);
  return [guide, personaText].filter(Boolean).join("\n\n");
}

function safeJson<T = unknown>(text: string): T | null {
  // Tolerate code fences if the model slipped
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function seasonForNow() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const season =
    m <= 2 || m === 12 ? "겨울" : m <= 5 ? "봄~초여름" : m <= 8 ? "한여름" : "가을";
  return `${d.getFullYear()}년 ${m}월 ${dd}일, ${season}`;
}

function personaFromRow(blog: typeof schema.blogs.$inferSelect, p: typeof schema.personas.$inferSelect): PersonaInput {
  return {
    blogName: blog.displayName,
    niche: blog.niche,
    purpose: p.purpose ?? "",
    audience: p.audience ?? "",
    brandVoice: p.brandVoice ?? "",
    pointOfView: p.pointOfView,
    formality: p.formality,
    ageGroup: p.ageGroup,
    gender: p.gender,
    focusKeywords: JSON.parse(p.focusKeywordsJson || "[]"),
    forbiddenWords: JSON.parse(p.forbiddenWordsJson || "[]"),
    ctas: JSON.parse(p.callsToActionJson || "[]"),
    qualityRules: JSON.parse(p.qualityRulesJson || "[]"),
    facilities: JSON.parse(p.facilitiesJson || "[]"),
    absentFacilities: JSON.parse(p.absentFacilitiesJson || "[]"),
    sampleSnippets: JSON.parse(p.sampleSnippetsJson || "[]"),
    preferredLengthMin: p.preferredLengthMin,
    preferredLengthMax: p.preferredLengthMax,
    imagesPerPostMin: p.imagesPerPostMin,
    imagesPerPostMax: p.imagesPerPostMax,
    emojiIntensity: (p.emojiIntensity === 0 || p.emojiIntensity === 1 || p.emojiIntensity === 2 || p.emojiIntensity === 3
      ? p.emojiIntensity
      : null) as PersonaInput["emojiIntensity"],
    notes: p.notes,
  };
}

/* ============================================================
   PUBLIC ENTRY POINTS
   ============================================================ */

export async function generateDraftForBlog(
  blogId: string,
  callerUserId?: string,
  augment?: AugmentArg,
  /** 백그라운드 생성 — 이 초안 행(status="draft")을 채워 넣는다(INSERT 대신 UPDATE).
   *  지정되면 되묻기(NeedsMoreInfoError)를 던지지 않고 있는 정보로 최선 생성 + 한계 고지한다. */
  existingDraftId?: string
) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona =
    blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(blog, activePersona);
  const basePreamble = await buildSystemPreamble(persona);

  /* 자동 경로의 목표 분량 = 페르소나 설정 범위의 중앙값.
     WHY: 자동 경로는 목표 길이를 프롬프트에 넣기만 하고 max_tokens 상향·확장 재시도가 없어
     단일 패스로 목표의 48~77%(로그 실측)만 산출됐다. 반자동/재작성 경로와 동일하게
     목표를 정량화해 (1)프롬프트 주입 (2)토큰 천장 상향 (3)미달 시 확장 재시도를 건다.
     중앙값을 쓰면 확장 하한(목표의 90%)이 페르소나 최소 분량 위로 떨어져 범위 안에 안착한다. */
  const lengthTarget =
    persona.preferredLengthMin > 0 && persona.preferredLengthMax > 0
      ? Math.round((persona.preferredLengthMin + persona.preferredLengthMax) / 2)
      : null;
  /* 한국어(특히 gpt-4o 토크나이저)는 글자당 ~2토큰 + 마크업 오버헤드 → 기본 4096은 ~1700자에서
     잘린다. 목표글자×2.2 + 여유로 천장을 잡아 절단을 막는다. */
  const bodyMaxTokens = lengthTarget
    ? Math.min(16000, Math.max(4096, Math.round(lengthTarget * 2.2) + 1200))
    : undefined;

  /* --- 대화형 보강 루프: 착수 전 정보 부족 판정(①②) ---
     정보가 부족하고 아직 진전 여지가 있으면 억지 생성 대신 되묻는다(NeedsMoreInfoError).
     진전 없이 종료(stalled)면 누적 정보만으로 최선 생성하고 한계를 고지한다. */
  const { supplements, stalled } = mergeAugment(augment);
  /* 백그라운드 생성(existingDraftId) 중엔 대화형 되묻기가 불가하므로 되묻지 않고
     stalled 와 동일하게 '있는 정보로 최선 + 한계 고지'로 처리한다. */
  const canClarify = !stalled && !existingDraftId;
  const preReport = assessInsufficiency(persona, { lengthTarget, supplements });
  if (!preReport.sufficient && canClarify) {
    throw new NeedsMoreInfoError(preReport.requestMessage, preReport.missingFields, supplements);
  }
  let limitationFlag = !preReport.sufficient && !canClarify ? limitationNotice(preReport.missingFields) : null;
  const preamble = augmentedPreamble(basePreamble, supplements);

  /* --- Step 1: discover topic candidates (skip if any selected unused topic exists) --- */
  const recent = await db.query.drafts.findMany({
    where: eq(schema.drafts.blogId, blogId),
    orderBy: desc(schema.drafts.createdAt),
    limit: 10,
  });
  const recentTitles = recent.map((r) => r.title);

  // 토픽 리서치 토큰은 재생성(날조 후보 전멸 시)까지 합산한다.
  let topicInTokens = 0;
  let topicOutTokens = 0;
  let topicCostCents = 0;
  type TopicCand = {
    title: string;
    angle: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
    rationale: string;
    score: number;
  };
  const runTopicResearch = async (): Promise<TopicCand[]> => {
    const r = await llm({
      system: preamble,
      messages: [
        {
          role: "user",
          content: topicResearchPrompt({
            persona,
            recentTitles,
            season: seasonForNow(),
          }),
        },
      ],
      callerUserId,
      reasoningEffort: "low", // 주제 후보 선정(구조적) — 프로즈 아님, 속도↑
    });
    topicInTokens += r.inputTokens;
    topicOutTokens += r.outputTokens;
    topicCostCents += r.costCents;
    return safeJson<TopicCand[]>(r.text) ?? [];
  };

  const absent = persona.absentFacilities;
  const isCleanTopic = (t: TopicCand) =>
    findAbsentFacilityHits(
      `${t.title}\n${t.angle ?? ""}\n${t.primaryKeyword} ${(t.secondaryKeywords ?? []).join(" ")}`,
      absent
    ).length === 0;

  let topics = await runTopicResearch();
  /* 없는 시설(수영장 등)을 참조하는 후보는 날조 세탁의 씨앗이므로 제거한다.
     모든 후보가 오염됐으면 1회 재생성해 깨끗한 후보를 확보한다(그래도 전멸이면
     프롬프트 제약에 맡기고 원본 유지 — 하위 단계 가이드가 재차 걸러낸다). */
  if (absent.length && topics.length) {
    let clean = topics.filter(isCleanTopic);
    if (clean.length === 0) {
      const retry = await runTopicResearch();
      clean = retry.filter(isCleanTopic);
      if (clean.length) topics = clean;
    } else {
      topics = clean;
    }
  }

  let topicRow: typeof schema.topicCandidates.$inferSelect | undefined;
  if (topics.length) {
    const best = [...topics].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const inserted = await db
      .insert(schema.topicCandidates)
      .values({
        blogId,
        title: best.title,
        angle: best.angle,
        primaryKeyword: best.primaryKeyword,
        secondaryKeywordsJson: JSON.stringify(best.secondaryKeywords ?? []),
        score: best.score ?? null,
        rationale: best.rationale,
        source: "llm",
        intentType: "informational",
        status: "selected",
      })
      .returning();
    topicRow = inserted[0];
  } else {
    // Fallback minimal topic if mock returned non-JSON
    const inserted = await db
      .insert(schema.topicCandidates)
      .values({
        blogId,
        title: "[MOCK] 주제 후보 자리표시",
        primaryKeyword: persona.focusKeywords[0] ?? "주제",
        secondaryKeywordsJson: "[]",
        score: 50,
        rationale: "Anthropic 키 미연결 — 데모 출력",
        source: "llm",
        status: "selected",
      })
      .returning();
    topicRow = inserted[0];
  }

  /* --- Step 2: outline --- */
  const outlineRes = await llm({
    system: preamble,
    callerUserId,
    messages: [
      {
        role: "user",
        content: outlinePrompt({
          persona,
          topic: {
            title: topicRow!.title,
            angle: topicRow!.angle,
            primaryKeyword: topicRow!.primaryKeyword,
            secondaryKeywords: JSON.parse(
              topicRow!.secondaryKeywordsJson || "[]"
            ),
          },
          lengthTarget: lengthTarget ?? undefined,
        }),
      },
    ],
    reasoningEffort: "low", // 아웃라인(구조적) — 프로즈 아님, 속도↑
  });
  const outline = safeJson<{
    hookParagraph: string;
    sections: Array<{ h2: string; summary: string; needsImage: boolean }>;
    imagePlan: Array<{
      slot: number;
      role: "hero" | "inline" | "store" | "product";
      description: string;
      needsUserShot: boolean;
    }>;
  }>(outlineRes.text) ?? {
    hookParagraph: "",
    sections: [],
    imagePlan: [],
  };

  /* --- Step 2.5: 일반 상식 소재 수집(how-to/콘텐츠성 주제일 때) --- */
  const dm = await collectDomainMaterial({
    title: topicRow!.title,
    primaryKeyword: topicRow!.primaryKeyword,
    niche: persona.niche ?? undefined,
    angleOrBrief: topicRow!.angle,
    absentFacilities: persona.absentFacilities,
    preamble,
    callerUserId,
    model: "auto",
  });
  const domainMaterial = dm.material;

  /* --- Step 3: body --- */
  const bodyRes = await llm({
    system: preamble,
    callerUserId,
    maxTokens: bodyMaxTokens,
    messages: [
      {
        role: "user",
        content: bodyPrompt({
          persona,
          topic: {
            title: topicRow!.title,
            primaryKeyword: topicRow!.primaryKeyword,
            secondaryKeywords: JSON.parse(
              topicRow!.secondaryKeywordsJson || "[]"
            ),
          },
          outline,
          lengthTarget: lengthTarget ?? undefined,
          domainMaterial,
        }),
      },
    ],
  });
  let rawBody = bodyRes.text.trim();
  let bodyInTokens = bodyRes.inputTokens;
  let bodyOutTokens = bodyRes.outputTokens;
  let bodyCostCents = bodyRes.costCents;

  /* --- Step 3.4: 목표 분량 미달 시 반복 확장 ---
     단일 패스는 목표의 절반가량만 산출된다(로그 실측) → 반자동/재작성과 동일 확장 전략. */
  if (lengthTarget && bodyRes.model !== "mock") {
    const exp = await expandBodyToTarget({
      rawBody,
      lengthTarget,
      preamble,
      callerUserId,
      maxTokens: bodyMaxTokens,
      forbiddenTerms: persona.absentFacilities,
      domainMaterial,
    });
    rawBody = exp.bodyMd;
    bodyInTokens += exp.inTokens;
    bodyOutTokens += exp.outTokens;
    bodyCostCents += exp.costCents;
  }

  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 ---
     목표 분량 글은 humanize가 분량을 깎지 못하도록 minChars(현재 95%) floor + max_tokens를 건다. */
  const humMinChars = lengthTarget
    ? Math.round(rawBody.replace(/\s+/g, "").length * 0.95)
    : undefined;
  const hum = await humanizeBody({
    bodyMd: rawBody,
    title: topicRow!.title,
    preamble,
    callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword: topicRow!.primaryKeyword,
    minChars: humMinChars,
    maxTokens: bodyMaxTokens,
    emojiLevel: resolveEmojiIntensity(persona).level,
  });
  /* --- Step 3.6: 발행 전 사실검증(fact-guard) — 근거 없는 구체 주장 걷어내기(업종 무관) ---
     누적 보강 정보도 확정 근거에 포함해 정상 확장을 허용한다. */
  const groundingText = buildGroundingText(persona, {
    title: topicRow!.title,
    primaryKeyword: topicRow!.primaryKeyword,
    secondaryKeywords: JSON.parse(topicRow!.secondaryKeywordsJson || "[]"),
    supplements,
    domainMaterial,
  });
  const guard = await factGuardBody({
    bodyMd: hum.bodyMd,
    title: topicRow!.title,
    groundingText,
    forbiddenTerms: persona.absentFacilities,
    preamble,
    callerUserId,
    model: bodyRes.model,
    maxTokens: bodyMaxTokens,
  });
  // 최종 분리: 작성 지시문·내부 메모가 본문에 새어든 흔적 제거(독자 노출 방지).
  const sanitized = sanitizeBody(guard.bodyMd);

  /* --- Step 3.7: 개정 가이드 자가검증 게이트(review_v1) — 미달 시 1회 재작성 --- */
  const review = await reviewVerifyPass({
    persona,
    bodyMd: sanitized,
    title: topicRow!.title,
    preamble,
    callerUserId,
    model: bodyRes.model,
    maxTokens: bodyMaxTokens,
    primaryKeyword: topicRow!.primaryKeyword,
    minChars: lengthTarget ? Math.round(sanitized.replace(/\s+/g, "").length * 0.9) : undefined,
  });
  const bodyMd = sanitizeBody(review.bodyMd);

  /* --- Step 4: score --- */
  const seo = scoreSeo({
    title: topicRow!.title,
    bodyMd,
    primaryKeyword: topicRow!.primaryKeyword,
    secondaryKeywords: JSON.parse(topicRow!.secondaryKeywordsJson || "[]"),
    imageCount: outline.imagePlan.length,
    minLen: persona.preferredLengthMin,
    maxLen: persona.preferredLengthMax,
  });
  const human = scoreHuman({
    bodyMd,
    forbiddenWords: persona.forbiddenWords,
  });

  const totalInTokens =
    topicInTokens + outlineRes.inputTokens + dm.inTokens + bodyInTokens + hum.inTokens + guard.inTokens + review.inTokens;
  const totalOutTokens =
    topicOutTokens + outlineRes.outputTokens + dm.outTokens + bodyOutTokens + hum.outTokens + guard.outTokens + review.outTokens;
  const totalCostCents =
    topicCostCents + outlineRes.costCents + dm.costCents + bodyCostCents + hum.costCents + guard.costCents + review.costCents;

  /* 발행 전 게이트(업종 무관): 사실검증 후에도 근거 없는 구체 주장(가격·수치·연혁·수상·규모·없는시설)이
     남았는지 결정론 검사해 플래그한다. 검수자가 카드에서 바로 인지하도록 seoIssues에 얹는다(비차단). */
  const fabHits = findFabricationHits(
    `${topicRow!.title}\n${bodyMd}`,
    groundingText,
    persona.absentFacilities
  );

  /* --- 대화형 보강 루프: 생성 중 폴백(③) ---
     목표 하한 미달 + 근거 없는 확장이 factGuard에 걸려 정상 확장으로 못 채운 상태면
     사실 소재 부족이 원인 → 진전 여지가 있으면 되묻고(초안 미저장), 진전 없으면 한계 고지 후 저장. */
  if (
    isLengthUnfillable({
      reachedChars: bodyMd.replace(/\s+/g, "").length,
      lengthTarget,
      fabricationKinds: fabHits.map((h) => h.kind),
    })
  ) {
    if (canClarify) {
      const req = buildAugmentationRequest(
        ["material"],
        `현재 약 ${bodyMd.replace(/\s+/g, "").length}자까지 썼지만 목표 분량을 근거 있는 내용으로 채우기엔 사실 소재가 부족합니다.`
      );
      throw new NeedsMoreInfoError(req, ["material"], supplements);
    }
    limitationFlag = limitationFlag ?? limitationNotice(["material"]);
  }

  /* --- Step 5: persist draft (백그라운드면 placeholder 행 UPDATE, 아니면 INSERT) --- */
  const draftValues = {
      blogId,
      topicId: topicRow!.id,
      title: topicRow!.title,
      summary: topicRow!.angle ?? null,
      bodyMd,
      imagePlanJson: JSON.stringify(outline.imagePlan),
      status: "ready_for_review" as const,
      charCount: bodyMd.replace(/\s+/g, "").length,
      imageCount: outline.imagePlan.length,
      seoScore: seo.score,
      seoIssuesJson: JSON.stringify([
        ...seo.checks.filter((c) => !c.ok).map((c) => c.label),
        ...(guard.removed.length
          ? [`🧹 사실검증: 근거없는 주장 ${guard.removed.length}건 제거`]
          : []),
        ...(guard.forbiddenHits.length
          ? [`🚫 금지 소재 잔존: ${guard.forbiddenHits.join(", ")} (하드 위반 — 재수정 필요)`]
          : []),
        ...(fabHits.length
          ? [`⚠️ 미검증 주장 잔존: ${fabHits.map((h) => h.match).join(", ")} (사실 확인 필요)`]
          : []),
        ...review.issues,
        ...(limitationFlag ? [limitationFlag] : []),
      ]),
      humanScore: human.score,
      llmModel: bodyRes.model,
      llmInputTokens: totalInTokens,
      llmOutputTokens: totalOutTokens,
      llmCostCents: totalCostCents,
      updatedAt: new Date().toISOString(),
  };
  const draft = existingDraftId
    ? (
        await db
          .update(schema.drafts)
          .set(draftValues)
          .where(eq(schema.drafts.id, existingDraftId))
          .returning()
      )[0]
    : (await db.insert(schema.drafts).values(draftValues).returning())[0];

  await db.insert(schema.draftVersions).values({
    draftId: draft.id,
    revision: 0,
    title: draft.title,
    bodyMd: draft.bodyMd,
    imagePlanJson: draft.imagePlanJson,
    reasonForChange: "최초 생성",
  });

  const userShotItems = outline.imagePlan.filter((p) => p.needsUserShot);
  for (const it of userShotItems) {
    await db.insert(schema.imageRequests).values({
      draftId: draft.id,
      slot: it.slot,
      description: it.description,
      composition: it.role === "hero" ? "탑다운, 자연광 1:1" : "16:9",
    });
  }

  await db.insert(schema.notifications).values({
    type: "draft_ready",
    title: `초안 준비됨 — ${blog.displayName}`,
    body: draft.title,
    linkUrl: `/queue/${draft.id}`,
    channel: "inapp",
  });

  // Fire-and-forget: 계정별 텔레그램 알림 (전역 단일 발송 제거 — 중복 방지)
  if (callerUserId) {
    void sendTelegramToUser(
      callerUserId,
      `📝 새 초안이 생성되었습니다!\n블로그: ${blog.displayName}\n제목: ${draft.title}\n검토 후 발행해 주세요.`
    );
    if (userShotItems.length > 0) {
      void sendTelegramToUser(
        callerUserId,
        `🖼️ 이미지 업로드가 필요합니다!\n블로그: ${blog.displayName}\n요청된 이미지를 업로드해 주세요.`
      );
    }
  }

  return draft;
}

/**
 * 반자동 모드 — 사용자가 주제/내용을 직접 입력해 초안 생성.
 * Step1(주제 자동탐색)은 건너뛰고 입력값을 사용하며, 아웃라인·본문은
 * 페르소나를 그대로 적용해 작성한다(톤·금지어·길이·CTA 유지).
 * 사진: photoMode='manual'이면 업로드 이미지를 본문 슬롯에 배치, 'auto'면 기존 사진요청 방식.
 */
export async function generateDraftFromBrief(opts: {
  blogId: string;
  callerUserId?: string;
  title: string;
  brief: string;
  keywords?: string[];
  photoMode: "manual" | "auto";
  /** photoMode='manual'일 때 폼에서 첨부된 이미지(이미 읽은 버퍼). label=사진 설명(본문 배치용). */
  uploadedImages?: Array<{ buffer: Buffer; mimeType: string; size: number; ext: string; label?: string }>;
  /** 대화형 보강 루프 — 누적된 이전 라운드 입력 + 이번 라운드 새 입력. */
  augment?: AugmentArg;
  /** 백그라운드 생성 — 이 초안 행(status="draft")을 채워 넣는다(INSERT 대신 UPDATE).
   *  지정되면 되묻기를 던지지 않고 있는 정보로 최선 생성 + 한계 고지한다. */
  existingDraftId?: string;
  /** 초안 요청이 지정한 화자(운영자/고객후기/전문가/3인칭). 있으면 페르소나 기본 화자를 덮어쓴다. */
  speaker?: BriefSpeaker | null;
}) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, opts.blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona =
    blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  // 초안 요청이 화자를 지정하면 페르소나 기본 화자를 덮어쓴다(미지정=하위호환).
  // 프리앰블·아웃라인·본문·review 게이트가 모두 이 실효 페르소나를 따른다.
  const persona = applyBriefSpeaker(personaFromRow(blog, activePersona), opts.speaker);
  const basePreamble = await buildSystemPreamble(persona);

  const title = opts.title.trim();
  const brief = opts.brief.trim();
  const keywords = (opts.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const primaryKeyword = keywords[0] ?? persona.focusKeywords[0] ?? title;
  const secondaryKeywords = keywords.slice(1);
  const manualImages = opts.photoMode === "manual" ? (opts.uploadedImages ?? []) : [];
  const imageSlotCount = opts.photoMode === "manual" ? manualImages.length : undefined;
  // 사진별 설명 라벨(slot 0..N-1) — 본문의 맞는 문단에 배치하도록 outline·body에 주입.
  const imageLabels =
    opts.photoMode === "manual" && manualImages.some((m) => m.label)
      ? manualImages.map((m) => m.label ?? "")
      : undefined;

  /* 사용자가 제목·브리프에 명시한 목표 글자수를 추출한다.
     WHY: 신규 작성 경로는 명시 길이를 파싱조차 안 하고 페르소나 기본 분량만 박아서
     "2000자로 작성" 요청이 700자로 잘렸다. 명시 길이는 페르소나 기본값보다 우선한다. */
  const lengthTarget = parseExplicitLength(`${title}\n${brief}`);
  /* 한국어 출력은 글자당 ~1~1.5토큰 + 마크업 오버헤드 → 목표글자×2.2에 여유를 더해 천장을 잡는다.
     기본 4096토큰은 2000자 이상 한국어 본문을 잘라낸다. */
  const bodyMaxTokens = lengthTarget
    ? Math.min(16000, Math.max(4096, Math.round(lengthTarget * 2.2) + 1200))
    : undefined;

  /* --- 대화형 보강 루프: 착수 전 정보 부족 판정(①②) ---
     반자동은 사용자가 직접 입력한 brief 도 근거·소재로 함께 본다. 부족하고 진전 여지가 있으면
     되묻고(NeedsMoreInfoError), 진전 없이 종료(stalled)면 누적 정보만으로 최선 생성 + 한계 고지. */
  const { supplements, stalled } = mergeAugment(opts.augment);
  /* 백그라운드 생성 중엔 대화형 되묻기 불가 → stalled 와 동일 처리(최선 생성 + 한계 고지). */
  const canClarify = !stalled && !opts.existingDraftId;
  const preReport = assessInsufficiency(persona, { lengthTarget, userBrief: brief, supplements });
  if (!preReport.sufficient && canClarify) {
    throw new NeedsMoreInfoError(preReport.requestMessage, preReport.missingFields, supplements);
  }
  let limitationFlag = !preReport.sufficient && !canClarify ? limitationNotice(preReport.missingFields) : null;
  const preamble = augmentedPreamble(basePreamble, supplements);

  /* --- Step 1 대체: 사용자 지정 주제를 topicCandidate로 기록 --- */
  const [topicRow] = await db
    .insert(schema.topicCandidates)
    .values({
      blogId: opts.blogId,
      title,
      angle: brief ? brief.slice(0, 160) : null,
      primaryKeyword,
      secondaryKeywordsJson: JSON.stringify(secondaryKeywords),
      score: null,
      rationale: "사용자 직접 입력(반자동)",
      source: "manual",
      intentType: "informational",
      status: "selected",
    })
    .returning();

  /* --- Step 2: outline (사용자 brief + 고정 이미지 슬롯 반영) --- */
  const outlineRes = await llm({
    system: preamble,
    callerUserId: opts.callerUserId,
    messages: [
      {
        role: "user",
        content: outlinePrompt({
          persona,
          topic: { title, angle: topicRow.angle, primaryKeyword, secondaryKeywords },
          userBrief: brief,
          imageSlotCount,
          imageLabels,
          lengthTarget: lengthTarget ?? undefined,
        }),
      },
    ],
    reasoningEffort: "low", // 아웃라인(구조적) — 프로즈 아님, 속도↑
  });
  const outline = safeJson<{
    hookParagraph: string;
    sections: Array<{ h2: string; summary: string; needsImage: boolean }>;
    imagePlan: Array<{
      slot: number;
      role: "hero" | "inline" | "store" | "product";
      description: string;
      needsUserShot: boolean;
    }>;
  }>(outlineRes.text) ?? { hookParagraph: "", sections: [], imagePlan: [] };

  /* --- Step 2.5: 일반 상식 소재 수집(how-to/콘텐츠성 주제일 때) --- */
  const dm = await collectDomainMaterial({
    title,
    primaryKeyword,
    niche: persona.niche ?? undefined,
    angleOrBrief: brief || topicRow.angle,
    absentFacilities: persona.absentFacilities,
    preamble,
    callerUserId: opts.callerUserId,
    model: "auto",
  });
  const domainMaterial = dm.material;

  /* --- Step 3: body --- */
  const bodyRes = await llm({
    system: preamble,
    callerUserId: opts.callerUserId,
    maxTokens: bodyMaxTokens,
    messages: [
      {
        role: "user",
        content: bodyPrompt({
          persona,
          topic: { title, primaryKeyword, secondaryKeywords },
          outline,
          userBrief: brief,
          imageLabels,
          lengthTarget: lengthTarget ?? undefined,
          domainMaterial,
        }),
      },
    ],
  });
  let rawBody = bodyRes.text.trim();
  let bodyInTokens = bodyRes.inputTokens;
  let bodyOutTokens = bodyRes.outputTokens;
  let bodyCostCents = bodyRes.costCents;

  /* --- Step 3.4: 명시 길이 미달 시 반복 확장(자동 경로와 공유 헬퍼) --- */
  if (lengthTarget) {
    const exp = await expandBodyToTarget({
      rawBody,
      lengthTarget,
      preamble,
      callerUserId: opts.callerUserId,
      maxTokens: bodyMaxTokens,
      forbiddenTerms: persona.absentFacilities,
      domainMaterial,
    });
    rawBody = exp.bodyMd;
    bodyInTokens += exp.inTokens;
    bodyOutTokens += exp.outTokens;
    bodyCostCents += exp.costCents;
  }

  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 ---
     명시 길이 글은 humanize가 분량을 깎지 못하도록 minChars(현재 95%) floor + max_tokens를 건다. */
  const humMinChars = lengthTarget
    ? Math.round(rawBody.replace(/\s+/g, "").length * 0.95)
    : undefined;
  const hum = await humanizeBody({
    bodyMd: rawBody,
    title,
    preamble,
    callerUserId: opts.callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword,
    minChars: humMinChars,
    maxTokens: bodyMaxTokens,
    emojiLevel: resolveEmojiIntensity(persona).level,
  });
  /* --- Step 3.6: 발행 전 사실검증(fact-guard) — 근거 없는 구체 주장 걷어내기(업종 무관) ---
     반자동은 사용자가 직접 입력한 brief 도 확정 사실 근거에 포함한다. */
  const groundingText = buildGroundingText(persona, {
    title,
    primaryKeyword,
    secondaryKeywords,
    userBrief: brief,
    supplements,
    domainMaterial,
  });
  const guard = await factGuardBody({
    bodyMd: hum.bodyMd,
    title,
    groundingText,
    forbiddenTerms: persona.absentFacilities,
    preamble,
    callerUserId: opts.callerUserId,
    model: bodyRes.model,
    maxTokens: bodyMaxTokens,
  });
  // 최종 분리: 작성 지시문·내부 메모가 본문에 새어든 흔적 제거(독자 노출 방지).
  const sanitized = sanitizeBody(guard.bodyMd);

  /* --- Step 3.7: 개정 가이드 자가검증 게이트(review_v1) — 미달 시 1회 재작성 --- */
  const review = await reviewVerifyPass({
    persona,
    bodyMd: sanitized,
    title,
    preamble,
    callerUserId: opts.callerUserId,
    model: bodyRes.model,
    maxTokens: bodyMaxTokens,
    primaryKeyword,
    minChars: lengthTarget ? Math.round(sanitized.replace(/\s+/g, "").length * 0.9) : undefined,
  });
  const bodyMd = sanitizeBody(review.bodyMd);

  /* --- Step 4: score --- */
  const seo = scoreSeo({
    title,
    bodyMd,
    primaryKeyword,
    secondaryKeywords,
    imageCount: outline.imagePlan.length,
    // 사용자가 명시 길이를 줬으면 그 목표(±10%)를 SEO 길이 기준으로 쓴다 — 페르소나 기본 분량으로
    // 채점하면 명시 길이 글이 '너무 김'으로 부당하게 감점된다.
    minLen: lengthTarget ? Math.round(lengthTarget * 0.9) : persona.preferredLengthMin,
    maxLen: lengthTarget ? Math.round(lengthTarget * 1.2) : persona.preferredLengthMax,
  });
  const human = scoreHuman({ bodyMd, forbiddenWords: persona.forbiddenWords });

  const fabHits = findFabricationHits(`${title}\n${bodyMd}`, groundingText, persona.absentFacilities);

  /* --- 대화형 보강 루프: 생성 중 폴백(③) --- */
  if (
    isLengthUnfillable({
      reachedChars: bodyMd.replace(/\s+/g, "").length,
      lengthTarget,
      fabricationKinds: fabHits.map((h) => h.kind),
    })
  ) {
    if (canClarify) {
      const req = buildAugmentationRequest(
        ["material"],
        `현재 약 ${bodyMd.replace(/\s+/g, "").length}자까지 썼지만 목표 분량을 근거 있는 내용으로 채우기엔 사실 소재가 부족합니다.`
      );
      throw new NeedsMoreInfoError(req, ["material"], supplements);
    }
    limitationFlag = limitationFlag ?? limitationNotice(["material"]);
  }

  const totalInTokens = outlineRes.inputTokens + dm.inTokens + bodyInTokens + hum.inTokens + guard.inTokens + review.inTokens;
  const totalOutTokens = outlineRes.outputTokens + dm.outTokens + bodyOutTokens + hum.outTokens + guard.outTokens + review.outTokens;
  const totalCostCents = outlineRes.costCents + dm.costCents + bodyCostCents + hum.costCents + guard.costCents + review.costCents;

  /* --- Step 5: persist draft (백그라운드면 placeholder 행 UPDATE, 아니면 INSERT) --- */
  const draftValues = {
      blogId: opts.blogId,
      topicId: topicRow.id,
      title,
      summary: brief ? brief.slice(0, 200) : null,
      bodyMd,
      imagePlanJson: JSON.stringify(outline.imagePlan),
      status: "ready_for_review" as const,
      charCount: bodyMd.replace(/\s+/g, "").length,
      imageCount: outline.imagePlan.length,
      seoScore: seo.score,
      seoIssuesJson: JSON.stringify([
        ...seo.checks.filter((c) => !c.ok).map((c) => c.label),
        ...(guard.removed.length
          ? [`🧹 사실검증: 근거없는 주장 ${guard.removed.length}건 제거`]
          : []),
        ...(guard.forbiddenHits.length
          ? [`🚫 금지 소재 잔존: ${guard.forbiddenHits.join(", ")} (하드 위반 — 재수정 필요)`]
          : []),
        ...(fabHits.length
          ? [`⚠️ 미검증 주장 잔존: ${fabHits.map((h) => h.match).join(", ")} (사실 확인 필요)`]
          : []),
        ...review.issues,
        ...(limitationFlag ? [limitationFlag] : []),
      ]),
      humanScore: human.score,
      llmModel: bodyRes.model,
      llmInputTokens: totalInTokens,
      llmOutputTokens: totalOutTokens,
      llmCostCents: totalCostCents,
      updatedAt: new Date().toISOString(),
  };
  const draft = opts.existingDraftId
    ? (
        await db
          .update(schema.drafts)
          .set(draftValues)
          .where(eq(schema.drafts.id, opts.existingDraftId))
          .returning()
      )[0]
    : (await db.insert(schema.drafts).values(draftValues).returning())[0];

  await db.insert(schema.draftVersions).values({
    draftId: draft.id,
    revision: 0,
    title: draft.title,
    bodyMd: draft.bodyMd,
    imagePlanJson: draft.imagePlanJson,
    reasonForChange: "최초 생성(반자동)",
  });

  /* --- 사진 처리 --- */
  if (opts.photoMode === "manual" && manualImages.length > 0) {
    // 업로드된 이미지를 저장하고 본문 슬롯(0..N-1)에 직접 배치
    for (let i = 0; i < manualImages.length; i++) {
      const img = manualImages[i];
      const { urlPath, size } = await saveImageBuffer(img.buffer, img.ext);
      await db.insert(schema.images).values({
        blogId: opts.blogId,
        draftId: draft.id,
        source: "upload",
        filePath: urlPath,
        mimeType: img.mimeType,
        fileSize: size,
        sourceMetaJson: JSON.stringify({ slot: i, label: img.label || undefined }),
      });
    }
  } else {
    // 기존 방식 — AI가 user shot 필요로 표시한 슬롯을 사진 요청으로 생성
    const userShotItems = outline.imagePlan.filter((p) => p.needsUserShot);
    for (const it of userShotItems) {
      await db.insert(schema.imageRequests).values({
        draftId: draft.id,
        slot: it.slot,
        description: it.description,
        composition: it.role === "hero" ? "탑다운, 자연광 1:1" : "16:9",
      });
    }
  }

  await db.insert(schema.notifications).values({
    type: "draft_ready",
    title: `초안 준비됨 — ${blog.displayName}`,
    body: draft.title,
    linkUrl: `/queue/${draft.id}`,
    channel: "inapp",
  });

  if (opts.callerUserId) {
    void sendTelegramToUser(
      opts.callerUserId,
      `📝 새 초안이 생성되었습니다! (반자동)\n블로그: ${blog.displayName}\n제목: ${draft.title}\n검토 후 발행해 주세요.`
    );
  }

  return draft;
}

/* =========================================================================
   백그라운드 생성 오케스트레이션
   -------------------------------------------------------------------------
   생성 본작업(~3~5분)이 HTTP 요청을 붙잡으면 Railway 게이트웨이 타임아웃이 난다.
   해결: (1) 착수 전 '정보 부족' 되묻기는 동기로 먼저 판정(빠름·대화형 유지) →
        (2) 통과하면 placeholder 초안(status="draft") 즉시 생성 →
        (3) 무거운 파이프라인은 await 하지 않고 백그라운드로 실행(같은 초안 행을 UPDATE) →
        (4) 요청은 즉시 초안 페이지로 리다이렉트, 페이지가 폴링하며 완료를 기다린다.
   품질에는 무영향 — 동일 파이프라인을 그대로 돌리고 실행 시점만 요청 밖으로 옮긴다.
   ========================================================================= */

export type StartGenerationResult =
  | { ok: true; draftId: string }
  | { needsInfo: true; request: string; supplements: string[] };

/** 생성 실패 시 초안을 실패 상태로 표시하고(사유 메모) 알림을 보낸다. */
async function markDraftFailed(draftId: string, err: unknown, callerUserId?: string) {
  console.error(`[generation] draft ${draftId} 생성 실패:`, err);
  // NeedsMoreInfoError 는 백그라운드 경로에선 canClarify=false 로 절대 throw 되지 않으므로 여기 도달 X.
  const msg =
    err instanceof CreditExhaustedError || err instanceof UserApiKeyMissingError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  try {
    await db
      .update(schema.drafts)
      .set({
        status: "failed",
        seoIssuesJson: JSON.stringify([`⛔ 생성 실패: ${msg.slice(0, 200)}`]),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.drafts.id, draftId));
  } catch (e) {
    console.error("[generation] 실패 표시 자체가 실패:", e);
  }
  if (callerUserId) {
    void sendTelegramToUser(
      callerUserId,
      `⚠️ 초안 생성에 실패했습니다.\n사유: ${msg.slice(0, 160)}\n초안 페이지에서 다시 시도해 주세요.`
    );
  }
}

/** 완전자동 — 백그라운드 생성 착수. 정보 부족이면 되묻고, 아니면 placeholder 생성 후 즉시 반환. */
export async function startAutoGeneration(
  blogId: string,
  callerUserId?: string,
  augment?: AugmentArg
): Promise<StartGenerationResult> {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona = blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(blog, activePersona);
  const lengthTarget =
    persona.preferredLengthMin > 0 && persona.preferredLengthMax > 0
      ? Math.round((persona.preferredLengthMin + persona.preferredLengthMax) / 2)
      : null;

  // 착수 전 되묻기(동기·빠름). 진전 여지 있으면 대화형 보강 요청.
  const { supplements, stalled } = mergeAugment(augment);
  const pre = assessInsufficiency(persona, { lengthTarget, supplements });
  if (!pre.sufficient && !stalled) {
    return { needsInfo: true, request: pre.requestMessage, supplements };
  }

  // placeholder 초안(생성중). 제목은 주제탐색 후 채워지므로 임시값.
  const [placeholder] = await db
    .insert(schema.drafts)
    .values({ blogId, title: "초안 생성 중…", status: "draft" })
    .returning();

  // 백그라운드 실행 — 요청을 붙잡지 않는다(Railway 는 상주 프로세스라 응답 후에도 계속 돈다).
  void generateDraftForBlog(blogId, callerUserId, augment, placeholder.id).catch((err) =>
    markDraftFailed(placeholder.id, err, callerUserId)
  );
  return { ok: true, draftId: placeholder.id };
}

/** 반자동(직접 입력) — 백그라운드 생성 착수. */
export async function startBriefGeneration(opts: {
  blogId: string;
  callerUserId?: string;
  title: string;
  brief: string;
  keywords?: string[];
  photoMode: "manual" | "auto";
  uploadedImages?: Array<{ buffer: Buffer; mimeType: string; size: number; ext: string; label?: string }>;
  augment?: AugmentArg;
  /** 초안 요청이 지정한 화자. 있으면 페르소나 기본 화자를 덮어쓴다(미지정=하위호환). */
  speaker?: BriefSpeaker | null;
}): Promise<StartGenerationResult> {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, opts.blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona = blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = applyBriefSpeaker(personaFromRow(blog, activePersona), opts.speaker);
  const title = opts.title.trim();
  const brief = opts.brief.trim();
  const lengthTarget = parseExplicitLength(`${title}\n${brief}`);

  const { supplements, stalled } = mergeAugment(opts.augment);
  const pre = assessInsufficiency(persona, { lengthTarget, userBrief: brief, supplements });
  if (!pre.sufficient && !stalled) {
    return { needsInfo: true, request: pre.requestMessage, supplements };
  }

  const [placeholder] = await db
    .insert(schema.drafts)
    .values({ blogId: opts.blogId, title: title || "초안 생성 중…", status: "draft" })
    .returning();

  void generateDraftFromBrief({ ...opts, existingDraftId: placeholder.id }).catch((err) =>
    markDraftFailed(placeholder.id, err, opts.callerUserId)
  );
  return { ok: true, draftId: placeholder.id };
}

export async function reviseDraftWithFeedback(opts: {
  draftId: string;
  feedback: string;
  feedbackTags: string[];
  reviewerUserId?: string | null;
  callerUserId?: string;
}) {
  const draft = await db.query.drafts.findFirst({
    where: eq(schema.drafts.id, opts.draftId),
    with: { blog: { with: { personas: true } } },
  });
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  const activePersona =
    draft.blog.personas.find((p) => p.isActive) ?? draft.blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(draft.blog, activePersona);
  const basePreamble = await buildSystemPreamble(persona);
  /* 재작성 경로에선 시스템 프리앰블 끝에 '관리자 검수 우선' 규칙을 덧붙인다.
     WHY: 페르소나 격식("해요체 중심, 습니다체와 섞지 말 것")이 시스템 프롬프트라,
     user 메시지의 톤 변경 요청보다 강하게 작동해 본문 톤이 안 바뀌는 현상이 있었다(제목만 바뀜).
     관리자는 이 글에 대한 사람 검수자이므로, 충돌 시 관리자 코멘트가 페르소나 기본값을 이긴다. */
  const reviewerAuthority = [
    `## ⚠️ 관리자 검수 우선 규칙 (이 재작성 작업에 한해 위 페르소나 기본값보다 우선)`,
    `이 글은 관리자가 반려한 글을 다시 쓰는 작업입니다. 사용자 메시지에 담긴 관리자 코멘트가`,
    `위 페르소나의 기본 **격식·말투·시점·길이** 설정과 충돌하면, **반드시 관리자 코멘트를 따르세요.**`,
    `예1(톤): 페르소나 격식이 '해요체'여도 관리자가 '반말로'라고 하면, 제목뿐 아니라 본문의 모든 문장`,
    `종결어미를 실제 반말(~다/~어/~야/~지)로 끝까지 바꿉니다 — 위의 '해요체 중심' 규칙은 이 경우 무시합니다.`,
    `예2(시점): 페르소나 화법이 '1인칭 경험담/후기'여도 관리자가 '직원(사장/운영자) 시점으로'라고 하면,`,
    `글 전체의 주어·관점을 운영자로 끝까지 바꿉니다. 고객/방문자 표현('다녀왔어요','제가 가보니','방문해보시면',`,
    `'추천해요')을 운영자 표현('저희가 운영하는','직접 준비했습니다','찾아주시면','안내해 드릴게요')으로 전부 치환하고,`,
    `위의 '1인칭 경험담/후기 톤' 규칙은 이 경우 무시합니다 — 문장 일부만 바꾸고 나머지를 후기체로 남기면 미반영입니다.`,
    `단, **금지어와 사실·안전 규칙만은** 관리자 코멘트와 무관하게 예외 없이 유지합니다.`,
  ].join("\n");
  const preamble = `${basePreamble}\n\n${reviewerAuthority}`;

  /* 누적 반려 이력 — 과거 회차 반려 의도를 표준 제약으로 유지해야 직전 톤/스타일 회귀를 막는다.
     이번 회차 reject는 아래 line에서 사후 삽입되므로, 여기서 조회되는 건 과거 회차뿐이다. */
  const priorRejects = await db.query.approvals.findMany({
    where: and(
      eq(schema.approvals.draftId, draft.id),
      eq(schema.approvals.decision, "reject")
    ),
    orderBy: (a, { asc }) => [asc(a.revision)],
  });
  const priorFeedbacks = priorRejects
    .filter((r) => (r.feedback ?? "").trim().length > 0)
    .map((r) => ({
      revision: r.revision,
      feedback: r.feedback ?? "",
      feedbackTags: safeJson<string[]>(r.feedbackTagsJson) ?? [],
    }));

  /* 길이 의도를 LLM 호출 전에 계산한다 — 큰 확장 목표면 max_tokens를 올리고(기본 4096은
     3000자 한국어 출력+JSON을 잘라낸다), 결과가 목표에 크게 못 미치면 확장 패스를 반복하기 위함. */
  const lenIntent = parseLengthIntent(
    opts.feedback,
    draft.bodyMd.replace(/\s+/g, "").length,
    persona.preferredLengthMin,
    persona.preferredLengthMax
  );
  /* 한국어는 글자당 대략 1~1.5토큰 + JSON/마크업 오버헤드 → 목표글자×2.2에 여유를 더해 천장을 잡는다. */
  const reviseMaxTokens =
    lenIntent?.direction === "up"
      ? Math.min(16000, Math.max(4096, Math.round(lenIntent.targetChars * 2.2) + 1200))
      : undefined;

  const reviseOnce = (currentTitle: string, currentBodyMd: string) =>
    llm({
      system: preamble,
      callerUserId: opts.callerUserId,
      maxTokens: reviseMaxTokens,
      messages: [
        {
          role: "user",
          content: revisePrompt({
            persona,
            currentTitle,
            currentBodyMd,
            feedback: opts.feedback,
            feedbackTags: opts.feedbackTags,
            priorFeedbacks,
          }),
        },
      ],
    });

  let res = await reviseOnce(draft.title, draft.bodyMd);
  const parsed =
    safeJson<{ title: string; bodyMd: string }>(res.text) ?? {
      title: draft.title,
      bodyMd: res.text,
    };

  /* 확장 목표 미달 시 반복 확장(최대 2회 추가).
     WHY: 모델이 큰 분량 확장을 단일 패스로 잘 안 따른다(실측 600→3000 요청에 ~900자, 30%).
     직전 결과를 입력으로 같은 목표를 다시 걸어, 목표의 90%에 도달하거나 더 이상 안 늘면 중단한다. */
  if (lenIntent?.direction === "up") {
    const target = lenIntent.targetChars;
    let cur = parsed.bodyMd.replace(/\s+/g, "").length;
    for (let pass = 0; pass < 2 && cur < target * 0.9; pass++) {
      const more = await reviseOnce(parsed.title, parsed.bodyMd);
      const next = safeJson<{ title: string; bodyMd: string }>(more.text);
      const nextChars = next ? next.bodyMd.replace(/\s+/g, "").length : 0;
      if (!next || nextChars <= cur * 1.02) break; // 더 안 늘면(또는 파싱 실패) 직전 최선값 유지하고 중단
      parsed.title = next.title;
      parsed.bodyMd = next.bodyMd;
      cur = nextChars;
      res = more;
    }
  }

  /* 재작성 결과도 AI 티 제거(사람화) 패스 적용.
     분량 늘리기 반려면 humanize가 길이를 깎지 못하도록 minChars(revise 결과의 95%)를 건다. */
  const humMinChars =
    lenIntent?.direction === "up"
      ? Math.round(parsed.bodyMd.replace(/\s+/g, "").length * 0.95)
      : undefined;
  const hum = await humanizeBody({
    bodyMd: parsed.bodyMd,
    title: parsed.title,
    preamble,
    callerUserId: opts.callerUserId,
    model: res.model,
    brandName: persona.blogName,
    primaryKeyword: persona.focusKeywords[0],
    minChars: humMinChars,
    maxTokens: reviseMaxTokens,
    emojiLevel: resolveEmojiIntensity(persona).level,
  });
  parsed.bodyMd = hum.bodyMd;

  const nextRev = draft.revisionRound + 1;
  const seo = scoreSeo({
    title: parsed.title,
    bodyMd: parsed.bodyMd,
    primaryKeyword: "",
    secondaryKeywords: [],
    imageCount: draft.imageCount,
    minLen: persona.preferredLengthMin,
    maxLen: persona.preferredLengthMax,
  });
  const human = scoreHuman({
    bodyMd: parsed.bodyMd,
    forbiddenWords: persona.forbiddenWords,
  });

  await db.insert(schema.draftVersions).values({
    draftId: draft.id,
    revision: nextRev,
    title: parsed.title,
    bodyMd: parsed.bodyMd,
    imagePlanJson: draft.imagePlanJson,
    reasonForChange: opts.feedback,
  });

  await db
    .update(schema.drafts)
    .set({
      title: parsed.title,
      bodyMd: parsed.bodyMd,
      status: "ready_for_review",
      revisionRound: nextRev,
      seoScore: seo.score,
      humanScore: human.score,
      charCount: parsed.bodyMd.replace(/\s+/g, "").length,
      llmInputTokens: (draft.llmInputTokens ?? 0) + res.inputTokens,
      llmOutputTokens: (draft.llmOutputTokens ?? 0) + res.outputTokens,
      llmCostCents: (draft.llmCostCents ?? 0) + res.costCents,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, draft.id));

  await db.insert(schema.approvals).values({
    draftId: draft.id,
    reviewerUserId: opts.reviewerUserId ?? null,
    revision: draft.revisionRound,
    decision: "reject",
    feedback: opts.feedback,
    feedbackTagsJson: JSON.stringify(opts.feedbackTags),
  });

  return { revision: nextRev };
}
