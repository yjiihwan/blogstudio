/**
 * Cron tick — run every 5 minutes from launchd/cron:
 *   * /5 * * * *  cd /Users/ideagent/blog_studio && npm run -s cron:tick
 *
 * For each enabled schedule, if nextRunAt has passed, kick off
 * generateDraftForBlog and update lastRunAt + nextRunAt (with jitter).
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { generateDraftForBlog } from "@/lib/pipeline";
import { CronExpressionParser } from "cron-parser";

function nextRun(cron: string, jitterMin: number, from = new Date()) {
  try {
    const it = CronExpressionParser.parse(cron, { currentDate: from });
    const base = it.next().toDate();
    const offsetMs =
      (Math.random() * 2 - 1) * jitterMin * 60_000;
    return new Date(base.getTime() + offsetMs);
  } catch {
    // Fallback: next hour
    return new Date(from.getTime() + 60 * 60_000);
  }
}

async function main() {
  const now = new Date();
  const schedules = await db.query.schedules.findMany({
    where: eq(schema.schedules.enabled, true),
    with: { blog: true },
  });

  for (const s of schedules) {
    const due =
      !s.nextRunAt || new Date(s.nextRunAt).getTime() <= now.getTime();
    if (!due) continue;
    if (s.blog.status !== "active") continue;

    console.log(`[cron] generating draft for ${s.blog.displayName}`);
    try {
      const d = await generateDraftForBlog(s.blogId);
      console.log(`  → draft ${d.id}`);
    } catch (e) {
      console.error(`  ✗ failed: ${(e as Error).message}`);
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
