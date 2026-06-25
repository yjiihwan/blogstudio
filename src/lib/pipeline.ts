/**
 * Draft generation pipeline. Orchestrates topic research → outline → body →
 * scoring, then persists a Draft row. Can run from a UI server action OR from
 * the cron tick script.
 */
import { db, schema } from "@/db/client";
import { and, desc, eq, gte } from "drizzle-orm";
import { llm, UserApiKeyMissingError } from "./llm";
export { UserApiKeyMissingError };
import {
  bodyPrompt,
  outlinePrompt,
  personaPreamble,
  type PersonaInput,
  revisePrompt,
  humanizePrompt,
  topicResearchPrompt,
} from "./llm/prompts";
import { scoreHuman, scoreSeo } from "./scoring";
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
}): Promise<{ bodyMd: string; inTokens: number; outTokens: number; costCents: number }> {
  const zero = { bodyMd: opts.bodyMd, inTokens: 0, outTokens: 0, costCents: 0 };
  if (opts.model === "mock") return zero;
  const guide = await getGlobalWritingGuide();
  if (!guide.enabled || !guide.text.trim()) return zero;
  try {
    const res = await llm({
      system: opts.preamble,
      callerUserId: opts.callerUserId,
      messages: [
        {
          role: "user",
          content: humanizePrompt({
            title: opts.title,
            bodyMd: opts.bodyMd,
            rules: guide.text,
            brandName: opts.brandName,
            primaryKeyword: opts.primaryKeyword,
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
    if (out.length < opts.bodyMd.length * 0.5 || newImgs < origImgs) {
      return { bodyMd: opts.bodyMd, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents };
    }
    return { bodyMd: out, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents };
  } catch {
    return zero;
  }
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
    sampleSnippets: JSON.parse(p.sampleSnippetsJson || "[]"),
    preferredLengthMin: p.preferredLengthMin,
    preferredLengthMax: p.preferredLengthMax,
    imagesPerPostMin: p.imagesPerPostMin,
    imagesPerPostMax: p.imagesPerPostMax,
    notes: p.notes,
  };
}

/* ============================================================
   PUBLIC ENTRY POINTS
   ============================================================ */

export async function generateDraftForBlog(blogId: string, callerUserId?: string) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona =
    blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(blog, activePersona);
  const preamble = await buildSystemPreamble(persona);

  /* --- Step 1: discover topic candidates (skip if any selected unused topic exists) --- */
  const recent = await db.query.drafts.findMany({
    where: eq(schema.drafts.blogId, blogId),
    orderBy: desc(schema.drafts.createdAt),
    limit: 10,
  });
  const recentTitles = recent.map((r) => r.title);

  const topicRes = await llm({
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
  });

  const topics =
    safeJson<
      Array<{
        title: string;
        angle: string;
        primaryKeyword: string;
        secondaryKeywords: string[];
        rationale: string;
        score: number;
      }>
    >(topicRes.text) ?? [];

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
        }),
      },
    ],
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

  /* --- Step 3: body --- */
  const bodyRes = await llm({
    system: preamble,
    callerUserId,
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
        }),
      },
    ],
  });
  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 --- */
  const hum = await humanizeBody({
    bodyMd: bodyRes.text.trim(),
    title: topicRow!.title,
    preamble,
    callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword: topicRow!.primaryKeyword,
  });
  const bodyMd = hum.bodyMd;

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
    topicRes.inputTokens + outlineRes.inputTokens + bodyRes.inputTokens + hum.inTokens;
  const totalOutTokens =
    topicRes.outputTokens + outlineRes.outputTokens + bodyRes.outputTokens + hum.outTokens;
  const totalCostCents =
    topicRes.costCents + outlineRes.costCents + bodyRes.costCents + hum.costCents;

  /* --- Step 5: persist draft --- */
  const [draft] = await db
    .insert(schema.drafts)
    .values({
      blogId,
      topicId: topicRow!.id,
      title: topicRow!.title,
      summary: topicRow!.angle ?? null,
      bodyMd,
      imagePlanJson: JSON.stringify(outline.imagePlan),
      status: "ready_for_review",
      charCount: bodyMd.replace(/\s+/g, "").length,
      imageCount: outline.imagePlan.length,
      seoScore: seo.score,
      seoIssuesJson: JSON.stringify(
        seo.checks.filter((c) => !c.ok).map((c) => c.label)
      ),
      humanScore: human.score,
      llmModel: bodyRes.model,
      llmInputTokens: totalInTokens,
      llmOutputTokens: totalOutTokens,
      llmCostCents: totalCostCents,
    })
    .returning();

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
  /** photoMode='manual'일 때 폼에서 첨부된 이미지(이미 읽은 버퍼). */
  uploadedImages?: Array<{ buffer: Buffer; mimeType: string; size: number; ext: string }>;
}) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, opts.blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona =
    blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(blog, activePersona);
  const preamble = await buildSystemPreamble(persona);

  const title = opts.title.trim();
  const brief = opts.brief.trim();
  const keywords = (opts.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const primaryKeyword = keywords[0] ?? persona.focusKeywords[0] ?? title;
  const secondaryKeywords = keywords.slice(1);
  const manualImages = opts.photoMode === "manual" ? (opts.uploadedImages ?? []) : [];
  const imageSlotCount = opts.photoMode === "manual" ? manualImages.length : undefined;

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
        }),
      },
    ],
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

  /* --- Step 3: body --- */
  const bodyRes = await llm({
    system: preamble,
    callerUserId: opts.callerUserId,
    messages: [
      {
        role: "user",
        content: bodyPrompt({
          persona,
          topic: { title, primaryKeyword, secondaryKeywords },
          outline,
          userBrief: brief,
        }),
      },
    ],
  });
  /* --- Step 3.5: 사람화(AI 티 제거) 리라이트 --- */
  const hum = await humanizeBody({
    bodyMd: bodyRes.text.trim(),
    title,
    preamble,
    callerUserId: opts.callerUserId,
    model: bodyRes.model,
    brandName: persona.blogName,
    primaryKeyword,
  });
  const bodyMd = hum.bodyMd;

  /* --- Step 4: score --- */
  const seo = scoreSeo({
    title,
    bodyMd,
    primaryKeyword,
    secondaryKeywords,
    imageCount: outline.imagePlan.length,
    minLen: persona.preferredLengthMin,
    maxLen: persona.preferredLengthMax,
  });
  const human = scoreHuman({ bodyMd, forbiddenWords: persona.forbiddenWords });

  const totalInTokens = outlineRes.inputTokens + bodyRes.inputTokens + hum.inTokens;
  const totalOutTokens = outlineRes.outputTokens + bodyRes.outputTokens + hum.outTokens;
  const totalCostCents = outlineRes.costCents + bodyRes.costCents + hum.costCents;

  /* --- Step 5: persist draft --- */
  const [draft] = await db
    .insert(schema.drafts)
    .values({
      blogId: opts.blogId,
      topicId: topicRow.id,
      title,
      summary: brief ? brief.slice(0, 200) : null,
      bodyMd,
      imagePlanJson: JSON.stringify(outline.imagePlan),
      status: "ready_for_review",
      charCount: bodyMd.replace(/\s+/g, "").length,
      imageCount: outline.imagePlan.length,
      seoScore: seo.score,
      seoIssuesJson: JSON.stringify(seo.checks.filter((c) => !c.ok).map((c) => c.label)),
      humanScore: human.score,
      llmModel: bodyRes.model,
      llmInputTokens: totalInTokens,
      llmOutputTokens: totalOutTokens,
      llmCostCents: totalCostCents,
    })
    .returning();

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
        sourceMetaJson: JSON.stringify({ slot: i }),
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

  const res = await llm({
    system: preamble,
    callerUserId: opts.callerUserId,
    messages: [
      {
        role: "user",
        content: revisePrompt({
          persona,
          currentTitle: draft.title,
          currentBodyMd: draft.bodyMd,
          feedback: opts.feedback,
          feedbackTags: opts.feedbackTags,
          priorFeedbacks,
        }),
      },
    ],
  });
  const parsed =
    safeJson<{ title: string; bodyMd: string }>(res.text) ?? {
      title: draft.title,
      bodyMd: res.text,
    };

  /* 재작성 결과도 AI 티 제거(사람화) 패스 적용 */
  const hum = await humanizeBody({
    bodyMd: parsed.bodyMd,
    title: parsed.title,
    preamble,
    callerUserId: opts.callerUserId,
    model: res.model,
    brandName: persona.blogName,
    primaryKeyword: persona.focusKeywords[0],
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
