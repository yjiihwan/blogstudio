// 자가복구(self-healing) 스키마 정합화.
// 마이그레이션 journal/볼륨 상태와 무관하게, 스키마가 기대하는 컬럼이 실제로
// 존재하는지 PRAGMA 로 확인하고 누락분만 ADD COLUMN 한다(멱등·비파괴).
//
// WHY: 운영 볼륨 DB 에 후속 마이그레이션(0001~0007) 컬럼이 누락되면
// drizzle 의 db.query.users.findFirst 가 모든 컬럼을 SELECT 하다가
// "no such column" 으로 깨져 로그인 server action 이 500 을 낸다.
// instrumentation 훅 타이밍/실패에 의존하지 않도록, DB 최초 open 시점에도 호출한다.

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
    { name: "llm_provider", ddl: "`llm_provider` text NOT NULL DEFAULT 'anthropic'" },
    { name: "anthropic_api_key", ddl: "`anthropic_api_key` text" },
    { name: "openai_api_key", ddl: "`openai_api_key` text" },
    { name: "image_api_key_mode", ddl: "`image_api_key_mode` text NOT NULL DEFAULT 'system'" },
    { name: "unsplash_key", ddl: "`unsplash_key` text" },
    { name: "pexels_key", ddl: "`pexels_key` text" },
    { name: "google_ai_key", ddl: "`google_ai_key` text" },
    { name: "telegram_chat_id", ddl: "`telegram_chat_id` text" },
    { name: "telegram_link_code", ddl: "`telegram_link_code` text" },
    { name: "telegram_link_expires", ddl: "`telegram_link_expires` text" },
  ],
  blogs: [
    { name: "owner_id", ddl: "`owner_id` text REFERENCES `users`(`id`)" },
  ],
  personas: [
    { name: "age_group", ddl: "`age_group` text" },
  ],
};

type MinimalSqlite = {
  prepare: (sql: string) => { all: () => Array<{ name: string }> };
  exec: (sql: string) => void;
};

export function reconcileSchema(sqlite: MinimalSqlite): void {
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

    // openai_api_key → anthropic_api_key 데이터 마이그레이션 (1회성, 멱등)
    // openai_api_key 컬럼이 존재하고 anthropic_api_key가 신규 추가될 때만 실행.
    // WHY: 기존 컬럼명이 Anthropic 키를 담고 있어 네이밍 정정 + 실제 OpenAI 키 분리.
    if (
      table === "users" &&
      existing.has("openai_api_key") &&
      !existing.has("anthropic_api_key")
    ) {
      try {
        sqlite.exec("ALTER TABLE `users` ADD COLUMN `anthropic_api_key` text");
        sqlite.exec(
          "UPDATE `users` SET `anthropic_api_key` = `openai_api_key` WHERE `openai_api_key` IS NOT NULL"
        );
        sqlite.exec(
          "UPDATE `users` SET `openai_api_key` = NULL WHERE `openai_api_key` IS NOT NULL AND `anthropic_api_key` IS NOT NULL"
        );
        console.log("[reconcile] migrated openai_api_key → anthropic_api_key");
        existing.add("anthropic_api_key");
      } catch (err) {
        console.error("[reconcile] FAILED migration openai→anthropic:", String(err));
      }
    }

    for (const col of columns) {
      if (existing.has(col.name)) continue;
      try {
        sqlite.exec(`ALTER TABLE \`${table}\` ADD COLUMN ${col.ddl}`);
        console.log(`[reconcile] +column ${table}.${col.name}`);
      } catch (err) {
        // 컬럼 하나 실패가 나머지 보강을 막지 않도록 격리.
        console.error(`[reconcile] FAILED ${table}.${col.name}:`, String(err));
      }
    }
  }
}
