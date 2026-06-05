// 가벼운 헬스체크 — DB·인증을 건드리지 않고 서버 생존만 확인한다.
// Railway healthcheck 대상. 앱이 떠 있으면 무조건 200.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
