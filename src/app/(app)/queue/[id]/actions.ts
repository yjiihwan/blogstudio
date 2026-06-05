"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { reviseDraftWithFeedback } from "@/lib/pipeline";

export async function saveDraftAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("draftId"));
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
  const draft = await db.query.drafts.findFirst({
    where: eq(schema.drafts.id, id),
  });
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

export async function rejectAndReviseAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  const feedback = String(formData.get("feedback") ?? "").trim();
  const tags = formData.getAll("feedbackTags").map(String);
  await reviseDraftWithFeedback({
    draftId: id,
    feedback,
    feedbackTags: tags,
    reviewerUserId: user.id,
  });
  revalidatePath(`/queue/${id}`);
  revalidatePath(`/queue`);
  revalidatePath("/dashboard");
}

export async function markPublishedAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("draftId"));
  const draft = await db.query.drafts.findFirst({
    where: eq(schema.drafts.id, id),
  });
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

  revalidatePath(`/queue/${id}`);
  revalidatePath(`/queue`);
  revalidatePath("/dashboard");
}

export async function generateNewDraftAction(formData: FormData) {
  await requireUser();
  const blogId = String(formData.get("blogId"));
  if (!blogId) return;
  const { generateDraftForBlog } = await import("@/lib/pipeline");
  const draft = await generateDraftForBlog(blogId);
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  redirect(`/queue/${draft.id}`);
}
