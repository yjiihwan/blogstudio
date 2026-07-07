// 가벼운 헬스체크 — DB·인증을 건드리지 않고 서버 생존만 확인한다.
// Railway healthcheck 대상. 앱이 떠 있으면 무조건 200.
// 환경 격리/발행모드 검증용으로 env·publish·commit 도 함께 노출한다(비밀 아님).
import { blogEnv, publishModeLabel } from "@/lib/publish/mode";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    env: blogEnv(),
    publish: publishModeLabel(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
  });
}
