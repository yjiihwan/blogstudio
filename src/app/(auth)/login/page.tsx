import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error, email } = await searchParams;

  return (
    <div className="min-h-screen bg-paper-100 paper-texture flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="size-9 rounded-md bg-ink-900 text-paper-100 flex items-center justify-center font-serif text-base font-black">
            S
          </div>
          <div className="font-bold tracking-tight text-lg">Blog Studio</div>
        </div>

        <Card>
          <CardContent className="py-8">
            <h1 className="text-2xl font-bold tracking-tight">로그인</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              네이버 블로그 자동화 스튜디오에 오신 것을 환영합니다.
            </p>

            <form action={loginAction} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={email ?? ""}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">
                  {decodeURIComponent(error)}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full mt-2">
                로그인
              </Button>
            </form>

            <div className="mt-8 p-3 rounded-lg bg-paper-200 text-xs text-ink-600">
              <div className="font-semibold text-ink-700 mb-1 text-[11px] uppercase tracking-wider">
                개발용 계정
              </div>
              <div>admin@blogstudio.local / studio1234!</div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-400 mt-6">
          © {new Date().getFullYear()} Blog Studio
        </p>
      </div>
    </div>
  );
}
