import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const DB_PATH =
  process.env.DATABASE_URL?.replace(/^file:/, "") ??
  path.join(process.cwd(), ".data", "studio.db");

// 지연 초기화(lazy): 모듈 import 만으로는 DB를 열지 않는다.
// `next build`의 "collect page data" 단계는 라우트 모듈을 로드하는데, 이때 DB를 열면
// Railway 빌드 환경엔 볼륨(/data)이 아직 없어서 "directory does not exist"로 빌드가 깨진다.
// 실제 첫 사용(런타임 요청) 시점에 연다 — 그때는 볼륨이 마운트돼 있다.
let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const s = new Database(DB_PATH);
  s.pragma("journal_mode = WAL");
  s.pragma("foreign_keys = ON");
  _sqlite = s;
  return s;
}

function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;
  _db = drizzle(getSqlite(), { schema });
  return _db;
}

// 프록시로 접근을 첫 사용까지 미룬다(메서드는 실제 객체에 바인딩).
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export const rawSqlite = new Proxy({} as Database.Database, {
  get(_t, prop) {
    const real = getSqlite() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
