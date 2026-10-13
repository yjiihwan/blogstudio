/* 설정 개선안 보고·승인·자동 적용 루프(서버). 규칙은 proposals-core.ts(순수).
   - 생성: 검수 모델의 setting_issues → systemic+high 즉시 proposed, 그 외 pending 집계(다른 초안 2건 이상이면 승격)
   - 유사판정(같은 문제인가)은 저비용 모델(role=review_lite)에 맡긴다. 후보가 없으면 호출 안 함.
   - 보고: notifications(type=improvement_proposal) + 공통 알림 함수 notifyUser(알림톡) — 채널이 바뀌어도 여기만 통한다.
   - 적용은 사용자가 «동의» 를 눌렀을 때만. 되돌리기 지원. */
import { db, schema } from "@/db/client";
import { and, desc, eq, inArray } from "drizzle-orm";
import { llm } from "./llm";
import { similarityPrompt } from "./llm/review-prompts";
import { extractJsonObject, type SettingIssue } from "./review-core";
import {
  PERSONA_FIELDS,
  applyGuideChange,
  fieldLabel,
  isRejectBlocked,
  normalizeIssue,
  personaColumnValue,
  proposalSummaryLine,
  shouldPromotePending,
  shouldProposeImmediately,
  type ProposalStatus,
} from "./proposals-core";
import { getGlobalWritingGuide, replaceGlobalGuideText } from "./global-guide";
import { notifyUser } from "./notify/notify";
import { env } from "./env";

export type ProposalRow = typeof schema.improvementProposals.$inferSelect;
type ScopeUser = { id: string; role: "admin" | "user" };

function parseArr(s: string | null | undefined): string[] {
  try {
    const j = JSON.parse(s || "[]") as unknown;
    return Array.isArray(j) ? j.map(String) : [];
  } catch {
    return [];
  }
}
export function proposedChange(p: ProposalRow): { before: string; after: string } {
  try {
    const j = JSON.parse(p.proposedChangeJson || "{}") as { before?: string; after?: string };
    return { before: j.before ?? "", after: j.after ?? "" };
  } catch {
    return { before: "", after: "" };
  }
}
export const evidenceIds = (p: ProposalRow) => parseArr(p.evidenceDraftIdsJson);
export const targetUserIds = (p: ProposalRow) => parseArr(p.targetUserIdsJson);

async function adminIds(): Promise<string[]> {
  const rows = await db.query.users.findMany({ where: eq(schema.users.role, "admin") });
  return rows.filter((u) => u.isActive).map((u) => u.id);
}

/** 보고 대상 — 가이드: 관리자 전원 / 페르소나: 블로그 소유자(없으면 관리자 전원) */
async function resolveTargets(target: "global_guide" | "persona", ownerId: string | null | undefined): Promise<string[]> {
  if (target === "persona" && ownerId) return [ownerId];
  return adminIds();
}

/* ───────── 생성 ───────── */

