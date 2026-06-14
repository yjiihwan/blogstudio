import Link from "next/link";
import { CalendarClock, BarChart3, Settings, UserCircle, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function MorePage() {
  const user = await getCurrentUser();
  const items = [
    { href: "/schedule", label: "스케줄", icon: <CalendarClock className="size-5" />, desc: "발행 예약 및 일정 관리" },
    { href: "/insights", label: "노출 분석", icon: <BarChart3 className="size-5" />, desc: "블로그별 유입·노출 현황" },
    { href: "/settings", label: "설정", icon: <Settings className="size-5" />, desc: "계정 및 앱 설정" },
    { href: "/account", label: "내 계정", icon: <UserCircle className="size-5" />, desc: "프로필·알림·API 키 설정" },
    ...(user?.role === "admin"
      ? [{ href: "/admin/users", label: "사용자 관리", icon: <Users className="size-5" />, desc: "회원 승인 및 관리" }]
      : []),
  ];
  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-lg font-bold text-ink-900 mb-4">더보기</h1>
      <div className="divide-y divide-paper-300 rounded-xl border border-paper-300 bg-paper-50 overflow-hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 px-4 py-4 active:bg-paper-200"
          >
            <span className="size-10 rounded-xl bg-paper-200 flex items-center justify-center text-ink-600 shrink-0">
              {item.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink-900 text-sm">{item.label}</div>
              <div className="text-xs text-ink-400 mt-0.5">{item.desc}</div>
            </div>
            <span className="text-ink-300 text-lg">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
