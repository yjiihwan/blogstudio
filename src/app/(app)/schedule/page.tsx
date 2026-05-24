import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Terminal } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

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
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">스케줄</h1>
        <p className="mt-1.5 text-sm text-ink-500 max-w-xl">
          각 블로그의 자동 생성 cron 패턴입니다. 블로그 설정 화면에서 변경할 수 있어요.
        </p>
      </header>

      <Card className="mb-4">
        <CardContent>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-2">
            <Terminal className="size-4 text-ink-400" />
            로컬에서 스케줄러 돌리는 법
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            맥 자체 launchd / cron에 1줄 등록하면 됩니다:
          </p>
          <pre className="mt-2 rounded-lg bg-ink-900 text-paper-100 px-3 py-3 text-[12px] overflow-x-auto font-mono">
{`*/5 * * * *  cd /Users/ideagent/blog_studio && /usr/local/bin/npm run -s cron:tick >> /tmp/blog_cron.log 2>&1`}
          </pre>
          <p className="mt-2 text-xs text-ink-500">
            5분마다 한 번씩 체크해서 cron 시간이 도래한 블로그만 생성을 트리거합니다.
            배포 시에는 Vercel Cron으로 자동 전환됩니다.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {schedules.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center gap-4">
              <CalendarClock className="size-5 text-accent-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge tone={s.enabled ? "leaf" : "neutral"}>
                    {s.enabled ? "활성" : "정지"}
                  </Badge>
                  <span className="font-semibold">{s.blog.displayName}</span>
                </div>
                <div className="text-xs text-ink-500 font-mono">
                  {s.cron}{" "}
                  <span className="text-ink-400">(±{s.jitterMin}분 흔들기)</span>
                </div>
              </div>
              <div className="text-right text-[11px] text-ink-400">
                {s.lastRunAt && (
                  <div>마지막 실행 {formatDateTime(s.lastRunAt)}</div>
                )}
                {s.nextRunAt && <div>다음 {formatDateTime(s.nextRunAt)}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
