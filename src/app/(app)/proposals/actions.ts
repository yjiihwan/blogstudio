"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { acceptAndApply, rejectProposal, rollbackProposal } from "@/lib/proposals";
import { REJECT_REASONS } from "@/lib/proposals-core";

type Result = { ok: true; note?: string } | { ok: false; error: string };

export async function acceptProposalAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const edited = formData.get("editedAfter");
  const editedAfter = typeof edited === "string" && edited.trim() ? edited : null;
  const r = await acceptAndApply(id, user, editedAfter);
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/settings");
  revalidatePath("/blogs");
  return r.ok ? { ok: true, note: r.note } : { ok: false, error: r.error };
}

export async function rejectProposalAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("reason") ?? "other");
  const label = REJECT_REASONS.find((r) => r.value === code)?.label ?? "기타";
  const detail = String(formData.get("detail") ?? "").trim();
  const r = await rejectProposal(id, user, detail ? `${label} — ${detail}` : label);
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "거절 처리 실패" };
}

export async function rollbackProposalAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const r = await rollbackProposal(id, user);
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/settings");
  revalidatePath("/blogs");
  return r.ok ? { ok: true, note: "되돌렸습니다." } : { ok: false, error: r.error ?? "되돌리기 실패" };
}
