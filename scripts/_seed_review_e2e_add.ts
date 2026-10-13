/* E2E 보조 — 거절 흐름용 제안 1건 추가(테스트 DB 전용). BLOG_ID·PERSONA_ID·DRAFT_ID 환경변수 */
import { db, schema } from "../src/db/client";
import { eq } from "drizzle-orm";
import { recordSettingIssues } from "../src/lib/proposals";
async function main() {
  const admin = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  const r = await recordSettingIssues({
    blogId: process.env.BLOG_ID!, personaId: process.env.PERSONA_ID!, blogName: "E2E 검수개편 테스트 블로그", ownerId: admin!.id, callerUserId: admin!.id, draftId: process.env.DRAFT_ID!,
    issues: [{ target: "persona", field: "audience", problem: "타겟 독자가 «30대 직장인»으로만 적혀 있어 글마다 퇴근 후 저녁 운동 장면만 반복됩니다. 실제 글 소재(주말 오전·학생)는 설정과 어긋납니다.", proposed_change: { before: "30대 직장인", after: "30대 직장인 + 주말 오전 이용 대학생" }, confidence: "high", systemic: true }],
  });
  console.log(JSON.stringify(r));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
