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

  // 2) 자가복구(self-healing) 스키마 정합화.
  //    마이그레이션 journal/볼륨 상태와 무관하게, 스키마가 기대하는 컬럼이
  //    실제로 존재하는지 PRAGMA로 확인하고 누락분만 ADD COLUMN 한다(멱등).
  //    이게 없으면 운영 볼륨 DB에 컬럼 누락 시 db.query.users.findFirst 가
  //    "no such column" 으로 깨져 로그인이 500을 낸다.
  try {
    const { rawSqlite } = await import("@/db/client");
    reconcileSchema(rawSqlite);
    console.log("[instrumentation] schema reconcile ok");
  } catch (err) {
    console.error("[instrumentation] schema reconcile FAILED:", String(err));
  }
}

type ColumnSpec = { name: string; ddl: string };

// 후속 마이그레이션(0001~0007)이 추가한 컬럼 = 운영 볼륨에서 누락 위험이 큰 대상.
// ddl 은 SQLite `ALTER TABLE <t> ADD COLUMN <ddl>` 에 그대로 붙는다.
// NOT NULL 컬럼은 기존 행이 채워지도록 상수 DEFAULT 를 반드시 동반한다.
const EXPECTED: Record<string, ColumnSpec[]> = {
  users: [
    { name: "name", ddl: "`name` text NOT NULL DEFAULT ''" },
    { name: "role", ddl: "`role` text NOT NULL DEFAULT 'user'" },
    // status: 기존 행이 'pending' 으로 잠겨 로그인 차단되지 않도록 'approved' 로 백필.
    { name: "status", ddl: "`status` text NOT NULL DEFAULT 'approved'" },
    { name: "is_active", ddl: "`is_active` integer NOT NULL DEFAULT 1" },
    { name: "api_key_mode", ddl: "`api_key_mode` text NOT NULL DEFAULT 'user_key'" },
    { name: "openai_api_key", ddl: "`openai_api_key` text" },
    { name: "image_api_key_mode", ddl: "`image_api_key_mode` text NOT NULL DEFAULT 'system'" },
    { name: "unsplash_key", ddl: "`unsplash_key` text" },
    { name: "pexels_key", ddl: "`pexels_key` text" },
    { name: "google_ai_key", ddl: "`google_ai_key` text" },
    { name: "telegram_chat_id", ddl: "`telegram_chat_id` text" },
  ],
  blogs: [
    { name: "owner_id", ddl: "`owner_id` text REFERENCES `users`(`id`)" },
  ],
};

function reconcileSchema(sqlite: {
  prepare: (sql: string) => { all: () => Array<{ name: string }> };
  exec: (sql: string) => void;
}) {
  for (const [table, columns] of Object.entries(EXPECTED)) {
    // 테이블 자체가 없으면(초기 0000 미적용) 정석 마이그레이션 영역이므로 건너뛴다.
    let existing: Set<string>;
    try {
      const rows = sqlite.prepare(`PRAGMA table_info(\`${table}\`)`).all();
      if (!rows.length) continue;
      existing = new Set(rows.map((r) => r.name));
    } catch {
      continue;
    }
    for (const col of columns) {
      if (existing.has(col.name)) continue;
      sqlite.exec(`ALTER TABLE \`${table}\` ADD COLUMN ${col.ddl}`);
      console.log(`[instrumentation] +column ${table}.${col.name}`);
    }
  }
}
