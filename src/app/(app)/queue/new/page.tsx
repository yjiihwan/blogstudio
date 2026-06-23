import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { decryptApiKey } from "@/lib/crypto";
import { GenerateDraftButton } from "./GenerateDraftButton";
import { requireUser, scopeBlogsWhere } from "@/lib/auth";

async function hasSystemKey(provider: "anthropic" | "openai"): Promise<boolean> {
  const settingsKey = provider === "anthropic" ? "anthropic_api_key" : "openai_api_key";
  const envKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (envKey) return true;
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, settingsKey) });
  if (!row) return false;
  const k = JSON.parse(row.valueJson) as string;
  return !!k;
}

async function userHasLLMKey(user: typeof schema.users.$inferSelect): Promise<boolean> {
  const provider = (user.llmProvider ?? "anthropic") as "anthropic" | "openai";
  if (user.apiKeyMode === "system") return hasSystemKey(provider);
  const encKey = provider === "anthropic" ? user.anthropicApiKey : user.openaiApiKey;
  if (!encKey) return false;
  try { decryptApiKey(encKey); return true; } catch { return false; }
}

export default async function NewDraftPage() {
  const user = await requireUser();
  const [blogs, llmReady] = await Promise.all([
    db.query.blogs.findMany({
      where: and(eq(schema.blogs.status, "active"), scopeBlogsWhere(user)),
      orderBy: asc(schema.blogs.displayName),
      with: { personas: true },
    }),
    userHasLLMKey(user),
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
          <strong>초안 생성</strong>은 AI가 주제부터 자동으로 정합니다(완전 자동).
          이벤트·단발성 글처럼 직접 정한 주제로 쓰려면 <strong>직접 입력</strong>(반자동)을
          쓰세요 — 페르소나는 그대로 적용됩니다. 약 15~40초 소요.
        </p>
      </header>

      {!llmReady && (
        <div className="mb-5 rounded-lg bg-amber-100 border border-amber-500/20 px-4 py-3 text-sm text-amber-500">
          <div className="font-semibold mb-0.5">데모 모드</div>
          API 키 미연결 — 자리표시 텍스트로 생성됩니다. 실제 글은 설정 → AI 글쓰기 설정에서 API 키를 등록하면 활성화됩니다.
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
                <div className="flex flex-col items-end gap-1.5">
                  <GenerateDraftButton blogId={b.id} />
                  <Link
                    href={`/queue/new/manual?blogId=${b.id}`}
                    className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline underline-offset-4"
                  >
                    직접 입력 →
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {blogs.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-ink-500">
              <p className="mb-3">
                현재 활성 블로그가 없습니다. 블로그 목록에서 상태를 확인하거나 새 블로그를 추가하세요.
              </p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/blogs"
                  className="text-accent-600 font-semibold underline underline-offset-4"
                >
                  블로그 목록 확인
                </Link>
                <span className="text-ink-300">|</span>
                <Link
                  href="/blogs/new"
                  className="text-accent-600 font-semibold underline underline-offset-4"
                >
                  블로그 추가하기
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
