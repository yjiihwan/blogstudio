import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { GenerateDraftButton } from "./GenerateDraftButton";
import { requireUser, scopeBlogsWhere } from "@/lib/auth";

async function hasAnthropicKey(): Promise<boolean> {
  if (env.ANTHROPIC_API_KEY) return true;
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, "anthropic_api_key"),
  });
  if (!row) return false;
  const k = JSON.parse(row.valueJson) as string;
  return !!k;
}

export default async function NewDraftPage() {
  const user = await requireUser();
  const [blogs, anthropicReady] = await Promise.all([
    db.query.blogs.findMany({
      where: and(eq(schema.blogs.status, "active"), scopeBlogsWhere(user)),
      orderBy: asc(schema.blogs.displayName),
      with: { personas: true },
    }),
    hasAnthropicKey(),
  ]);

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft className="size-4" />
          초안 큐
        </Link>
      </div>

      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          New Draft
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          새 초안 생성
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          AI가 페르소나 가이드와 시기적 맥락을 보고 주제부터 자동으로 정해
          초안을 만듭니다. 약 15~40초 소요.
        </p>
      </header>

      {!anthropicReady && (
        <div className="mb-5 rounded-lg bg-amber-100 border border-amber-500/20 px-4 py-3 text-sm text-amber-500">
          <div className="font-semibold mb-0.5">데모 모드</div>
          Anthropic API 키 미연결 — 자리표시 텍스트로 생성됩니다. 실제 글은 설정 → API 키 등록 후 활성화됩니다.
        </div>
      )}

      <div className="space-y-2">
        {blogs.map((b) => {
          const persona =
            b.personas.find((p) => p.isActive) ?? b.personas[0];
          const keywords: string[] = persona
            ? JSON.parse(persona.focusKeywordsJson || "[]")
            : [];
          return (
            <Card key={b.id} className="transition hover:-translate-y-px hover:shadow-md">
              <CardContent className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone="outline">{b.niche ?? "기타"}</Badge>
                    <Badge tone="leaf">활성</Badge>
                  </div>
                  <h3 className="font-bold text-base">{b.displayName}</h3>
                  {keywords.length > 0 && (
                    <div className="mt-1 text-xs text-ink-500 line-clamp-1">
                      #{keywords.slice(0, 5).join("  #")}
                    </div>
                  )}
                </div>
                <GenerateDraftButton blogId={b.id} />
              </CardContent>
            </Card>
          );
        })}
        {blogs.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-ink-500">
              활성 상태의 블로그가 없습니다.{" "}
              <Link
                href="/blogs/new"
                className="text-accent-600 font-semibold underline underline-offset-4"
              >
                블로그 추가하기
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
