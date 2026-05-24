import Link from "next/link";
import { db, schema } from "@/db/client";
import { and, count, desc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, relativeTime, truncate } from "@/lib/utils";
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  FileEdit,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { hasAnthropic } from "@/lib/env";

export default async function Dashboard() {
  const [pending] = await db
    .select({ n: count() })
    .from(schema.drafts)
    .where(eq(schema.drafts.status, "ready_for_review"));
  const [published] = await db
    .select({ n: count() })
    .from(schema.drafts)
    .where(eq(schema.drafts.status, "published"));
  const [photoReqs] = await db
    .select({ n: count() })
    .from(schema.imageRequests)
    .where(eq(schema.imageRequests.status, "pending"));
  const [activeBlogs] = await db
    .select({ n: count() })
    .from(schema.blogs)
    .where(eq(schema.blogs.status, "active"));

  const queue = await db.query.drafts.findMany({
    where: eq(schema.drafts.status, "ready_for_review"),
    with: { blog: true },
    orderBy: desc(schema.drafts.createdAt),
    limit: 5,
  });

  const upcoming = await db.query.schedules.findMany({
    where: eq(schema.schedules.enabled, true),
    with: { blog: true },
    limit: 6,
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-6xl mx-auto">
      <header className="mb-9">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Today's Studio
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-balance">
          오늘 검토할 글 {pending.n}편, 사진 요청 {photoReqs.n}건이 기다리고 있어요.
        </h1>
        {!hasAnthropic() && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-500 text-xs font-semibold">
            <Sparkles className="size-3.5" />
            데모 모드 — Anthropic API 키 미연결. 설정 → API 키 등록 시 실제 생성 활성화
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-9">
        <Stat
          label="검토 대기"
          value={`${pending.n}편`}
          accent
          href="/queue?status=ready_for_review"
        />
        <Stat label="발행 누적" value={`${published.n}편`} href="/queue?status=published" />
        <Stat label="활성 블로그" value={`${activeBlogs.n}개`} href="/blogs" />
        <Stat
          label="사진 요청"
          value={`${photoReqs.n}건`}
          accent={photoReqs.n > 0}
          href="/photos"
        />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <div className="px-6 pt-6 pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <FileEdit className="size-4 text-ink-400" />
              검토 대기중인 초안
            </h2>
            <Link
              href="/queue"
              className="text-xs text-ink-500 hover:text-ink-900 flex items-center gap-1"
            >
              전체 큐 보기 <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <CardContent className="pt-0">
            {queue.length === 0 ? (
              <div className="py-14 text-center text-sm text-ink-400">
                현재 검토 대기중인 초안이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-paper-300">
                {queue.map((d) => (
                  <li key={d.id} className="py-3 first:pt-1">
                    <Link
                      href={`/queue/${d.id}`}
                      className="block group rounded-lg -mx-3 px-3 py-2 hover:bg-paper-200/60"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone="outline">{d.blog.displayName}</Badge>
                        <Badge tone="amber">검토 대기</Badge>
                        <span className="text-[11px] text-ink-400">
                          {relativeTime(d.createdAt)} · {d.charCount.toLocaleString()}자
                        </span>
                      </div>
                      <div className="font-semibold text-ink-900 leading-snug">
                        {truncate(d.title, 60)}
                      </div>
                      {d.summary && (
                        <div className="text-sm text-ink-500 mt-0.5 line-clamp-1">
                          {d.summary}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
                        {d.seoScore != null && (
                          <span>SEO {d.seoScore}점</span>
                        )}
                        {d.humanScore != null && (
                          <span>휴먼 톤 {d.humanScore}점</span>
                        )}
                        <span>이미지 {d.imageCount}장</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="px-6 pt-6 pb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Newspaper className="size-4 text-ink-400" />
                예정된 자동 생성
              </h2>
            </div>
            <CardContent className="pt-0">
              {upcoming.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-400">
                  스케줄이 등록되지 않았습니다.
                </div>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {s.blog.displayName}
                        </div>
                        <div className="text-[11px] text-ink-400 font-mono">
                          {s.cron} (±{s.jitterMin}분)
                        </div>
                      </div>
                      {s.nextRunAt && (
                        <div className="text-[11px] text-ink-500">
                          {formatDateTime(s.nextRunAt)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-ink-900 text-paper-200 border-ink-900">
            <CardContent>
              <div className="text-xs font-bold text-accent-300 tracking-widest mb-2">
                QUICK ACTIONS
              </div>
              <div className="space-y-2">
                <Button asChild variant="accent" size="md" className="w-full">
                  <Link href="/queue/new">
                    <Sparkles className="size-4" />
                    지금 새 초안 만들기
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="md" className="w-full">
                  <Link href="/photos">
                    <Camera className="size-4" />
                    사진 요청 처리
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="md" className="w-full">
                  <Link href="/blogs/new">
                    <Newspaper className="size-4" />
                    블로그 계정 추가
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-card px-4 py-4 border transition hover:-translate-y-px hover:shadow-sm ${
        accent
          ? "border-accent-200 bg-accent-50/50"
          : "border-paper-300 bg-paper-50"
      }`}
    >
      <div className="text-[11px] text-ink-500 font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-2xl font-black mt-1 ${
          accent ? "text-accent-700" : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </Link>
  );
}
