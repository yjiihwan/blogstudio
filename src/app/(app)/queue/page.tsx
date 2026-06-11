import Link from "next/link";
import { db, schema } from "@/db/client";
import { and, desc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DraftStatusBadge } from "@/components/status-badge";
import { relativeTime, truncate } from "@/lib/utils";
import { FileEdit, Sparkles, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { BlogFilter } from "@/components/blog-filter";
import { requireUser, scopeByBlogId, scopeBlogsWhere } from "@/lib/auth";

const STATUSES = [
  "ready_for_review",
  "revising",
  "approved",
  "published",
  "archived",
] as const;

const PAGE_SIZE = 20;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; blog?: string; page?: string }>;
}) {
  const { status, blog, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1") || 1);
  const user = await requireUser();

  const conditions = [];
  if (status && STATUSES.includes(status as any))
    conditions.push(eq(schema.drafts.status, status as any));
  if (blog) conditions.push(eq(schema.drafts.blogId, blog));
  // 격리: 일반 유저는 본인 소유 블로그의 초안만
  const ownerScope = await scopeByBlogId(user, schema.drafts.blogId);
  if (ownerScope) conditions.push(ownerScope);

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db.query.drafts.findMany({
    where: whereClause,
    orderBy: desc(schema.drafts.createdAt),
    with: { blog: true },
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });

  const hasNext = rows.length > PAGE_SIZE;
  const drafts = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  const blogs = await db.query.blogs.findMany({
    where: scopeBlogsWhere(user),
  });

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (blog) params.set("blog", blog);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/queue${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-6xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Drafts Queue
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          초안 큐
        </h1>
        <p className="mt-1.5 text-sm text-ink-500 max-w-xl">
          AI가 만든 초안을 검토하고 승인하거나 피드백을 줘서 다시 쓰게 할 수
          있어요.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href={`/queue${blog ? `?blog=${blog}` : ""}`} active={!status}>
          전체
        </Chip>
        {STATUSES.map((s) => (
          <Chip
            key={s}
            href={`/queue?status=${s}${blog ? `&blog=${blog}` : ""}`}
            active={status === s}
          >
            <DraftStatusBadge status={s} />
          </Chip>
        ))}
        <div className="grow" />
        <BlogFilter
          blogs={blogs.map((b) => ({ id: b.id, name: b.displayName }))}
          selected={blog}
          currentStatus={status}
        />
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <FileEdit className="size-10 text-paper-400 mx-auto mb-3" />
            <p className="text-sm text-ink-500">조건에 맞는 초안이 없어요.</p>
            <Button asChild className="mt-4">
              <Link href="/queue/new">
                <Sparkles className="size-4" />
                새 초안 생성
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/queue/${d.id}`}
                className="block group rounded-card"
              >
                <Card className="transition-all hover:-translate-y-px hover:shadow-md">
                  <CardContent>
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Badge tone="outline">{d.blog.displayName}</Badge>
                          <DraftStatusBadge status={d.status} />
                          {d.revisionRound > 0 && (
                            <Badge tone="sky">{d.revisionRound}차 수정본</Badge>
                          )}
                          <span className="text-[11px] text-ink-400">
                            {relativeTime(d.createdAt)}
                          </span>
                        </div>
                        <h3 className="font-bold text-ink-900 leading-snug">
                          {truncate(d.title, 70)}
                        </h3>
                        {d.summary && (
                          <p className="mt-0.5 text-sm text-ink-500 line-clamp-1">
                            {d.summary}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-400">
                          <span>{d.charCount.toLocaleString()}자</span>
                          <span className="flex items-center gap-1">
                            <ImageIcon className="size-3" />
                            {d.imageCount}장
                          </span>
                          {d.seoScore != null && (
                            <span>SEO {d.seoScore}</span>
                          )}
                          {d.humanScore != null && (
                            <span>휴먼 {d.humanScore}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {(page > 1 || hasNext) && (
            <div className="mt-6 flex items-center justify-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeft className="size-4" />
                    이전
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="size-4" />
                  이전
                </Button>
              )}
              <span className="text-sm text-ink-500 px-2">{page}페이지</span>
              {hasNext ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>
                    다음
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  다음
                  <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 h-9 rounded-full text-xs font-semibold transition ${
        active
          ? "bg-ink-900 text-paper-100"
          : "border border-paper-300 bg-paper-50 text-ink-700 hover:border-ink-400"
      }`}
    >
      {children}
    </Link>
  );
}
