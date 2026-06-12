// 멱등(idempotent)·비파괴 admin 부트스트랩.
// WHY: seed.ts 는 모든 테이블을 DELETE 하는 수동 개발용 스크립트라 운영에선 절대 안 돈다.
// 운영 볼륨 DB 가 재생성/마이그레이션되면 admin 행이 없어, 로그인 쿼리가 "user 없음"으로
// 떨어져 "이메일 또는 비밀번호가 올바르지 않습니다" 인증 거부가 난다.
// → DB 최초 open 시점(getSqlite)과 instrumentation 부팅에서 admin 존재를 보장한다.
//   기존 데이터는 건드리지 않고(없을 때만 INSERT), 잠긴 admin 만 해제(UNLOCK)한다.
import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

type MinimalSqlite = Pick<Database.Database, "prepare">;

const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ?? "admin@blogstudio.local"
)
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "studio1234!";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "스튜디오 관리자";
// 탈출구: 기존 admin 비밀번호를 강제로 기본값으로 되돌린다(평소엔 꺼둠).
const FORCE_PASSWORD = process.env.ADMIN_FORCE_PASSWORD === "1";

export function ensureAdminSeed(sqlite: MinimalSqlite): void {
  try {
    // users 테이블이 아직 없으면(0000 미적용) 정석 마이그레이션 영역 — 건너뜀.
    const cols = sqlite
      .prepare("PRAGMA table_info(`users`)")
      .all() as Array<{ name: string }>;
    if (!cols.length) return;
    const has = new Set(cols.map((c) => c.name));
    // 보강 전이라 필수 컬럼이 없으면(=reconcile 이 아직 안 돔) 건너뜀. 멱등하므로 다음 호출에서 처리.
    for (const need of ["email", "password_hash", "name", "role", "status", "is_active"]) {
      if (!has.has(need)) return;
    }

    const existing = sqlite
      .prepare("SELECT id, status, is_active FROM `users` WHERE email = ?")
      .get(ADMIN_EMAIL) as
      | { id: string; status: string; is_active: number }
      | undefined;

    if (!existing) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 11);
      sqlite
        .prepare(
          "INSERT INTO `users` (id, email, password_hash, name, role, status, is_active) VALUES (?,?,?,?,?,?,?)"
        )
        .run(nanoid(16), ADMIN_EMAIL, hash, ADMIN_NAME, "admin", "approved", 1);
      console.log(`[bootstrap] admin seeded: ${ADMIN_EMAIL}`);
      return;
    }

    // 이미 존재 → 잠겨있으면(가입거부/비활성/대기) 로그인 가능하도록만 해제.
    if (existing.status !== "approved" || existing.is_active !== 1) {
      sqlite
        .prepare(
          "UPDATE `users` SET status = 'approved', is_active = 1, role = 'admin' WHERE id = ?"
        )
        .run(existing.id);
      console.log(`[bootstrap] admin unlocked: ${ADMIN_EMAIL}`);
    }

    if (FORCE_PASSWORD) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 11);
      sqlite
        .prepare("UPDATE `users` SET password_hash = ? WHERE id = ?")
        .run(hash, existing.id);
      console.log(`[bootstrap] admin password reset (forced): ${ADMIN_EMAIL}`);
    }
  } catch (err) {
    // 부팅을 절대 깨지 않는다.
    console.error("[bootstrap] ensureAdminSeed failed:", String(err));
  }
}
