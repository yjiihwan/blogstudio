import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import {
  LayoutDashboard,
  FileEdit,
  ImageIcon,
  Newspaper,
  BarChart3,
  Settings,
  CalendarClock,
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

  return (
    <AppShell
      currentPath={pathname}
      user={{ name: user.name, email: user.email }}
      navItems={[
        { href: "/dashboard", label: "대시보드", icon: <LayoutDashboard /> },
        { href: "/queue", label: "초안 큐", icon: <FileEdit /> },
        { href: "/blogs", label: "블로그·페르소나", icon: <Newspaper /> },
        { href: "/photos", label: "사진 요청", icon: <ImageIcon /> },
        { href: "/schedule", label: "스케줄", icon: <CalendarClock /> },
        { href: "/insights", label: "노출 분석", icon: <BarChart3 /> },
        { href: "/settings", label: "설정", icon: <Settings /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
