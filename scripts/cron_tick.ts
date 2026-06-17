/**
 * Cron tick — 단발 실행 진입점 (로컬 launchd/cron 또는 외부 cron용):
 *   * /5 * * * *  cd /Users/ideagent/blog_studio && npm run -s cron:tick
 *
 * prod(Railway)에서는 인앱 스케줄러(src/instrumentation.ts)가 동일 로직을
 * 주기 실행한다 — 둘 다 src/lib/cron.ts 의 runCronTick 를 공유한다.
 */
import { runCronTick } from "@/lib/cron";

runCronTick((m) => console.log(m))
  .then((r) =>
    console.log(
      `[cron] done — checked=${r.checked} generated=${r.generated} failed=${r.failed}`
    )
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