export async function recordSettingIssues(opts: {
  draftId: string;
  blogId: string;
  personaId: string | null;
  blogName: string;
  ownerId: string | null;
  issues: SettingIssue[];
  callerUserId?: string;
}): Promise<{ created: number; merged: number; promoted: number; skipped: number; liteCalls: number; liteCostCents: number }> {
  const stat = { created: 0, merged: 0, promoted: 0, skipped: 0, liteCalls: 0, liteCostCents: 0 };
  for (const raw of opts.issues.slice(0, 5)) {
    const issue = normalizeIssue(raw);
    if (!issue) {
      stat.skipped++;
      continue;
    }
    try {
      // 같은 target(+페르소나면 같은 블로그)·같은 field 의 기존 항목(보류·대기·거절) 후보
      const where =
        issue.target === "persona"
          ? and(eq(schema.improvementProposals.target, "persona"), eq(schema.improvementProposals.blogId, opts.blogId), eq(schema.improvementProposals.field, issue.field))
          : and(eq(schema.improvementProposals.target, "global_guide"), eq(schema.improvementProposals.field, issue.field));
      const candidates = (await db.query.improvementProposals.findMany({ where, orderBy: desc(schema.improvementProposals.updatedAt), limit: 12 })).filter(
        (c) => c.status === "pending" || c.status === "proposed" || (c.status === "rejected" && isRejectBlocked(c.decidedAt))
      );

      let sameAs: ProposalRow | null = null;
      if (candidates.length) {
        const exact = candidates.find((c) => proposedChange(c).after.trim() === issue.proposed_change.after.trim());
        if (exact) sameAs = exact;
        else {
          const res = await llm({
            role: "review_lite",
            callerUserId: opts.callerUserId,
            maxTokens: 300,
            messages: [
              {
                role: "user",
                content: similarityPrompt({
                  candidate: { target: issue.target, field: issue.field, problem: issue.problem.slice(0, 600), after: issue.proposed_change.after.slice(0, 600) },
                  existing: candidates.map((c) => ({ id: c.id, field: c.field, problem: c.problem.slice(0, 400), after: proposedChange(c).after.slice(0, 400), status: c.status })),
                }),
              },
            ],
          });
          if (!res.isMock) {
            stat.liteCalls++;
            stat.liteCostCents += res.costCents;
            const j = extractJsonObject(res.text) as { same_as?: unknown } | null;
            const id = j && typeof j.same_as === "string" ? j.same_as : null;
            sameAs = id ? candidates.find((c) => c.id === id) ?? null : null;
          }
        }
      }

      if (sameAs?.status === "rejected") {
        stat.skipped++; // 30일 재제안 금지
        continue;
      }
      if (sameAs) {
        const ev = evidenceIds(sameAs);
        if (!ev.includes(opts.draftId)) ev.push(opts.draftId);
        const promote = sameAs.status === "pending" && shouldPromotePending(ev);
        await db
          .update(schema.improvementProposals)
          .set({
            occurrenceCount: sameAs.occurrenceCount + 1,
            evidenceDraftIdsJson: JSON.stringify(ev),
            status: promote ? "proposed" : sameAs.status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.improvementProposals.id, sameAs.id));
        stat.merged++;
        if (promote) {
          stat.promoted++;
          const row = await db.query.improvementProposals.findFirst({ where: eq(schema.improvementProposals.id, sameAs.id) });
          if (row) await notifyProposal(row, opts.blogName);
        }
        continue;
      }

      const immediate = shouldProposeImmediately(issue);
      const targets = await resolveTargets(issue.target, opts.ownerId);
      const [row] = await db
        .insert(schema.improvementProposals)
        .values({
          draftId: opts.draftId,
          blogId: opts.blogId,
          personaId: issue.target === "persona" ? opts.personaId : null,
          target: issue.target,
          field: issue.field,
          problem: issue.problem,
          proposedChangeJson: JSON.stringify(issue.proposed_change),
          confidence: issue.confidence,
          systemic: issue.systemic,
          occurrenceCount: 1,
          evidenceDraftIdsJson: JSON.stringify([opts.draftId]),
          targetUserIdsJson: JSON.stringify(targets),
          status: immediate ? "proposed" : "pending",
        })
        .returning();
      stat.created++;
      if (immediate) await notifyProposal(row, opts.blogName);
    } catch (err) {
      console.error("[proposals] 제안 기록 실패:", err);
      stat.skipped++;
    }
  }
  return stat;
}

/** 보고 — 앱 내 알림 + 공통 외부 알림 함수(알림톡). 실패해도 throw 하지 않는다. */
async function notifyProposal(p: ProposalRow, blogName?: string | null) {
  const targets = targetUserIds(p);
  const link = `/proposals/${p.id}`;
  const { 대상, 내용 } = proposalSummaryLine({ target: p.target, field: p.field, problem: p.problem }, blogName);
  for (const uid of targets) {
    try {
      await db.insert(schema.notifications).values({
        userId: uid,
        type: "improvement_proposal",
        title: `글 설정 개선 제안 — ${대상}`,
        body: `${내용} … 제안함에서 확인하고 동의 여부를 결정해 주세요.`,
        linkUrl: link,
        channel: "inapp",
      });
    } catch (err) {
      console.error("[proposals] 앱 알림 기록 실패:", err);
    }
    try {
      await notifyUser(uid, "improvement_proposal", { 대상, 내용, 제안주소: `${env.APP_URL}${link}` });
    } catch (err) {
      console.error("[proposals] 외부 알림 실패:", err);
    }
  }
}

