export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { join } = await import("node:path");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("@/db/client");
    try {
      migrate(db, {
        migrationsFolder: join(process.cwd(), "drizzle"),
      });
    } catch {
      // already migrated
    }
  }
}
