import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon?: ReactNode };

export function AppShell({
  navItems,
  currentPath,
  user,
  children,
}: {
  navItems: NavItem[];
  currentPath: string;
  user: { name: string; email: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper-100">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-paper-300 bg-paper-50">
        <div className="px-5 pt-6 pb-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-ink-900 text-paper-100 flex items-center justify-center font-serif font-black">
              S
            </div>
            <div className="font-bold tracking-tight">Blog Studio</div>
          </Link>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active =
              currentPath === item.href ||
              currentPath.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-paper-200 text-ink-900"
                    : "text-ink-500 hover:bg-paper-200/60 hover:text-ink-800"
                )}
              >
                <span
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-accent-600" : "text-ink-400"
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-paper-300">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-paper-200 flex items-center justify-center text-xs font-bold text-ink-700">
              {user.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user.name}</div>
              <div className="text-[11px] text-ink-400 truncate">
                {user.email}
              </div>
            </div>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="text-[11px] text-ink-400 hover:text-ink-800"
              >
                나가기
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-paper-50 border-b border-paper-300 px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-ink-900 text-paper-100 flex items-center justify-center font-serif text-sm font-black">
            S
          </div>
          <div className="text-sm font-bold">Blog Studio</div>
        </Link>
        <form action="/logout" method="post">
          <button type="submit" className="text-xs text-ink-500">
            나가기
          </button>
        </form>
      </header>

      <main className="lg:pl-60 min-h-screen pb-16 lg:pb-0">{children}</main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-paper-50 border-t border-paper-300 grid grid-cols-4 h-14">
        {navItems.slice(0, 4).map((item) => {
          const active =
            currentPath === item.href ||
            currentPath.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                active ? "text-ink-900" : "text-ink-400"
              )}
            >
              <span className="size-4">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
