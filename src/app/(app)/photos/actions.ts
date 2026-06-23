"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getAccessibleDraft, requireUser } from "@/lib/auth";
import { saveImageBuffer } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export async function uploadPhotoAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireUser();

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "요청 ID가 없습니다." };

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return { error: "파일을 선택해주세요." };
  if (file.size > MAX_SIZE) return { error: "파일이 너무 큽니다 (최대 10MB)." };
  if (!ALLOWED_TYPES.has(file.type))
    return { error: "JPG, PNG, HEIC, WebP 형식만 지원합니다." };

  const req = await db.query.imageRequests.findFirst({
    where: eq(schema.imageRequests.id, requestId),
    with: { draft: true },
  });
  if (!req) return { error: "요청을 찾을 수 없습니다." };
  // 소유권 검증: 본인 소유 블로그의 초안에 속한 요청만
  if (!(await getAccessibleDraft(req.draftId, user)))
    return { error: "권한이 없습니다." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const bytes = await file.arrayBuffer();
  const { urlPath, size } = await saveImageBuffer(Buffer.from(bytes), ext);

  const [newImage] = await db
    .insert(schema.images)
    .values({
      blogId: req.draft.blogId,
      draftId: req.draftId,
      source: "user_shot",
      filePath: urlPath,
      mimeType: file.type,
      fileSize: size,
      sourceMetaJson: JSON.stringify({ slot: req.slot }),
    })
    .returning();

  await db
    .update(schema.imageRequests)
    .set({
      status: "uploaded",
      uploadedImageId: newImage.id,
      uploadedAt: new Date().toISOString(),
    })
    .where(eq(schema.imageRequests.id, requestId));

  revalidatePath("/photos");
  return { success: true };
}

/** 자동 이미지 소싱(스톡/AI/스톡→AI) — 반려 피드백 재생성도 동일 액션. */
export async function autoSourcePhotoAction(
  requestId: string,
  mode: "stock" | "ai" | "stock_then_ai",
  feedback?: string
): Promise<{ ok: boolean; error?: string; provider?: string; imageUrl?: string }> {
  const user = await requireUser();
  if (!requestId) return { ok: false, error: "요청 ID가 없습니다." };
  const req = await db.query.imageRequests.findFirst({
    where: eq(schema.imageRequests.id, requestId),
  });
  if (!req) return { ok: false, error: "요청을 찾을 수 없습니다." };
  if (!(await getAccessibleDraft(req.draftId, user)))
    return { ok: false, error: "권한이 없습니다." };

  const { autoSourceForRequest } = await import("@/lib/image-sourcing");
  const res = await autoSourceForRequest({ requestId, mode, userId: user.id, feedback });
  if (!res.ok) return { ok: false, error: res.error };
  // revalidate는 안 함 — 같은 카드에서 미리보기/반려/재생성 루프를 돌 수 있도록 카드를 유지.
  return { ok: true, provider: res.provider, imageUrl: res.imageUrl };
}

export async function skipPhotoAction(
  _prevState: null,
  formData: FormData
): Promise<null> {
  const user = await requireUser();

  const requestId = String(formData.get("requestId") ?? "");
  if (requestId) {
    const req = await db.query.imageRequests.findFirst({
      where: eq(schema.imageRequests.id, requestId),
    });
    // 소유권 검증: 본인 소유 초안의 요청만 스킵 가능
    if (req && (await getAccessibleDraft(req.draftId, user))) {
      await db
        .update(schema.imageRequests)
        .set({ status: "skipped" })
        .where(eq(schema.imageRequests.id, requestId));

      revalidatePath("/photos");
    }
  }
  return null;
}
