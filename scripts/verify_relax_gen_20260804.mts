/**
 * 완화 작업(2026-08-04) 실생성 검증 — staging 브랜치 코드(e3ba2dc) 그대로, 실제 LLM 호출.
 * staging 서버에는 시스템 LLM 키가 없어 서버에서 생성이 불가하므로, 같은 커밋의 코드를
 * 로컬에서 돌려 실제 초안 3편을 만든다. DB는 로컬 blog_studio.db(격리), 발행 없음.
 *
 * 실행: set -a; . ./.env.local; set +a; npx tsx scripts/verify_relax_gen_20260804.mts
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { generateDraftFromBrief } from "@/lib/pipeline";
import { countSlotPlaceholders } from "@/lib/llm/prompts";

const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // api_key_mode=system, llm_provider=openai
const OUT = process.env.VERIFY_OUT ?? "/tmp/verify_relax_20260804";
fs.mkdirSync(OUT, { recursive: true });

type Case = {
  key: string;
  blogId: string;
  blog: { naverBlogId: string; displayName: string; blogTitle: string; blogUrl: string; niche: string };
  persona: Partial<typeof schema.personas.$inferInsert>;
  title: string;
  brief: string;
  keywords: string[];
};

const CASES: Case[] = [
  {
    key: "A_pilates_review",
    blogId: "vfy0804_pilates",
    blog: {
      naverBlogId: "vfy0804_pilates",
      displayName: "성수 필라테스 다녀온 기록",
      blogTitle: "성수동 사는 직장인의 운동 기록",
      blogUrl: "https://blog.naver.com/vfy0804_pilates",
      niche: "필라테스·운동",
    },
    persona: {
      purpose: "성수동 필라테스 센터를 직접 다녀본 경험을 후기로 남겨 비슷한 고민을 하는 사람에게 참고가 되게 한다.",
      audience: "성수·건대 근처에 사는 20~30대 직장인, 필라테스 처음 등록하려는 사람",
      brandVoice: "수다스럽고 솔직한 동네 사람 말투",
      pointOfView: "first_person",
      formality: "informal",
      ageGroup: "30s",
      gender: "female",
      focusKeywordsJson: JSON.stringify(["성수 필라테스", "성수동 필라테스 후기"]),
      facilitiesJson: JSON.stringify([
        "리포머 6대",
        "캐딜락 1대",
        "체어 2대",
        "그룹 수업 정원 6명",
        "1:1 개인레슨",
        "샤워실 2칸",
        "탈의실·개인 락커",
      ]),
      absentFacilitiesJson: JSON.stringify(["수영장", "사우나", "주차장"]),
      preferredLengthMin: 1500,
      preferredLengthMax: 2200,
      imagesPerPostMin: 2,
      imagesPerPostMax: 6,
    },
    title: "성수 필라테스 3개월 다녀온 후기",
    brief:
      "성수동에 있는 필라테스 센터를 3개월 다녔고 그 경험을 후기로 남깁니다. 회사가 성수라 퇴근하고 주 2회 그룹 수업을 들었습니다. " +
      "그룹 수업 정원이 6명이라 강사가 자세를 하나하나 봐줬고, 리포머는 6대라 대기 없이 썼습니다. " +
      "처음엔 동작 이름을 하나도 못 알아들어서 옆사람 따라 했습니다. 저녁 7시 타임은 사람이 몰려서 원하는 자리 잡기가 어려웠습니다. " +
      "샤워실이 2칸뿐이라 수업 끝나고 줄을 서야 했던 건 아쉬웠습니다. 주차장은 없어서 지하철로 다녔습니다. " +
      "가격은 공개하지 말고(정확히 모름) 확인 안 되는 수치는 쓰지 마세요. 공백 제외 1600~2000자.",
    keywords: ["성수 필라테스", "성수동 필라테스 후기", "직장인 운동"],
  },
  {
    key: "B_cafe_review",
    blogId: "vfy0804_cafe",
    blog: {
      naverBlogId: "vfy0804_cafe",
      displayName: "동네 카페 도장깨기",
      blogTitle: "걸어서 갈 수 있는 카페만 씁니다",
      blogUrl: "https://blog.naver.com/vfy0804_cafe",
      niche: "카페·디저트",
    },
    persona: {
      purpose: "집 근처 카페를 직접 가보고 짧게 기록한다. 광고 아님.",
      audience: "망원·합정 근처에서 작업할 카페를 찾는 사람",
      brandVoice: "짧고 담백하게, 군말 섞어서",
      pointOfView: "first_person",
      formality: "informal",
      ageGroup: "30s",
      focusKeywordsJson: JSON.stringify(["망원동 카페", "망원 카공"]),
      // 재료를 일부러 적게 준다 — '재료 부족하면 묘사로 늘리지 말고 짧게 끝내라'가 지켜지는지 확인용
      facilitiesJson: JSON.stringify(["2인석 4개", "콘센트 자리 2개"]),
      absentFacilitiesJson: JSON.stringify(["단체석", "주차장", "루프탑"]),
      preferredLengthMin: 800,
      preferredLengthMax: 1400,
      imagesPerPostMin: 1,
      imagesPerPostMax: 4,
    },
    title: "망원동 작은 카페 다녀왔어요",
    brief:
      "망원동 골목에 있는 작은 카페에 평일 오후에 혼자 다녀왔습니다. 자리는 2인석 4개가 전부라 좁고, 콘센트 있는 자리는 2개뿐입니다. " +
      "아메리카노 한 잔 마시면서 한 시간쯤 있었습니다. 단체석·주차장·루프탑은 없습니다. " +
      "메뉴 가격, 원두 종류, 사장님 이력 같은 건 제가 확인 못 했으니 절대 지어내지 마세요. " +
      "아는 내용이 이게 전부라 짧아도 괜찮습니다. 공백 제외 800~1200자.",
    keywords: ["망원동 카페", "망원 카공", "혼자 카페"],
  },
  {
    key: "C_autoshop_info",
    blogId: "vfy0804_autoshop",
    blog: {
      naverBlogId: "vfy0804_autoshop",
      displayName: "한빛 자동차정비 블로그",
      blogTitle: "한빛 자동차정비 — 정비사가 쓰는 자동차 이야기",
      blogUrl: "https://blog.naver.com/vfy0804_autoshop",
      niche: "자동차 정비",
    },
    persona: {
      purpose: "정비 상식을 알려주고 필요할 때 우리 공업사를 떠올리게 한다.",
      audience: "차를 10년 넘게 탔지만 정비는 잘 모르는 30~50대 운전자",
      brandVoice: "차분하고 근거 있게, 겁주지 않기",
      pointOfView: "expert",
      formality: "neutral",
      ageGroup: "40s",
      focusKeywordsJson: JSON.stringify(["타이어 교체 시기", "타이어 마모한계"]),
      facilitiesJson: JSON.stringify([
        "휠얼라인먼트 장비",
        "타이어 탈부착기",
        "리프트 3기",
        "예약제 운영",
      ]),
      absentFacilitiesJson: JSON.stringify(["도색·판금", "수입차 전문 진단기"]),
      preferredLengthMin: 1400,
      preferredLengthMax: 2000,
      imagesPerPostMin: 1,
      imagesPerPostMax: 5,
    },
    title: "타이어, 언제 갈아야 하나요 — 정비사가 보는 기준",
    brief:
      "타이어 교체 시기를 판단하는 기준을 설명하는 정보글입니다. 마모한계선(트레드 웨어 인디케이터) 확인법, " +
      "옆면 갈라짐(크랙), 제조 주차(DOT 4자리) 보는 법, 편마모가 생기면 얼라인먼트를 함께 봐야 한다는 점을 다룹니다. " +
      "우리 공업사는 얼라인먼트 장비와 리프트 3기가 있고 예약제로 운영합니다. 도색·판금과 수입차 전용 진단기는 없습니다. " +
      "타이어 가격·할인율·수명 개월수 같은 확인 불가한 수치는 쓰지 마세요. '요즘 안전이 중요합니다' 같은 뻔한 일반론으로 " +
      "채우지 말고 실제로 확인하는 방법 위주로 쓰세요. 공백 제외 1400~1800자.",
    keywords: ["타이어 교체 시기", "타이어 마모한계선", "편마모"],
  },
];

async function ensureFixture(c: Case) {
  const existing = await db.query.blogs.findFirst({ where: eq(schema.blogs.id, c.blogId) });
  if (!existing) {
    await db.insert(schema.blogs).values({ id: c.blogId, ...c.blog, status: "active" });
  }
  const p = await db.query.personas.findFirst({ where: eq(schema.personas.blogId, c.blogId) });
  if (p) {
    await db.update(schema.personas).set(c.persona).where(eq(schema.personas.id, p.id));
  } else {
    await db.insert(schema.personas).values({ blogId: c.blogId, isActive: true, ...c.persona } as typeof schema.personas.$inferInsert);
  }
}

const only = process.argv[2];
const started = Date.now();

for (const c of CASES) {
  if (only && only !== c.key) continue;
  console.log(`\n=== [${c.key}] 생성 시작 — ${c.title}`);
  const t0 = Date.now();
  await ensureFixture(c);
  const [placeholder] = await db
    .insert(schema.drafts)
    .values({ blogId: c.blogId, title: c.title, status: "draft" })
    .returning();
  try {
    await generateDraftFromBrief({
      blogId: c.blogId,
      callerUserId: ADMIN_ID,
      title: c.title,
      brief: c.brief,
      keywords: c.keywords,
      photoMode: "auto",
      existingDraftId: placeholder.id,
    });
  } catch (err) {
    console.error(`[${c.key}] 생성 실패:`, err);
    fs.writeFileSync(path.join(OUT, `${c.key}.ERROR.txt`), String((err as Error)?.stack ?? err));
    continue;
  }
  const row = await db.query.drafts.findFirst({ where: eq(schema.drafts.id, placeholder.id) });
  const body = row?.bodyMd ?? "";
  const noSpace = body.replace(/\s/g, "").length;
  const imgMarkers = (body.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length;
  const heads = (body.match(/^#{2,3} .+$/gm) || []).map((h) => h.trim());
  const meta = {
    key: c.key,
    draftId: placeholder.id,
    title: row?.title,
    status: row?.status,
    seoScore: row?.seoScore,
    humanScore: row?.humanScore,
    seoIssues: JSON.parse(row?.seoIssuesJson || "[]"),
    llmModel: row?.llmModel,
    costCents: row?.llmCostCents,
    charsNoSpace: noSpace,
    slotPlaceholders: countSlotPlaceholders(body),
    imgMarkers,
    headings: heads,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(path.join(OUT, `${c.key}.json`), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(OUT, `${c.key}.md`), body);
  console.log(JSON.stringify(meta, null, 2));
}

console.log(`\n총 소요 ${Math.round((Date.now() - started) / 1000)}s · 출력 ${OUT}`);
process.exit(0);
