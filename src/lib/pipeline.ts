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
  factGuardPrompt,
  assessInsufficiency,
  assessSupplementProgress,
  limitationNotice,
  augmentedPreamble,
  resolveEmojiIntensity,
  type EmojiIntensity,
  resolveWritingTemplate,
  applyBriefSpeaker,
  type BriefSpeaker,
  topicNeedsDomainMaterial,
  domainMaterialPrompt,
  filterDomainMaterial,
} from "./llm/prompts";
import { sanitizeBody } from "./markdown";
import { runModelReview } from "./review";
import { VERDICT_LABEL } from "./review-core";
import { recordSettingIssues } from "./proposals";
import { styleSampleBlock } from "./style-samples";
import { sendTelegramToUser } from "./telegram";
import { globalGuideBlock, getGlobalWritingGuide } from "./global-guide";
import {
  loadStyleMetricsDirective,
  loadStyleSamples,
} from "./style-samples";
import { saveImageBuffer } from "./storage";

/**
 * 본문 생성 후 'AI 티'를 걷어내는 사람화 리라이트 패스.
 * 전역 가이드가 켜져 있을 때만 동작. 사진 자리 마커를 잃거나 빈 응답이면 원본을 유지한다(사고 방지용 구조 체크).
 * 분량 기준(«절반 이하면 원본 유지») 같은 기계 규칙은 2026-10-13 A안으로 제거 — 품질 판단은 모델 검수가 한다.
 */
