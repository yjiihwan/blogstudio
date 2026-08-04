import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { envBanner } from "@/lib/publish/mode";
import {
  LayoutDashboard,
  FileEdit,
  ImageIcon,
  Newspaper,
  BarChart3,
  Settings,
  CalendarClock,
  Users,
  UserCircle,
  BookOpenText,
} from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/dashboard";
  const banner = envBanner();

  return (
    <>
      {banner?.show && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-ink-900 text-center text-xs font-bold py-1.5 px-3 shadow">
          🧪 {banner.label}
        </div>
      )}
      <div className={banner?.show ? "pt-7" : undefined}>
    <AppShell
      currentPath={pathname}
      user={{ name: user.name, email: user.email, role: user.role }}
      navItems={[
        { href: "/dashboard", label: "대시보드", icon: <LayoutDashboard className="size-5" /> },
        { href: "/queue", label: "초안 큐", icon: <FileEdit className="size-5" /> },
        { href: "/blogs", label: "블로그·페르소나", icon: <Newspaper className="size-5" /> },
        { href: "/photos", label: "사진 요청", icon: <ImageIcon className="size-5" /> },
        { href: "/schedule", label: "스케줄", icon: <CalendarClock className="size-5" /> },
        { href: "/insights", label: "노출 분석", icon: <BarChart3 className="size-5" /> },
        { href: "/settings", label: "설정", icon: <Settings className="size-5" /> },
        { href: "/account", label: "내 계정", icon: <UserCircle className="size-5" /> },
        ...(user.role === "admin"
          ? [
              { href: "/admin/users", label: "사용자 관리", icon: <Users className="size-5" /> },
              { href: "/admin/style-samples", label: "베스트 후기 원문", icon: <BookOpenText className="size-5" /> },
            ]
          : []),
      ]}
    >
      {children}
    </AppShell>
      </div>
    </>
  );
}
