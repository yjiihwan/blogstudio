import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { reconcileSchema } from "./reconcile";
import { ensureAdminSeed } from "./bootstrap";

// WHY: DATABASE_URL이 런타임에 안 잡히면 .data/studio.db 로 조용히 폴백한다. 그 결과
// 세션 JWT의 uid가 "다른 DB"에 대해 발급/검증되어, getCurrentUser 가 사용자를 못 찾고
// requireUser 가 UNAUTHENTICATED 를 던진다(설정 저장 "무반응"의 근본원인 = DB split-brain).
// 프로덕션에선 폴백을 금지하고, 어떤 DB를 열었는지 절대경로를 반드시 로깅한다.
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL?.replace(/^file:/, "").trim();
  if (raw) return path.resolve(raw);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production — refusing silent fallback to .data/studio.db (auth split-brain 방지)"
    );
  }
  return path.join(process.cwd(), ".data", "studio.db");
}

const DB_PATH = resolveDbPath();

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
  console.log("[client] sqlite open:", DB_PATH);
  s.pragma("journal_mode = WAL");
  s.pragma("foreign_keys = ON");
  _sqlite = s;
  // WHY: instrumentation 훅이 안 돌거나 마이그레이션이 부분 실패해도, 첫 쿼리 전에
  // 누락 컬럼을 멱등 보강해 로그인 500("no such column")을 원천 차단한다.
  try {
    reconcileSchema(s);
  } catch (err) {
    console.error("[client] reconcileSchema on open failed:", String(err));
  }
  // WHY: 스키마 보강 직후, admin 계정 부재로 로그인이 인증 거부되지 않도록 멱등 보강.
  ensureAdminSeed(s);
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
