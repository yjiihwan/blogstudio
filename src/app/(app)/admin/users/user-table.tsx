"use client";

import { useTransition } from "react";
import {
  changeRoleAction,
  toggleActiveAction,
  deleteUserAction,
  approveUserAction,
  rejectUserAction,
} from "./actions";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  isActive: boolean;
  createdAt: string;
};

export function UserTable({ users, meId }: { users: User[]; meId: string }) {
  return (
    <div className="rounded-xl border border-paper-300 overflow-hidden bg-paper-50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-paper-300 bg-paper-100">
            <th className="px-4 py-3 text-left font-semibold text-ink-700">이름</th>
            <th className="px-4 py-3 text-left font-semibold text-ink-700">이메일</th>
            <th className="px-4 py-3 text-left font-semibold text-ink-700">역할</th>
            <th className="px-4 py-3 text-left font-semibold text-ink-700">승인 상태</th>
            <th className="px-4 py-3 text-left font-semibold text-ink-700">가입일</th>
            <th className="px-4 py-3 text-right font-semibold text-ink-700">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === meId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: User["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
        승인 대기
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
        거부됨
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      승인됨
    </span>
  );
}

function UserRow({ user: u, isSelf }: { user: User; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  const handleRole = () => {
    startTransition(() =>
      changeRoleAction(u.id, u.role === "admin" ? "user" : "admin")
    );
  };

  const handleToggle = () => {
    startTransition(() => toggleActiveAction(u.id, !u.isActive));
  };

  const handleDelete = () => {
    if (
      !confirm(
        `${u.name} 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      )
    )
      return;
    startTransition(() => deleteUserAction(u.id));
  };

  const handleApprove = () => {
    startTransition(() => approveUserAction(u.id));
  };

  const handleReject = () => {
    if (!confirm(`${u.name} 계정의 가입을 거부하시겠습니까?`)) return;
    startTransition(() => rejectUserAction(u.id));
  };

  const isPending = u.status === "pending";

  return (
    <tr
      className={`border-b border-paper-200 last:border-0 hover:bg-paper-100/50 transition ${
        isPending ? "bg-amber-50/40" : ""
      }`}
    >
      <td className="px-4 py-3 font-medium text-ink-900">
        {u.name}
        {isSelf && (
          <span className="ml-2 text-[10px] bg-ink-900 text-paper-100 px-1.5 py-0.5 rounded">
            나
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-600">{u.email}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
            u.role === "admin"
              ? "bg-ink-900 text-paper-100"
              : "bg-paper-200 text-ink-700"
          }`}
        >
          {u.role === "admin" ? "관리자" : "일반"}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={u.status} />
      </td>
      <td className="px-4 py-3 text-ink-500 text-xs">{u.createdAt.slice(0, 10)}</td>
      <td className="px-4 py-3">
        {!isSelf && (
          <div className="flex items-center gap-2 justify-end flex-wrap">
            {isPending && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={pending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-green-300 hover:border-green-500 bg-green-50 text-green-700 hover:bg-green-100 font-semibold transition disabled:opacity-40"
                >
                  승인
                </button>
                <button
                  onClick={handleReject}
                  disabled={pending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-red-200 hover:border-red-400 text-red-500 hover:text-red-700 transition disabled:opacity-40"
                >
                  거부
                </button>
              </>
            )}
            {!isPending && (
              <>
                <button
                  onClick={handleRole}
                  disabled={pending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-paper-300 hover:border-ink-400 text-ink-600 hover:text-ink-900 transition disabled:opacity-40"
                >
                  {u.role === "admin" ? "→ 일반" : "→ 관리자"}
                </button>
                <button
                  onClick={handleToggle}
                  disabled={pending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-paper-300 hover:border-ink-400 text-ink-600 hover:text-ink-900 transition disabled:opacity-40"
                >
                  {u.isActive ? "비활성화" : "활성화"}
                </button>
              </>
            )}
            <button
              onClick={handleDelete}
              disabled={pending}
              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 hover:border-red-400 text-red-500 hover:text-red-700 transition disabled:opacity-40"
            >
              삭제
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
