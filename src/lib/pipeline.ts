/**
 * Draft generation pipeline. Orchestrates topic research → outline → body →
 * scoring, then persists a Draft row. Can run from a UI server action OR from
 * the cron tick script.
 */
import { db, schema } from "@/db/client";
import { and, desc, eq, gte } from "drizzle-orm";
import { llm } from "./llm";
import {
  bodyPrompt,
  outlinePrompt,
  personaPreamble,
  type PersonaInput,
  revisePrompt,
  topicResearchPrompt,
} from "./llm/prompts";
import { scoreHuman, scoreSeo } from "./scoring";
import { env } from "./env";

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

export async function generateDraftForBlog(blogId: string) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, blogId),
    with: { personas: true },
  });
  if (!blog) throw new Error("BLOG_NOT_FOUND");
  const activePersona =
    blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  if (!activePersona) throw new Error("PERSONA_MISSING");
  const persona = personaFromRow(blog, activePersona);
  const preamble = personaPreamble(persona);

  /* --- Step 1: discover topic candidates (skip if any selected unused topic exists) --- */
  const recent = await db.query.drafts.findMany({
    where: eq(schema.drafts.blogId, blogId),
    orderBy: desc(schema.drafts.createdAt),
    limit: 10,
  });
  const recentTitles = recent.map((r) => r.title);

  const topicRes = await llm({
    model: env.ANTHROPIC_MODEL_DRAFT,
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
    model: env.ANTHROPIC_MODEL_DRAFT,
    system: preamble,
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
    model: env.ANTHROPIC_MODEL_DRAFT,
    system: preamble,
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
  const bodyMd = bodyRes.text.trim();

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
    topicRes.inputTokens + outlineRes.inputTokens + bodyRes.inputTokens;
  const totalOutTokens =
    topicRes.outputTokens + outlineRes.outputTokens + bodyRes.outputTokens;
  const totalCostCents =
    topicRes.costCents + outlineRes.costCents + bodyRes.costCents;

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

  for (const it of outline.imagePlan.filter((p) => p.needsUserShot)) {
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

  return draft;
}

export async function reviseDraftWithFeedback(opts: {
  draftId: string;
  feedback: string;
  feedbackTags: string[];
  reviewerUserId?: string | null;
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
  const preamble = personaPreamble(persona);

  const res = await llm({
    model: env.ANTHROPIC_MODEL_DRAFT,
    system: preamble,
    messages: [
      {
        role: "user",
        content: revisePrompt({
          persona,
          currentTitle: draft.title,
          currentBodyMd: draft.bodyMd,
          feedback: opts.feedback,
          feedbackTags: opts.feedbackTags,
        }),
      },
    ],
  });
  const parsed =
    safeJson<{ title: string; bodyMd: string }>(res.text) ?? {
      title: draft.title,
      bodyMd: res.text,
    };

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