/* ───────── 조회(권한) ───────── */

export function canSee(p: ProposalRow, user: ScopeUser): boolean {
  if (user.role === "admin") return true;
  return targetUserIds(p).includes(user.id);
}

export async function listProposalsFor(user: ScopeUser): Promise<Array<ProposalRow & { blogName: string | null }>> {
  const rows = await db.query.improvementProposals.findMany({ orderBy: desc(schema.improvementProposals.updatedAt), with: { blog: true } });
  const visible = rows.filter((r) => r.status !== "pending" || user.role === "admin").filter((r) => canSee(r, user));
  return visible.map((r) => ({ ...r, blogName: r.blog?.displayName ?? null }));
}

export async function getProposalFor(id: string, user: ScopeUser) {
  const row = await db.query.improvementProposals.findFirst({ where: eq(schema.improvementProposals.id, id), with: { blog: true, decider: true } });
  if (!row || !canSee(row, user)) return null;
  const ev = evidenceIds(row);
  const drafts = ev.length ? await db.query.drafts.findMany({ where: inArray(schema.drafts.id, ev) }) : [];
  return { ...row, evidenceDrafts: drafts.map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt })) };
}

/** 현재 값(before 비교용) — 페르소나는 활성 버전의 해당 컬럼, 가이드는 전문. */
export async function currentValueFor(p: ProposalRow): Promise<string> {
  if (p.target === "global_guide") return (await getGlobalWritingGuide()).text;
  if (!p.blogId) return "";
  const active = await db.query.personas.findFirst({ where: and(eq(schema.personas.blogId, p.blogId), eq(schema.personas.isActive, true)) });
  if (!active) return "";
  const v = (active as unknown as Record<string, unknown>)[p.field];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/* ───────── 결정·적용 ───────── */

export async function acceptAndApply(id: string, user: ScopeUser, editedAfter?: string | null): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  const p = await db.query.improvementProposals.findFirst({ where: eq(schema.improvementProposals.id, id), with: { blog: true } });
  if (!p || !canSee(p, user)) return { ok: false, error: "제안을 찾을 수 없거나 권한이 없습니다." };
  if (p.status !== "proposed" && p.status !== "accepted") return { ok: false, error: `이미 처리된 제안입니다(${p.status}).` };
  if (p.target === "global_guide" && user.role !== "admin") return { ok: false, error: "전체 가이드는 관리자만 적용할 수 있습니다." };
  const after = (editedAfter ?? proposedChange(p).after).trim();
  if (!after) return { ok: false, error: "적용할 내용이 비어 있습니다." };
  const now = new Date().toISOString();

  try {
    if (p.target === "persona") {
      if (!p.blogId) return { ok: false, error: "블로그 정보가 없어 적용할 수 없습니다." };
      const spec = PERSONA_FIELDS[p.field];
      const value = personaColumnValue(p.field, after);
      if (!spec || value == null) return { ok: false, error: "이 항목에 넣을 수 없는 값입니다. «수정 후 적용»으로 값을 고쳐 주세요." };
      const active = await db.query.personas.findFirst({ where: and(eq(schema.personas.blogId, p.blogId), eq(schema.personas.isActive, true)) });
      const base = active ?? (await db.query.personas.findFirst({ where: eq(schema.personas.blogId, p.blogId) }));
      if (!base) return { ok: false, error: "페르소나가 없습니다." };
      // 기존 활성 버전을 복제해 version+1 새 버전 생성(변경 필드만 교체), 기존 버전 비활성.
      const { id: _oldId, createdAt: _c, updatedAt: _u, ...copy } = base;
      void _oldId; void _c; void _u;
      const maxV = (await db.query.personas.findMany({ where: eq(schema.personas.blogId, p.blogId) })).reduce((m, r) => Math.max(m, r.version), 0);
      const [created] = await db
        .insert(schema.personas)
        .values({ ...copy, [p.field]: value, version: maxV + 1, isActive: true, createdAt: now, updatedAt: now })
        .returning();
      await db.update(schema.personas).set({ isActive: false, updatedAt: now }).where(and(eq(schema.personas.blogId, p.blogId), eq(schema.personas.isActive, true), eq(schema.personas.id, base.id)));
      await db
        .update(schema.improvementProposals)
        .set({
          status: "applied",
          appliedAfter: editedAfter != null ? after : null,
          decidedBy: user.id,
          decidedAt: now,
          appliedAt: now,
          rollbackJson: JSON.stringify({ previousPersonaId: base.id, newPersonaId: created.id, field: p.field, previousValue: (base as unknown as Record<string, unknown>)[p.field] ?? null }),
          updatedAt: now,
        })
        .where(eq(schema.improvementProposals.id, p.id));
      await notifyApplied(p, user.id, `${p.blog?.displayName ?? "블로그"} 페르소나의 «${fieldLabel("persona", p.field)}» 설정을 새 버전(v${maxV + 1})으로 적용했습니다.`);
      return { ok: true, note: `페르소나 새 버전(v${maxV + 1})으로 적용했습니다. 되돌리기는 이 화면에서 할 수 있습니다.` };
    }

    // 전역 가이드
    const guide = await getGlobalWritingGuide();
    const { before } = proposedChange(p);
    const applied = applyGuideChange(guide.text, p.field, before, after);
    const { previousText } = await replaceGlobalGuideText(applied.text, `개선 제안 적용 — ${fieldLabel("global_guide", p.field)}`, { proposalId: p.id, byUserId: user.id });
    await db
      .update(schema.improvementProposals)
      .set({
        status: "applied",
        appliedAfter: editedAfter != null ? after : null,
        decidedBy: user.id,
        decidedAt: now,
        appliedAt: now,
        rollbackJson: JSON.stringify({ previousText, mode: applied.mode }),
        updatedAt: now,
      })
      .where(eq(schema.improvementProposals.id, p.id));
    await notifyApplied(p, user.id, `전체 글쓰기 가이드의 «${p.field}» 부분을 적용했습니다.`);
    return {
      ok: true,
      note: applied.mode === "replaced" ? "가이드의 해당 문단을 바꿨습니다. 되돌리기는 이 화면 또는 설정 → 가이드 이력에서 할 수 있습니다." : "가이드에서 원래 문단을 찾지 못해 끝에 새 항목으로 덧붙였습니다. 설정에서 위치를 다듬어 주세요.",
    };
  } catch (err) {
    console.error("[proposals] 적용 실패:", err);
    return { ok: false, error: "적용 중 오류가 났습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function rejectProposal(id: string, user: ScopeUser, reason: string): Promise<{ ok: boolean; error?: string }> {
  const p = await db.query.improvementProposals.findFirst({ where: eq(schema.improvementProposals.id, id) });
  if (!p || !canSee(p, user)) return { ok: false, error: "제안을 찾을 수 없거나 권한이 없습니다." };
  if (p.status !== "proposed" && p.status !== "accepted") return { ok: false, error: "이미 처리된 제안입니다." };
  if (p.target === "global_guide" && user.role !== "admin") return { ok: false, error: "전체 가이드 제안은 관리자만 결정할 수 있습니다." };
  const now = new Date().toISOString();
  await db
    .update(schema.improvementProposals)
    .set({ status: "rejected", rejectReason: reason.slice(0, 500), decidedBy: user.id, decidedAt: now, updatedAt: now })
    .where(eq(schema.improvementProposals.id, id));
  return { ok: true };
}

export async function rollbackProposal(id: string, user: ScopeUser): Promise<{ ok: boolean; error?: string }> {
  const p = await db.query.improvementProposals.findFirst({ where: eq(schema.improvementProposals.id, id) });
  if (!p || !canSee(p, user)) return { ok: false, error: "제안을 찾을 수 없거나 권한이 없습니다." };
  if (p.status !== "applied") return { ok: false, error: "적용된 제안만 되돌릴 수 있습니다." };
  if (p.target === "global_guide" && user.role !== "admin") return { ok: false, error: "전체 가이드는 관리자만 되돌릴 수 있습니다." };
  const now = new Date().toISOString();
  try {
    const rb = JSON.parse(p.rollbackJson || "{}") as { previousPersonaId?: string; newPersonaId?: string; previousText?: string };
    if (p.target === "persona") {
      if (!rb.previousPersonaId || !rb.newPersonaId || !p.blogId) return { ok: false, error: "되돌릴 정보가 없습니다." };
      await db.update(schema.personas).set({ isActive: false, updatedAt: now }).where(eq(schema.personas.id, rb.newPersonaId));
      await db.update(schema.personas).set({ isActive: true, updatedAt: now }).where(eq(schema.personas.id, rb.previousPersonaId));
    } else {
      if (typeof rb.previousText !== "string") return { ok: false, error: "되돌릴 정보가 없습니다." };
      await replaceGlobalGuideText(rb.previousText, `개선 제안 되돌리기 — ${fieldLabel("global_guide", p.field)}`, { proposalId: p.id, byUserId: user.id });
    }
    await db.update(schema.improvementProposals).set({ status: "rolled_back", updatedAt: now }).where(eq(schema.improvementProposals.id, id));
    return { ok: true };
  } catch (err) {
    console.error("[proposals] 되돌리기 실패:", err);
    return { ok: false, error: "되돌리기 중 오류가 났습니다." };
  }
}

async function notifyApplied(p: ProposalRow, deciderId: string, text: string) {
  try {
    await db.insert(schema.notifications).values({
      userId: deciderId,
      type: "improvement_applied",
      title: "개선 제안을 적용했습니다",
      body: `${text} 되돌리기는 개선 제안함에서 할 수 있습니다.`,
      linkUrl: `/proposals/${p.id}`,
      channel: "inapp",
    });
  } catch (err) {
    console.error("[proposals] 적용 알림 기록 실패:", err);
  }
}

/* ───────── 운영자 가시성 ───────── */
export async function proposalStats(): Promise<{ total: number; pending: number; proposed: number; applied: number; rejected: number; rolledBack: number; rejectRate: number | null }> {
  const rows = await db.query.improvementProposals.findMany();
  const count = (s: ProposalStatus) => rows.filter((r) => r.status === s).length;
  const decided = count("applied") + count("rejected") + count("rolled_back") + count("accepted");
  return {
    total: rows.length,
    pending: count("pending"),
    proposed: count("proposed"),
    applied: count("applied") + count("accepted"),
    rejected: count("rejected"),
    rolledBack: count("rolled_back"),
    rejectRate: decided ? Math.round((count("rejected") / decided) * 100) : null,
  };
}

/** 페르소나 편집 화면 배너용 — 이 블로그에 적용된(되돌리지 않은) 최근 제안. */
export async function latestAppliedForBlog(blogId: string) {
  return db.query.improvementProposals.findFirst({
    where: and(eq(schema.improvementProposals.blogId, blogId), eq(schema.improvementProposals.target, "persona"), eq(schema.improvementProposals.status, "applied")),
    orderBy: desc(schema.improvementProposals.appliedAt),
  });
}

/** 메뉴 배지용 — 내가 결정해야 하는 제안 수 */
export async function openProposalCountFor(user: ScopeUser): Promise<number> {
  const rows = await db.query.improvementProposals.findMany({ where: eq(schema.improvementProposals.status, "proposed") });
  return rows.filter((r) => canSee(r, user)).length;
}
