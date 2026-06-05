import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { parseCronToHuman } from "@/lib/cron-utils";
import Link from "next/link";

export default async function SchedulePage() {
  const schedules = await db.query.schedules.findMany({
    with: { blog: true },
    orderBy: asc(schema.schedules.createdAt),
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-4xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Schedule
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">자동 생성 스케줄</h1>
        <p className="mt-1.5 text-sm text-ink-500 max-w-xl">
          각 블로그의 초안 자동 생성 일정입니다. 변경하려면 블로그 설정에서 수정해주세요.
        </p>
      </header>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-ink-400 text-sm">
            등록된 스케줄이 없습니다.{" "}
            <Link href="/blogs" className="text-accent-600 hover:underline">
              블로그를 먼저 추가해주세요.
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Link key={s.id} href={`/blogs/${s.blogId}`} className="block">
              <Card className="hover:border-accent-300 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4">
                  <CalendarClock className="size-5 text-accent-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={s.enabled ? "leaf" : "neutral"}>
                        {s.enabled ? "자동 생성 ON" : "정지됨"}
                      </Badge>
                      <span className="font-semibold">{s.blog.displayName}</span>
                    </div>
                    <div className="text-sm text-ink-700 font-medium">
                      {parseCronToHuman(s.cron)} 자동 생성
                    </div>
                    {s.jitterMin > 0 && (
                      <div className="text-xs text-ink-400 mt-0.5">
                        ±{s.jitterMin}분 내 랜덤 실행
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-ink-400 space-y-0.5 shrink-0">
                    {s.lastRunAt && (
                      <div>마지막 실행<br />{formatDateTime(s.lastRunAt)}</div>
                    )}
                    {s.nextRunAt && (
                      <div className="text-accent-600 font-semibold">
                        다음 실행<br />{formatDateTime(s.nextRunAt)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
