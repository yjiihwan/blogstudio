export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { join } = await import("node:path");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("@/db/client");
    const migrationsFolder = join(process.cwd(), "drizzle");
    migrate(db, { migrationsFolder });
    console.log("[instrumentation] DB migration ok, path:", migrationsFolder);
  } catch (err) {
    // Non-fatal: migration may already be applied, or DB opens on first request
    console.warn("[instrumentation] DB migration skipped:", String(err));
  }
}
