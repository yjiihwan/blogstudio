/**
 * Cron tick 핵심 로직 — CLI(scripts/cron_tick.ts)와 인앱 스케줄러
 * (src/instrumentation.ts)가 공유한다.
 *
 * enabled 스케줄 중 nextRunAt 이 지난 것마다 generateDraftForBlog 를 돌리고
 * lastRunAt/nextRunAt(지터 포함)을 갱신한다. 멱등하며, 한 번에 하나만 돈다.
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { generateDraftForBlog } from "@/lib/pipeline";
import { CronExpressionParser } from "cron-parser";

export function nextRun(cron: string, jitterMin: number, from = new Date()): Date {
  try {
    const it = CronExpressionParser.parse(cron, { currentDate: from });
    const base = it.next().toDate();
    const offsetMs = (Math.random() * 2 - 1) * jitterMin * 60_000;
    return new Date(base.getTime() + offsetMs);
  } catch {
    // Fallback: next hour
    return new Date(from.getTime() + 60 * 60_000);
  }
}

export type CronTickResult = { checked: number; generated: number; failed: number };

export async function runCronTick(
  log: (msg: string) => void = () => {}
): Promise<CronTickResult> {
  const now = new Date();
  const schedules = await db.query.schedules.findMany({
    where: eq(schema.schedules.enabled, true),
    with: { blog: true },
  });

  let generated = 0;
  let failed = 0;
  for (const s of schedules) {
    const due = !s.nextRunAt || new Date(s.nextRunAt).getTime() <= now.getTime();
    if (!due) continue;
    if (s.blog.status !== "active") continue;

    log(`[cron] generating draft for ${s.blog.displayName}`);
    try {
      // 소유자 맥락으로 생성 — user_key 모드에서 소유자 API 키가 적용되도록
      const d = await generateDraftForBlog(s.blogId, s.blog.ownerId ?? undefined);
      log(`  → draft ${d.id}`);
      generated++;
    } catch (e) {
      log(`  ✗ failed: ${(e as Error).message}`);
      failed++;
    }

    const next = nextRun(s.cron, s.jitterMin, now);
    await db
      .update(schema.schedules)
      .set({
        lastRunAt: now.toISOString(),
        nextRunAt: next.toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(eq(schema.schedules.id, s.id));
  }

  return { checked: schedules.length, generated, failed };
}
