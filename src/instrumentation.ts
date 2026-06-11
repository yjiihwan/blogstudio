export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 1) drizzle 마이그레이션(가능하면 정석 경로). 실패해도 비치명적.
  try {
    const { join } = await import("node:path");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("@/db/client");
    const migrationsFolder = join(process.cwd(), "drizzle");
    migrate(db, { migrationsFolder });
    console.log("[instrumentation] drizzle migrate ok:", migrationsFolder);
  } catch (err) {
    console.warn("[instrumentation] drizzle migrate skipped:", String(err));
  }

  // 2) 자가복구 스키마 정합화. client.getSqlite() 도 첫 open 시 동일 작업을 하지만,
  //    부팅 직후 명시적으로 한 번 더 돌려 컬럼 누락을 조기 차단한다(멱등).
  try {
    const { rawSqlite } = await import("@/db/client");
    const { reconcileSchema } = await import("@/db/reconcile");
    reconcileSchema(rawSqlite);
    console.log("[instrumentation] schema reconcile ok");
  } catch (err) {
    console.error("[instrumentation] schema reconcile FAILED:", String(err));
  }
}
