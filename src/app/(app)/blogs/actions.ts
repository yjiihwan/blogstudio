"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getAccessibleBlog, requireUser } from "@/lib/auth";

function readPayload(formData: FormData) {
  return {
    blog: {
      naverBlogId: String(formData.get("naverBlogId") ?? "").trim(),
      displayName: String(formData.get("displayName") ?? "").trim(),
      blogTitle: String(formData.get("blogTitle") ?? "").trim() || null,
      blogUrl: String(formData.get("blogUrl") ?? "").trim() || null,
      niche: String(formData.get("niche") ?? "").trim() || null,
      status: String(formData.get("status") ?? "active") as
        | "active"
        | "paused"
        | "archived",
    },
    schedule: {
      cron: String(formData.get("cron") ?? "0 7 * * 1").trim() || "0 7 * * 1",
      jitterMin: Number(formData.get("jitterMin") ?? 45) || 45,
    },
    persona: {
      purpose: String(formData.get("purpose") ?? "").trim(),
      audience: String(formData.get("audience") ?? "").trim(),
      brandVoice: String(formData.get("brandVoice") ?? "").trim(),
      pointOfView: String(formData.get("pointOfView") ?? "first_person") as
        | "first_person"
        | "third_person"
        | "expert",
      formality: String(formData.get("formality") ?? "neutral") as
        | "informal"
        | "neutral"
        | "formal",
      ageGroup: (() => {
        const v = String(formData.get("ageGroup") ?? "").trim();
        return (["teens", "20s", "30s", "40s", "50s", "60s"] as const).includes(
          v as never
        )
          ? (v as "teens" | "20s" | "30s" | "40s" | "50s" | "60s")
          : null;
      })(),
      gender: (() => {
        const v = String(formData.get("gender") ?? "").trim();
        return v === "female" || v === "male" ? (v as "female" | "male") : null;
      })(),
      focusKeywords: formData.getAll("focusKeywords").map(String).filter(Boolean),
      forbiddenWords: formData
        .getAll("forbiddenWords")
        .map(String)
        .filter(Boolean),
      ctas: formData.getAll("ctas").map(String).filter(Boolean),
      qualityRules: formData
        .getAll("qualityRules")
        .map(String)
        .filter(Boolean),
      // 시설 팩트: 있는 것 / 없는 것(수영장·사우나 등) — 날조 방지 근거
      facilities: formData.getAll("facilities").map(String).filter(Boolean),
      absentFacilities: formData
        .getAll("absentFacilities")
        .map(String)
        .filter(Boolean),
      preferredLengthMin: Number(formData.get("preferredLengthMin") ?? 1500),
      preferredLengthMax: Number(formData.get("preferredLengthMax") ?? 2800),
      imagesPerPostMin: Number(formData.get("imagesPerPostMin") ?? 3),
      imagesPerPostMax: Number(formData.get("imagesPerPostMax") ?? 8),
      sampleSnippets: [
        String(formData.get("sampleSnippet1") ?? "").trim(),
        String(formData.get("sampleSnippet2") ?? "").trim(),
      ].filter(Boolean),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}

export async function createBlogAction(formData: FormData) {
  const user = await requireUser();
  const { blog, persona, schedule } = readPayload(formData);
  if (!blog.naverBlogId || !blog.displayName) {
    redirect(
      `/blogs/new?error=${encodeURIComponent(
        "네이버 블로그 ID와 표시명은 필수입니다."
      )}`
    );
  }
  // 신규 블로그는 생성한 세션 유저 소유로 자동 귀속
  const [created] = await db
    .insert(schema.blogs)
    .values({ ...blog, ownerId: user.id })
    .returning();

  await db.insert(schema.personas).values({
    blogId: created.id,
    purpose: persona.purpose,
    audience: persona.audience,
    brandVoice: persona.brandVoice,
    pointOfView: persona.pointOfView,
    formality: persona.formality,
    ageGroup: persona.ageGroup,
    gender: persona.gender,
    coreTopicsJson: "[]",
    focusKeywordsJson: JSON.stringify(persona.focusKeywords),
    forbiddenWordsJson: JSON.stringify(persona.forbiddenWords),
    callsToActionJson: JSON.stringify(persona.ctas),
    qualityRulesJson: JSON.stringify(persona.qualityRules),
    facilitiesJson: JSON.stringify(persona.facilities),
    absentFacilitiesJson: JSON.stringify(persona.absentFacilities),
    sampleSnippetsJson: JSON.stringify(persona.sampleSnippets),
    preferredLengthMin: persona.preferredLengthMin,
    preferredLengthMax: persona.preferredLengthMax,
    imagesPerPostMin: persona.imagesPerPostMin,
    imagesPerPostMax: persona.imagesPerPostMax,
    notes: persona.notes,
  });

  await db.insert(schema.schedules).values({
    blogId: created.id,
    cron: schedule.cron,
    jitterMin: schedule.jitterMin,
    enabled: blog.status === "active",
  });

  revalidatePath("/blogs");
  revalidatePath("/dashboard");
  redirect(`/blogs/${created.id}`);
}

export async function updateBlogAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  if (!id) return;
  // 소유권 검증: 타인 블로그 수정 차단
  if (!(await getAccessibleBlog(id, user))) throw new Error("FORBIDDEN");
  const { blog, persona, schedule } = readPayload(formData);

  await db
    .update(schema.blogs)
    .set({ ...blog, updatedAt: new Date().toISOString() })
    .where(eq(schema.blogs.id, id));

  // Update active persona (single row)
  const existing = await db.query.personas.findFirst({
    where: eq(schema.personas.blogId, id),
  });
  const newPersona = {
    blogId: id,
    purpose: persona.purpose,
    audience: persona.audience,
    brandVoice: persona.brandVoice,
    pointOfView: persona.pointOfView,
    formality: persona.formality,
    ageGroup: persona.ageGroup,
    gender: persona.gender,
    focusKeywordsJson: JSON.stringify(persona.focusKeywords),
    forbiddenWordsJson: JSON.stringify(persona.forbiddenWords),
    callsToActionJson: JSON.stringify(persona.ctas),
    qualityRulesJson: JSON.stringify(persona.qualityRules),
    facilitiesJson: JSON.stringify(persona.facilities),
    absentFacilitiesJson: JSON.stringify(persona.absentFacilities),
    sampleSnippetsJson: JSON.stringify(persona.sampleSnippets),
    preferredLengthMin: persona.preferredLengthMin,
    preferredLengthMax: persona.preferredLengthMax,
    imagesPerPostMin: persona.imagesPerPostMin,
    imagesPerPostMax: persona.imagesPerPostMax,
    notes: persona.notes,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    await db
      .update(schema.personas)
      .set(newPersona)
      .where(eq(schema.personas.id, existing.id));
  } else {
    await db.insert(schema.personas).values(newPersona);
  }

  const existingSched = await db.query.schedules.findFirst({
    where: eq(schema.schedules.blogId, id),
  });
  if (existingSched) {
    await db
      .update(schema.schedules)
      .set({
        cron: schedule.cron,
        jitterMin: schedule.jitterMin,
        enabled: blog.status === "active",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.schedules.id, existingSched.id));
  } else {
    await db.insert(schema.schedules).values({
      blogId: id,
      cron: schedule.cron,
      jitterMin: schedule.jitterMin,
      enabled: blog.status === "active",
    });
  }

  revalidatePath("/blogs");
  revalidatePath(`/blogs/${id}`);
  revalidatePath("/dashboard");
  redirect(`/blogs/${id}?saved=1`);
}
