import Link from "next/link";
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
  searchParams: Promise<{ error?: string; email?: string; signup?: string; pending?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error, email, signup, pending } = await searchParams;

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

              {signup === "1" && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                  회원가입이 완료되었습니다. 로그인해주세요.
                </div>
              )}

              {pending === "1" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  가입 신청이 완료되었습니다. 관리자 승인 후 로그인하실 수 있습니다.
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">
                  {decodeURIComponent(error)}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full mt-2">
                로그인
              </Button>

              <p className="text-center text-sm text-ink-500 pt-2">
                계정이 없으신가요?{" "}
                <Link href="/signup" className="text-ink-800 underline underline-offset-2 font-medium">
                  회원가입
                </Link>
              </p>
            </form>

            {process.env.NODE_ENV !== "production" && (
              <div className="mt-8 p-3 rounded-lg bg-paper-200 text-xs text-ink-600">
                <div className="font-semibold text-ink-700 mb-1 text-[11px] uppercase tracking-wider">
                  개발용 계정
                </div>
                <div>admin@blogstudio.local / studio1234!</div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-400 mt-6">
          © {new Date().getFullYear()} Blog Studio
        </p>
      </div>
    </div>
  );
}
