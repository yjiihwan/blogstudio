import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { DraftStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DraftReview } from "@/components/draft-review";
import { GeneratingView } from "./GeneratingView";
import { scoreHuman, scoreSeo } from "@/lib/scoring";
import { relativeTime } from "@/lib/utils";
import { getAccessibleDraft, requireUser } from "@/lib/auth";
import {
  approveDraftAction,
  markPublishedAction,
  rejectAndReviseAction,
  saveDraftAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  // 소유권 검증: 타인 초안 접근 시 404
  if (!(await getAccessibleDraft(id, user))) notFound();
  const draft = await db.query.drafts.findFirst({
    where: eq(schema.drafts.id, id),
    with: {
      blog: { with: { personas: true } },
      images: true,
      imageRequests: true,
      approvals: { orderBy: desc(schema.approvals.createdAt) },
      versions: { orderBy: desc(schema.draftVersions.revision) },
    },
  });
  if (!draft) notFound();

  // 백그라운드 생성 중(draft) / 생성 실패(failed) — 검토 화면 대신 상태 화면을 보여준다.
  if (draft.status === "draft" || draft.status === "failed") {
    let failNote = "";
    if (draft.status === "failed") {
      try {
        const notes = JSON.parse(draft.seoIssuesJson ?? "[]") as string[];
        failNote = notes.find((n) => n.startsWith("⛔")) ?? "생성 중 오류가 발생했습니다.";
      } catch {
        failNote = "생성 중 오류가 발생했습니다.";
      }
    }
    return (
      <div className="px-5 lg:px-10 py-8 lg:py-10 max-w-7xl mx-auto">
        <div className="mb-4">
          <Link
            href="/queue"
            className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
          >
            <ChevronLeft className="size-4" />
            초안 큐
          </Link>
        </div>
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge tone="outline">{draft.blog.displayName}</Badge>
            <DraftStatusBadge status={draft.status} />
            <span className="text-[11px] text-ink-400">
              {relativeTime(draft.createdAt)}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-balance leading-tight">
            {draft.title}
          </h1>
        </header>

        {draft.status === "draft" ? (
          <GeneratingView createdAtMs={new Date(draft.createdAt).getTime()} />
        ) : (
          <div className="rounded-2xl border border-accent-300 bg-accent-50 p-8 max-w-3xl">
            <h2 className="text-lg font-bold text-ink-900">초안 생성에 실패했습니다</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">
              {failNote.replace(/^⛔\s*생성 실패:\s*/, "")}
            </p>
            <p className="mt-4 text-sm text-ink-500">
              일시적인 API 오류일 수 있습니다. 잠시 후 새 초안으로 다시 시도해 주세요.
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href="/queue/new"
                className="inline-flex items-center rounded-lg bg-ink-800 px-4 py-2 text-sm font-semibold text-paper-100 hover:bg-ink-900"
              >
                새 초안 만들기
              </Link>
              <Link
                href="/queue"
                className="inline-flex items-center rounded-lg border border-paper-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-paper-100"
              >
                큐로 돌아가기
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  const persona = draft.blog.personas.find((p) => p.isActive) ?? draft.blog.personas[0];
  const imagePlan = JSON.parse(draft.imagePlanJson) as Array<{
    slot: number;
    role: string;
    description: string;
    needsUserShot?: boolean;
  }>;

  const imageUrls: Record<number, string> = {};
  const imgById = new Map(draft.images.map((i) => [i.id, i.filePath]));
  // 1) sourceMeta.slot 기반 — 자동 소싱·반자동 폼 첨부 이미지
  for (const img of draft.images) {
    if (typeof img.filePath === "string") {
      const meta = img.sourceMetaJson
        ? (JSON.parse(img.sourceMetaJson) as { slot?: number })
        : {};
      if (typeof meta.slot === "number") imageUrls[meta.slot] = img.filePath;
    }
  }
  // 2) 사진 요청 업로드 기반 — uploadedImageId → slot (sourceMeta 없는 직접 업로드 컷)
  for (const req of draft.imageRequests) {
    if (req.uploadedImageId && imageUrls[req.slot] === undefined) {
      const fp = imgById.get(req.uploadedImageId);
      if (typeof fp === "string") imageUrls[req.slot] = fp;
    }
  }

  const seo = scoreSeo({
    title: draft.title,
    bodyMd: draft.bodyMd,
    primaryKeyword: persona
      ? JSON.parse(persona.focusKeywordsJson)[0] ?? ""
      : "",
    secondaryKeywords: persona
      ? JSON.parse(persona.focusKeywordsJson).slice(1)
      : [],
    imageCount: imagePlan.length,
    minLen: persona?.preferredLengthMin ?? 1500,
    maxLen: persona?.preferredLengthMax ?? 2800,
  });
  const human = scoreHuman({
    bodyMd: draft.bodyMd,
    forbiddenWords: persona ? JSON.parse(persona.forbiddenWordsJson) : [],
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-10 max-w-7xl mx-auto">
      <div className="mb-4">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft className="size-4" />
          초안 큐
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Badge tone="outline">{draft.blog.displayName}</Badge>
          <DraftStatusBadge status={draft.status} />
          {draft.revisionRound > 0 && (
            <Badge tone="sky">{draft.revisionRound}차 수정본</Badge>
          )}
          <span className="text-[11px] text-ink-400">
            {relativeTime(draft.createdAt)}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-balance leading-tight">
          {draft.title}
        </h1>
        {draft.summary && (
          <p className="mt-2 text-base text-ink-500">{draft.summary}</p>
        )}
      </header>

      {/* 생성 단계 검수 메모 — 저장된 seoIssues 중 표준 SEO 체크가 아닌 특수 안내
          (ℹ️ 정보부족 한계고지 · 🧹 사실검증 제거 · ⚠️ 미검증 주장 잔존)만 노출한다.
          SEO 패널은 본문으로 재계산되므로 이 플래그들이 사라져 검수자가 놓치던 문제를 보완. */}
      {(() => {
        let notes: string[] = [];
        try {
          notes = JSON.parse(draft.seoIssuesJson ?? "[]") as string[];
        } catch {
          notes = [];
        }
        const memos = notes.filter((n) => /^(ℹ️|🧹|⚠️)/.test(n));
        if (!memos.length) return null;
        return (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="mb-1.5 text-sm font-semibold text-amber-800">
              생성 단계 검수 메모
            </p>
            <ul className="space-y-1 text-sm text-amber-700">
              {memos.map((m, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <DraftReview
        key={`${draft.id}:${draft.revisionRound}`}
        draftId={draft.id}
        initialTitle={draft.title}
        initialBody={draft.bodyMd}
        initialSummary={draft.summary ?? ""}
        imagePlan={imagePlan}
        imageUrls={imageUrls}
        seo={seo}
        human={human}
        naverBlogId={draft.blog.naverBlogId}
        blogName={draft.blog.displayName}
        status={draft.status}
        saveDraft={saveDraftAction}
        approveDraft={approveDraftAction}
        rejectAndRevise={rejectAndReviseAction}
        markPublished={markPublishedAction}
      />

      {/* History */}
      {(draft.approvals.length > 0 || draft.versions.length > 1) && (
        <section className="mt-10 max-w-3xl">
          <h2 className="text-base font-bold mb-3">진행 이력</h2>
          <ol className="space-y-2 text-sm">
            {draft.approvals.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-paper-300 bg-paper-50 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  {a.decision === "approve" ? (
                    <Badge tone="leaf">승인</Badge>
                  ) : (
                    <Badge tone="accent">반려 → 재작성</Badge>
                  )}
                  <span className="text-[11px] text-ink-400">
                    {relativeTime(a.createdAt)} · {a.revision}회차
                  </span>
                </div>
                {a.feedback && (
                  <p className="text-sm text-ink-700">{a.feedback}</p>
                )}
                {a.feedbackTagsJson && a.feedbackTagsJson !== "[]" && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(JSON.parse(a.feedbackTagsJson) as string[]).map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
