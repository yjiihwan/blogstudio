"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { nanoid } from "nanoid";
import path from "node:path";
import fs from "node:fs/promises";

const STORAGE_DIR = path.join(process.cwd(), "public", "storage");
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export async function uploadPhotoAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  await requireUser();

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

  await ensureStorageDir();

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const imgId = nanoid(16);
  const fileName = `${imgId}.${ext}`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const bytes = await file.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(bytes));

  const [newImage] = await db
    .insert(schema.images)
    .values({
      blogId: req.draft.blogId,
      draftId: req.draftId,
      source: "user_shot",
      filePath: `/storage/${fileName}`,
      mimeType: file.type,
      fileSize: file.size,
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

export async function skipPhotoAction(
  _prevState: null,
  formData: FormData
): Promise<null> {
  await requireUser();

  const requestId = String(formData.get("requestId") ?? "");
  if (requestId) {
    await db
      .update(schema.imageRequests)
      .set({ status: "skipped" })
      .where(eq(schema.imageRequests.id, requestId));

    revalidatePath("/photos");
  }
  return null;
}
