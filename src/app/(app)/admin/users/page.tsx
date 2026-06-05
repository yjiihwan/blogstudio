import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { UserTable } from "./user-table";

export default async function AdminUsersPage() {
  const me = await requireAdmin().catch(() => null);
  if (!me) redirect("/dashboard");

  const users = await db.query.users.findMany({
    orderBy: [asc(schema.users.createdAt)],
  });

  // pending 사용자 상단 노출
  const sorted = [
    ...users.filter((u) => u.status === "pending"),
    ...users.filter((u) => u.status !== "pending"),
  ];

  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">사용자 관리</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">
              승인 대기 {pendingCount}건
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-500">
          전체 계정 · 역할 변경 · 승인 / 거부 · 삭제
        </p>
      </div>

      <UserTable
        users={sorted.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role as "admin" | "user",
          status: u.status as "pending" | "approved" | "rejected",
          isActive: u.isActive,
          createdAt: u.createdAt,
        }))}
        meId={me.id}
      />
    </div>
  );
}
