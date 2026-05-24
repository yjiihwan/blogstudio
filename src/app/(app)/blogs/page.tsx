import Link from "next/link";
import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink } from "lucide-react";

export default async function BlogsPage() {
  const blogs = await db.query.blogs.findMany({
    orderBy: asc(schema.blogs.createdAt),
    with: { personas: true, schedules: true, drafts: true },
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-6xl mx-auto">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
            Blog Accounts
          </div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
            블로그 · 페르소나
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 max-w-xl">
            계정마다 목적·톤·금지어·핵심 키워드를 정의해두면, AI가 매주 이
            가이드를 따라 글을 만듭니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/blogs/new">
            <Plus className="size-4" />
            블로그 추가
          </Link>
        </Button>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        {blogs.map((b) => {
          const persona = b.personas.find((p) => p.isActive) ?? b.personas[0];
          const cnt = b.drafts.length;
          const sched = b.schedules[0];
          const keywords: string[] = persona
            ? JSON.parse(persona.focusKeywordsJson || "[]")
            : [];
          return (
            <Link key={b.id} href={`/blogs/${b.id}`} className="block group">
              <Card className="transition-all hover:-translate-y-px hover:shadow-md">
                <CardContent>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {b.status === "active" ? (
                          <Badge tone="leaf">활성</Badge>
                        ) : b.status === "paused" ? (
                          <Badge tone="amber">일시정지</Badge>
                        ) : (
                          <Badge tone="neutral">보관됨</Badge>
                        )}
                        {b.niche && <Badge tone="outline">{b.niche}</Badge>}
                      </div>
                      <h2 className="font-bold text-base text-ink-900 truncate">
                        {b.displayName}
                      </h2>
                      {b.blogTitle && (
                        <div className="text-sm text-ink-500 truncate">
                          {b.blogTitle}
                        </div>
                      )}
                    </div>
                    {b.blogUrl && (
                      <span className="size-8 rounded-md flex items-center justify-center text-ink-300">
                        <ExternalLink className="size-3.5" />
                      </span>
                    )}
                  </div>

                  {persona?.purpose && (
                    <p className="text-sm text-ink-600 leading-relaxed line-clamp-2 mb-3">
                      {persona.purpose}
                    </p>
                  )}

                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {keywords.slice(0, 5).map((k) => (
                        <Badge key={k} tone="accent">
                          #{k}
                        </Badge>
                      ))}
                      {keywords.length > 5 && (
                        <Badge tone="neutral">+{keywords.length - 5}</Badge>
                      )}
                    </div>
                  )}

                  <div className="pt-3 mt-3 border-t border-paper-300 flex items-center justify-between text-xs text-ink-500">
                    <div>
                      누적 초안{" "}
                      <span className="font-semibold text-ink-900">
                        {cnt}편
                      </span>
                    </div>
                    {sched && (
                      <div className="font-mono text-[11px] text-ink-400">
                        {sched.cron} (±{sched.jitterMin}분)
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        <Link href="/blogs/new" className="block group">
          <div className="h-full rounded-card border-2 border-dashed border-paper-300 flex items-center justify-center p-12 text-ink-400 hover:border-accent-400 hover:text-accent-600 transition">
            <div className="text-center">
              <Plus className="size-6 mx-auto mb-2" />
              <div className="font-semibold text-sm">새 블로그 추가</div>
              <div className="text-xs mt-1">네이버 블로그 ID 등록</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
