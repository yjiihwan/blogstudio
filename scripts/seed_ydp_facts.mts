/** 1회성: 영등포점 페르소나에 시설 팩트 시딩. DATABASE_URL=./blog_studio.db npx tsx scripts/seed_ydp_facts.mts */
import { db, schema } from "@/db/client";
import { eq, like } from "drizzle-orm";

const FAC = ["웨이트 트레이닝존", "머신·프리웨이트", "유산소 존", "그룹운동(GX)", "1:1 퍼스널 트레이닝(PT)", "샤워실·탈의실"];
const ABS = ["수영", "사우나", "스파", "골프", "찜질방", "테니스"];

const blogs = await db.query.blogs.findMany({ where: like(schema.blogs.displayName, "%영등포%") });
for (const b of blogs) {
  const p = await db.query.personas.findFirst({ where: eq(schema.personas.blogId, b.id) });
  if (!p) { console.log("no persona:", b.displayName); continue; }
  await db.update(schema.personas)
    .set({ facilitiesJson: JSON.stringify(FAC), absentFacilitiesJson: JSON.stringify(ABS) })
    .where(eq(schema.personas.id, p.id));
  console.log("seeded:", b.id, b.displayName);
}
process.exit(0);
