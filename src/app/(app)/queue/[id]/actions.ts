"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  getAccessibleBlog,
  getAccessibleDraft,
  requireUser,
} from "@/lib/auth";
import {
  reviseDraftWithFeedback,
  UserApiKeyMissingError,
  NeedsMoreInfoError,
} from "@/lib/pipeline";
import {
  CreditExhaustedError,
  ApiKeyUndecryptableError,
  SystemApiKeyMissingError,
} from "@/lib/llm";
import { sendTelegramToUser } from "@/lib/telegram";
import { runPublish } from "@/lib/publish/adapter";

// LLM 호출 실패를 사용자에게 보여줄 친절한 메시지로 변환한다.
// 인식 못 한 에러를 그대로 throw하면 서버 액션이 500으로 떨어지므로,
// 폼에 결과를 돌려주는 액션에서는 이 함수로 메시지를 만들어 반환한다.
function friendlyLlmError(err: unknown): string {
  // 메시지가 곧 사용자 안내인 도메인 에러는 그대로 노출(원인을 정확히 알려줌).
  if (
    err instanceof ApiKeyUndecryptableError ||
    err instanceof SystemApiKeyMissingError ||
    err instanceof UserApiKeyMissingError ||
    err instanceof CreditExhaustedError
  ) {
    return err.message;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|invalid_api_key|authentication/i.test(msg))
    return "API 키가 올바르지 않습니다. 설정에서 키를 확인해주세요.";
  if (/429|rate.?limit|overloaded/i.test(msg))
    return "AI 서비스가 혼잡합니다. 잠시 후 다시 시도해주세요.";
  if (/credit|billing|quota|insufficient/i.test(msg))
    return "API 크레딧이 부족합니다. 결제 상태를 확인해주세요.";
  return `초안 생성에 실패했습니다: ${msg.slice(0, 120)}`;
}

export async function saveDraftAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  if (!(await getAccessibleDraft(id, user))) throw new Error("FORBIDDEN");
  const bodyMd = String(formData.get("bodyMd") ?? "");
  await db
    .update(schema.drafts)
    .set({
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? "") || null,
      bodyMd,
      charCount: bodyMd.replace(/\s+/g, "").length,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, id));
  revalidatePath(`/queue/${id}`);
}

export async function approveDraftAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  const draft = await getAccessibleDraft(id, user);
  if (!draft) return;

  /* Save any inline edits along with approval */
  const bodyMd = String(formData.get("bodyMd") ?? draft.bodyMd);
  await db
    .update(schema.drafts)
    .set({
      title: String(formData.get("title") ?? draft.title),
      summary: String(formData.get("summary") ?? draft.summary ?? "") || null,
      bodyMd,
      charCount: bodyMd.replace(/\s+/g, "").length,
      status: "approved",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, id));

  await db.insert(schema.approvals).values({
    draftId: id,
    reviewerUserId: user.id,
    revision: draft.revisionRound,
    decision: "approve",
  });

  revalidatePath(`/queue/${id}`);
  revalidatePath(`/queue`);
  revalidatePath("/dashboard");
}

export async function rejectAndReviseAction(
  formData: FormData
): Promise<{ error: string } | void> {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  if (!(await getAccessibleDraft(id, user))) throw new Error("FORBIDDEN");
  const feedback = String(formData.get("feedback") ?? "").trim();
  const tags = formData.getAll("feedbackTags").map(String);
  try {
    await reviseDraftWithFeedback({
      draftId: id,
      feedback,
      feedbackTags: tags,
      reviewerUserId: user.id,
      callerUserId: user.id,
    });
  } catch (err) {
    if (
      err instanceof CreditExhaustedError ||
      err instanceof UserApiKeyMissingError
    ) {
      return { error: err.message };
    }
    return { error: friendlyLlmError(err) };
  }
  revalidatePath(`/queue/${id}`);
  revalidatePath(`/queue`);
  revalidatePath("/dashboard");
}

export async function markPublishedAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  const draft = await getAccessibleDraft(id, user);
  if (!draft) return;

  // 외부 부작용(텔레그램 알림 등)은 발행 어댑터 게이트를 통해서만 내보낸다.
  // staging/dry-run이면 notify()는 호출되지 않고 모의발행 로그만 남는다.
  const outcome = await runPublish(
    { draftId: id, title: draft.title, userId: user.id },
    {
      notify: () =>
        sendTelegramToUser(
          user.id,
          `🎉 게시물이 발행되었습니다!\n제목: ${draft.title}`
        ),
    }
  );

  await db
    .update(schema.drafts)
    .set({
      status: "published",
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, id));

  await db.insert(schema.publishes).values({
    draftId: id,
    publishedByUserId: user.id,
    method: outcome.method,
    publishedAt: new Date().toISOString(),
    notes: outcome.note,
  });

  revalidatePath(`/queue/${id}`);
  revalidatePath(`/queue`);
  revalidatePath("/dashboard");
}

