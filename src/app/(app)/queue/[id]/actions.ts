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
import { reviseDraftWithFeedback, UserApiKeyMissingError } from "@/lib/pipeline";
import { CreditExhaustedError } from "@/lib/llm";
import { sendTelegramToUser } from "@/lib/telegram";

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
    throw err;
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
    method: "manual_paste",
    publishedAt: new Date().toISOString(),
  });

  sendTelegramToUser(
    user.id,
    `🎉 게시물이 발행되었습니다!\n제목: ${draft.title}`
  ).catch(() => null);

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

export type GenerateDraftState = { error: string } | null;

export async function generateNewDraftActionState(
  _prevState: GenerateDraftState,
  formData: FormData
): Promise<GenerateDraftState> {
  const user = await requireUser();
  const blogId = String(formData.get("blogId"));
  if (!blogId) return null;
  if (!(await getAccessibleBlog(blogId, user)))
    return { error: "권한이 없습니다." };

  let draftId: string;
  try {
    const { generateDraftForBlog } = await import("@/lib/pipeline");
    const draft = await generateDraftForBlog(blogId, user.id);
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    draftId = draft.id;
  } catch (err) {
    if (
      err instanceof CreditExhaustedError ||
      err instanceof UserApiKeyMissingError
    ) {
      return { error: err.message };
    }
    throw err;
  }

  redirect(`/queue/${draftId}`);
}
