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

  // 3) admin 계정 부트스트랩(멱등·비파괴). 없으면 생성, 잠겨있으면 해제.
  try {
    const { rawSqlite } = await import("@/db/client");
    const { ensureAdminSeed } = await import("@/db/bootstrap");
    ensureAdminSeed(rawSqlite);
    console.log("[instrumentation] admin bootstrap ok");
  } catch (err) {
    console.error("[instrumentation] admin bootstrap FAILED:", String(err));
  }

  // 4) 인앱 스케줄러 — 예약 자동 글 생성(cron_tick)을 주기 실행.
  //    WHY: prod(Railway)는 외부 cron이 없고, DB가 볼륨 SQLite라 별도 cron 서비스가
  //    같은 DB에 못 붙는다. 그래서 항상 떠 있는 이 웹 서비스 안에서 타이머로 직접 돈다.
  //    CRON_IN_APP=0 으로 비활성화, CRON_TICK_MS 로 주기 조정(기본 5분).
  startInAppScheduler();
}

// 중복 타이머 방지(HMR·다중 register 호출 대비). 인스턴스 1개 가정.
const SCHED_FLAG = "__blogstudio_cron_started__";
let cronRunning = false;

function startInAppScheduler() {
  if (process.env.CRON_IN_APP === "0") {
    console.log("[scheduler] disabled (CRON_IN_APP=0)");
    return;
  }
  const g = globalThis as unknown as Record<string, boolean>;
  if (g[SCHED_FLAG]) return; // 이미 등록됨
  g[SCHED_FLAG] = true;

  const intervalMs = Math.max(60_000, parseInt(process.env.CRON_TICK_MS || "300000", 10));

  const tick = async () => {
    if (cronRunning) return; // 이전 틱이 아직 도는 중이면 건너뜀(중첩 방지)
    cronRunning = true;
    try {
      const { runCronTick } = await import("@/lib/cron");
      const r = await runCronTick();
      if (r.generated || r.failed) {
        console.log(
          `[scheduler] tick — checked=${r.checked} generated=${r.generated} failed=${r.failed}`
        );
      }
    } catch (err) {
      console.error("[scheduler] tick FAILED:", String(err));
    } finally {
      cronRunning = false;
    }
  };

  // 부팅 직후 30초 뒤 첫 틱(기동 블로킹 회피), 이후 주기 실행.
  setTimeout(tick, 30_000);
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[scheduler] in-app cron started — every ${Math.round(intervalMs / 1000)}s`);
}