export async function generateNewDraftAction(formData: FormData) {
  const user = await requireUser();
  const blogId = String(formData.get("blogId"));
  if (!blogId) return;
  if (!(await getAccessibleBlog(blogId, user))) throw new Error("FORBIDDEN");
  const { generateDraftForBlog } = await import("@/lib/pipeline");
  try {
    const draft = await generateDraftForBlog(blogId, user.id);
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    redirect(`/queue/${draft.id}`);
  } catch (err) {
    if (err instanceof UserApiKeyMissingError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

export type GenerateDraftState =
  | { error: string }
  // 대화형 보강 루프 — 정보가 부족해 되묻는 상태. 폼이 이 안내를 보여주고,
  // 사용자가 추가 입력하면 supplements(누적)를 hidden 필드로 되돌려 재요청한다.
  | { needsInfo: true; request: string; supplements: string[] }
  | null;

/** 폼에서 보강 루프 입력(누적 supplements JSON + 이번 라운드 새 입력)을 읽는다. */
function readAugment(formData: FormData): { supplements: string[]; newSupplement?: string } {
  let supplements: string[] = [];
  try {
    const raw = String(formData.get("supplements") ?? "");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) supplements = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    supplements = [];
  }
  const newSupplement = String(formData.get("supplement") ?? "").trim() || undefined;
  return { supplements, newSupplement };
}

export async function generateNewDraftActionState(
  _prevState: GenerateDraftState,
  formData: FormData
): Promise<GenerateDraftState> {
  const user = await requireUser();
  const blogId = String(formData.get("blogId"));
  if (!blogId) return null;
  if (!(await getAccessibleBlog(blogId, user)))
    return { error: "권한이 없습니다." };

  const augment = readAugment(formData);

  let draftId: string;
  try {
    const { generateDraftForBlog } = await import("@/lib/pipeline");
    const draft = await generateDraftForBlog(blogId, user.id, augment);
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    draftId = draft.id;
  } catch (err) {
    if (err instanceof NeedsMoreInfoError) {
      return { needsInfo: true, request: err.requestMessage, supplements: err.supplements };
    }
    if (
      err instanceof CreditExhaustedError ||
      err instanceof UserApiKeyMissingError
    ) {
      return { error: err.message };
    }
    return { error: friendlyLlmError(err) };
  }

  redirect(`/queue/${draftId}`);
}

const MANUAL_MAX_IMG = 10 * 1024 * 1024;
const MANUAL_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

/** 반자동 — 사용자가 제목/내용 직접 입력 (+ 선택: 사진 직접 첨부) */
export async function generateManualDraftActionState(
  _prevState: GenerateDraftState,
  formData: FormData
): Promise<GenerateDraftState> {
  const user = await requireUser();
  const blogId = String(formData.get("blogId") ?? "");
  if (!blogId) return { error: "블로그가 지정되지 않았습니다." };
  if (!(await getAccessibleBlog(blogId, user)))
    return { error: "권한이 없습니다." };

  const title = String(formData.get("title") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  if (!title) return { error: "제목(주제)을 입력해주세요." };
  if (!brief) return { error: "내용 디테일을 입력해주세요." };

  const keywords = String(formData.get("keywords") ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const photoMode = String(formData.get("photoMode") ?? "auto") === "manual" ? "manual" : "auto";

  // 직접 첨부 사진 읽기
  const uploadedImages: Array<{ buffer: Buffer; mimeType: string; size: number; ext: string }> = [];
  if (photoMode === "manual") {
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      if (file.size > MANUAL_MAX_IMG) return { error: `사진이 너무 큽니다(최대 10MB): ${file.name}` };
      if (!MANUAL_ALLOWED.has(file.type)) return { error: `지원하지 않는 형식: ${file.name} (JPG/PNG/HEIC/WebP)` };
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      uploadedImages.push({ buffer, mimeType: file.type, size: file.size, ext });
    }
  }

  const augment = readAugment(formData);

  let draftId: string;
  try {
    const { generateDraftFromBrief } = await import("@/lib/pipeline");
    const draft = await generateDraftFromBrief({
      blogId,
      callerUserId: user.id,
      title,
      brief,
      keywords,
      photoMode,
      uploadedImages,
      augment,
    });
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    draftId = draft.id;
  } catch (err) {
    if (err instanceof NeedsMoreInfoError) {
      return { needsInfo: true, request: err.requestMessage, supplements: err.supplements };
    }
    if (err instanceof CreditExhaustedError || err instanceof UserApiKeyMissingError) {
      return { error: err.message };
    }
    return { error: friendlyLlmError(err) };
  }

  redirect(`/queue/${draftId}`);
}
