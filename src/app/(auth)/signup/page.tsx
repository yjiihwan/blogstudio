import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signupAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; email?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error, name, email } = await searchParams;

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
            <h1 className="text-2xl font-bold tracking-tight">회원가입</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              계정을 만들면 관리자의 승인 후 서비스를 이용할 수 있습니다.
            </p>

            <form action={signupAction} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={name ?? ""}
                  autoComplete="name"
                  required
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={email ?? ""}
                  autoComplete="email"
                  required
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="8자 이상"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                <Input
                  id="passwordConfirm"
                  name="passwordConfirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-accent-50 border border-accent-200 px-3 py-2 text-sm text-accent-700">
                  {decodeURIComponent(error)}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full mt-2">
                가입하기
              </Button>

              <p className="text-center text-sm text-ink-500 pt-2">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/login"
                  className="text-ink-800 underline underline-offset-2 font-medium"
                >
                  로그인
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-400 mt-6">
          © {new Date().getFullYear()} Blog Studio
        </p>
      </div>
    </div>
  );
}
