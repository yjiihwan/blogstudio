import path from "node:path";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("@/db/client");
    try {
      migrate(db, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
    } catch {
      // already migrated
    }
  }
}