async function humanizeBody(opts: {
  bodyMd: string;
  title: string;
  preamble: string;
  callerUserId?: string;
  model: string;
  brandName?: string;
  primaryKeyword?: string;
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
    // 안전장치(구조 체크만): 사진 자리 마커를 잃거나 사실상 빈 응답이면 원본 유지(토큰은 정산).
    if (out.length < 50 || newImgs < origImgs) {
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
 * 안전장치는 humanize와 동일 — 이미지 마커 유실/빈 응답이면 원본 유지(토큰만 정산).
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
        if (Array.isArray(parsed.removed)) {
          removedAll.push(...parsed.removed.filter((s) => typeof s === "string"));
        }
        // 이미지 마커 유실·빈 응답이 아니면 채택(제거 목록은 감사용으로 항상 보존).
        if (!(newImgs < origImgs || out.length < 50)) {
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

/**
 * 모델 검수 단계(A안) — 생성 끝에서 글 전체를 검수 모델에 맡기고(revise 최대 1회), 판정·사유·플래그를 돌려준다.
 * 검수 모델이 보고한 설정 결함(setting_issues)은 개선 제안으로 기록한다(알림은 proposals.ts 공통 경로).
 */
async function reviewStage(opts: {
  persona: PersonaInput;
  title: string;
  bodyMd: string;
  groundingText: string;
  callerUserId?: string;
  blogId: string;
  personaId: string | null;
  blogName: string;
  ownerId: string | null;
  draftId: string | null;
  allowRevise?: boolean;
}) {
  const guide = await getGlobalWritingGuide();
  const samples = await loadStyleSamples(opts.persona.category).catch(() => []);
  const review = await runModelReview({
    persona: opts.persona,
    title: opts.title,
    bodyMd: opts.bodyMd,
    guideText: guide.enabled ? guide.text : "",
    factsText: opts.groundingText,
    styleSamplesText: samples.length ? styleSampleBlock(samples, "") : undefined,
    callerUserId: opts.callerUserId,
    allowRevise: opts.allowRevise,
  });
  return review;
}

/** 검수 결과를 초안 행에 저장할 필드로. */
function reviewColumns(review: Awaited<ReturnType<typeof reviewStage>>) {
  return {
    reviewVerdict: review.verdict,
    reviewReason: review.reason,
    reviewFlagsJson: JSON.stringify(review.hardFlags),
    reviewModel: review.model,
    reviewMetaJson: JSON.stringify(review.meta),
  };
}

/** 검수 모델의 설정 결함 보고 → 개선 제안 기록(실패해도 초안 저장을 막지 않는다). */
async function reportSettingIssues(review: Awaited<ReturnType<typeof reviewStage>>, ctx: {
  draftId: string;
  blogId: string;
  personaId: string | null;
  blogName: string;
  ownerId: string | null;
  callerUserId?: string;
}) {
  if (!review.settingIssues.length) return;
  try {
    const stat = await recordSettingIssues({ ...ctx, issues: review.settingIssues });
    console.log(`[proposals] draft ${ctx.draftId}: 생성 ${stat.created} · 합산 ${stat.merged} · 승격 ${stat.promoted} · 제외 ${stat.skipped} · 유사판정 ${stat.liteCalls}회`);
  } catch (err) {
    console.error("[proposals] 설정 결함 기록 실패:", err);
  }
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
export async function buildSystemPreamble(persona: PersonaInput): Promise<string> {
  const guide = await globalGuideBlock();
  const personaText = personaPreamble(persona);
  /* 문체 샘플 few-shot — 카테고리 미지정이거나 등록 0편이면 빈 문자열이라
     프롬프트가 기존과 완전히 동일해진다(회귀 금지). */
  const samples = await loadStyleSamples(persona.category);
  /* 지표 집계는 활성 샘플 «전체» 기준(원문은 count 편으로 제한돼도 목표 수치는 넓게 잡는다).
     원문이 0편이면 styleSampleBlock 이 빈 문자열이라 지시문도 함께 사라진다. */
  const metrics = samples.length ? await loadStyleMetricsDirective(persona.category) : "";
  return [guide, personaText, styleSampleBlock(samples, metrics)]
    .filter(Boolean)
    .join("\n\n");
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
    category: blog.category ?? null,
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

  /* (분량 미달 반복 확장 단계는 2026-10-13 A안으로 제거 — 목표 분량은 프롬프트 지시로만 전달하고 판단은 모델 검수가 한다) */

  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 --- */
  const hum = await humanizeBody({
    bodyMd: rawBody,
    title: topicRow!.title,
    preamble,
    callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword: topicRow!.primaryKeyword,
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

  /* --- Step 4: 모델 검수(A안) — 글 전체를 검수 모델이 읽고 approve/revise/reject 판정, revise 최대 1회 --- */
  const review = await reviewStage({
    persona,
    title: topicRow!.title,
    bodyMd: sanitized,
    groundingText,
    callerUserId,
    blogId,
    personaId: activePersona.id,
    blogName: blog.displayName,
    ownerId: blog.ownerId ?? null,
    draftId: existingDraftId ?? null,
  });
  const bodyMd = sanitizeBody(review.bodyMd);

  const totalInTokens =
    topicInTokens + outlineRes.inputTokens + dm.inTokens + bodyInTokens + hum.inTokens + guard.inTokens + review.inTokens;
  const totalOutTokens =
    topicOutTokens + outlineRes.outputTokens + dm.outTokens + bodyOutTokens + hum.outTokens + guard.outTokens + review.outTokens;
  const totalCostCents =
    topicCostCents + outlineRes.costCents + dm.costCents + bodyCostCents + hum.costCents + guard.costCents + review.costCents;

  /* --- Step 5: persist draft (백그라운드면 placeholder 행 UPDATE, 아니면 INSERT) ---
     모든 판정은 사람 검수(ready_for_review)로 간다. 모델 판정은 뱃지·사유로 표시되고 자동 승인은 없다. */
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
      seoIssuesJson: JSON.stringify([
        ...(guard.removed.length
          ? [`🧹 사실검증: 근거없는 주장 ${guard.removed.length}건 제거`]
          : []),
        ...(limitationFlag ? [limitationFlag] : []),
      ]),
      ...reviewColumns(review),
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

  await reportSettingIssues(review, {
    draftId: draft.id,
    blogId,
    personaId: activePersona.id,
    blogName: blog.displayName,
    ownerId: blog.ownerId ?? null,
    callerUserId,
  });

  await db.insert(schema.notifications).values({
    type: "draft_ready",
    title: `초안 준비됨 — ${blog.displayName}`,
    body: `${draft.title} · 자동 검수: ${VERDICT_LABEL[review.verdict]}`,
    linkUrl: `/queue/${draft.id}`,
    channel: "inapp",
  });

  // Fire-and-forget: 계정별 텔레그램 알림 (전역 단일 발송 제거 — 중복 방지)
  if (callerUserId) {
    void sendTelegramToUser(
      callerUserId,
      `📝 새 초안이 생성되었습니다!\n블로그: ${blog.displayName}\n제목: ${draft.title}\n자동 검수: ${VERDICT_LABEL[review.verdict]} — ${review.reason.slice(0, 120)}\n검토 후 발행해 주세요.`
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

  /* (명시 길이 미달 반복 확장 단계는 2026-10-13 A안으로 제거 — 길이 지시는 프롬프트로만, 판단은 모델 검수) */

  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 --- */
  const hum = await humanizeBody({
    bodyMd: rawBody,
    title,
    preamble,
    callerUserId: opts.callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword,
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

  /* --- Step 4: 모델 검수(A안) — revise 최대 1회 --- */
  const review = await reviewStage({
    persona,
    title,
    bodyMd: sanitized,
    groundingText,
    callerUserId: opts.callerUserId,
    blogId: opts.blogId,
    personaId: activePersona.id,
    blogName: blog.displayName,
    ownerId: blog.ownerId ?? null,
    draftId: opts.existingDraftId ?? null,
  });
  const bodyMd = sanitizeBody(review.bodyMd);

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
      seoIssuesJson: JSON.stringify([
        ...(guard.removed.length
          ? [`🧹 사실검증: 근거없는 주장 ${guard.removed.length}건 제거`]
          : []),
        ...(limitationFlag ? [limitationFlag] : []),
      ]),
      ...reviewColumns(review),
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

  await reportSettingIssues(review, {
    draftId: draft.id,
    blogId: opts.blogId,
    personaId: activePersona.id,
    blogName: blog.displayName,
    ownerId: blog.ownerId ?? null,
    callerUserId: opts.callerUserId,
  });

  await db.insert(schema.notifications).values({
    type: "draft_ready",
    title: `초안 준비됨 — ${blog.displayName}`,
    body: `${draft.title} · 자동 검수: ${VERDICT_LABEL[review.verdict]}`,
    linkUrl: `/queue/${draft.id}`,
    channel: "inapp",
  });

  if (opts.callerUserId) {
    void sendTelegramToUser(
      opts.callerUserId,
      `📝 새 초안이 생성되었습니다! (반자동)\n블로그: ${blog.displayName}\n제목: ${draft.title}\n자동 검수: ${VERDICT_LABEL[review.verdict]} — ${review.reason.slice(0, 120)}\n검토 후 발행해 주세요.`
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

  /* 길이 의도를 LLM 호출 전에 계산한다 — 큰 확장 목표면 max_tokens를 올린다(기본 4096은
     3000자 한국어 출력+JSON을 잘라낸다). 목표 미달 시 반복 확장은 A안으로 제거(판단은 모델 검수). */
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

  const res = await reviseOnce(draft.title, draft.bodyMd);
  const parsed =
    safeJson<{ title: string; bodyMd: string }>(res.text) ?? {
      title: draft.title,
      bodyMd: res.text,
    };

  /* 재작성 결과도 AI 티 제거(사람화) 패스 적용. */
  const hum = await humanizeBody({
    bodyMd: parsed.bodyMd,
    title: parsed.title,
    preamble,
    callerUserId: opts.callerUserId,
    model: res.model,
    brandName: persona.blogName,
    primaryKeyword: persona.focusKeywords[0],
    maxTokens: reviseMaxTokens,
    emojiLevel: resolveEmojiIntensity(persona).level,
  });
  parsed.bodyMd = sanitizeBody(hum.bodyMd);

  /* 모델 검수 — 사람 피드백 재작성본은 판정만(모델이 다시 고치지 않는다: 사람이 지시한 수정이므로). */
  const review = await reviewStage({
    persona,
    title: parsed.title,
    bodyMd: parsed.bodyMd,
    groundingText: buildGroundingText(persona, { title: parsed.title, primaryKeyword: persona.focusKeywords[0] }),
    callerUserId: opts.callerUserId,
    blogId: draft.blogId,
    personaId: activePersona.id,
    blogName: draft.blog.displayName,
    ownerId: draft.blog.ownerId ?? null,
    draftId: draft.id,
    allowRevise: false,
  });

  const nextRev = draft.revisionRound + 1;

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
      charCount: parsed.bodyMd.replace(/\s+/g, "").length,
      ...reviewColumns(review),
      llmInputTokens: (draft.llmInputTokens ?? 0) + res.inputTokens + hum.inTokens + review.inTokens,
      llmOutputTokens: (draft.llmOutputTokens ?? 0) + res.outputTokens + hum.outTokens + review.outTokens,
      llmCostCents: (draft.llmCostCents ?? 0) + res.costCents + hum.costCents + review.costCents,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, draft.id));

  await reportSettingIssues(review, {
    draftId: draft.id,
    blogId: draft.blogId,
    personaId: activePersona.id,
    blogName: draft.blog.displayName,
    ownerId: draft.blog.ownerId ?? null,
    callerUserId: opts.callerUserId,
  });

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
