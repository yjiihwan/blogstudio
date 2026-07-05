/**
 * 필수 검증: 헬스장 외 업종(식당·학원) 실 LLM 완전자동 생성으로 거짓말 방지 '완전 차단' 확인.
 * absentFacilities 를 비워 둔 페르소나로 돌려 ①범용 하드필터 ②사실검증 게이트가
 * 헬스장 데이터 없이도 동작함을 증명한다.
 *
 *  A. E2E: 식당·학원 각 2회 완전자동 생성 → 최종 본문에 근거 없는 시설·가격·수치·실적이 새는가(fabHits),
 *          게이트가 잡아 seoIssues에 남기는가, 정상 내용은 유지되는가(과잉삭제 아님).
 *  B. 게이트 효능(직접): 날조가 가득한 본문을 factGuardPrompt로 통과시켜 실제로 걷어내는가,
 *          근거 있는 깨끗한 본문은 보존하는가(오탐 없음).
 *
 * 실행: cp blog_studio.db /tmp/factguard_e2e.db
 *       DATABASE_URL=/tmp/factguard_e2e.db npx tsx scripts/factguard_e2e.mts
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { generateDraftForBlog } from "@/lib/pipeline";
import { llm } from "@/lib/llm";
import {
  buildGroundingText,
  findFabricationHits,
  factGuardPrompt,
  type PersonaInput,
} from "@/lib/llm/prompts";

const noWs = (s: string) => s.replace(/\s+/g, "").length;

type Seed = {
  blogId: string;
  name: string;
  niche: string;
  persona: {
    purpose: string;
    audience: string;
    brandVoice: string;
    focusKeywords: string[];
    facilities: string[];
    absentFacilities: string[]; // 의도적으로 [] — 범용 동작 증명
    notes: string;
  };
  positiveHints: string[]; // 정상 생성(과잉삭제 아님) 확인용
};

const SEEDS: Seed[] = [
  {
    blogId: "fg_rest_midam",
    name: "미담한상",
    niche: "한정식 맛집",
    persona: {
      purpose: "동네 한정식집을 검색하는 사람에게 실제 방문 경험을 전한다",
      audience: "가족 외식·모임 장소를 찾는 30~50대",
      brandVoice: "담백하고 정직한 후기 톤",
      focusKeywords: ["강남 한정식", "가족모임 맛집", "한정식 코스"],
      facilities: ["제철 한정식 코스", "점심 특선 정식", "단체 예약"],
      absentFacilities: [], // 없는 것 미입력 — 범용 게이트가 알아서 막아야 함
      notes: "실제 확정 정보는 위 코스·특선·단체예약뿐. 가격/수상/연혁/주차 여부는 확정된 바 없음.",
    },
    positiveHints: ["한정식", "코스", "정식", "미담한상", "식사", "메뉴"],
  },
  {
    blogId: "fg_edu_myungjin",
    name: "명진영어학원",
    niche: "초등 영어학원",
    persona: {
      purpose: "동네 초등 영어학원을 알아보는 학부모에게 정보를 전한다",
      audience: "초등 자녀를 둔 30~40대 학부모",
      brandVoice: "차분하고 신뢰감 있는 안내 톤",
      focusKeywords: ["분당 초등영어", "파닉스 학원", "초등 영어회화"],
      facilities: ["파닉스반", "초등 회화반", "레벨 테스트"],
      absentFacilities: [], // 없는 것 미입력
      notes: "확정 정보는 위 반 구성·레벨테스트뿐. 합격률/수강료/전통/강사 이력은 확정된 바 없음.",
    },
    positiveHints: ["영어", "파닉스", "회화", "학원", "명진", "수업", "레벨"],
  },
];

async function adminId() {
  const u = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  if (!u) throw new Error("admin 없음");
  if (u.apiKeyMode !== "system")
    await db.update(schema.users).set({ apiKeyMode: "system" }).where(eq(schema.users.id, u.id));
  return u.id;
}

async function seedBlog(s: Seed) {
  const existing = await db.query.blogs.findFirst({ where: eq(schema.blogs.id, s.blogId) });
  if (!existing) {
    await db.insert(schema.blogs).values({
      id: s.blogId,
      naverBlogId: s.blogId,
      displayName: s.name,
      niche: s.niche,
      status: "active",
    });
  }
  await db.delete(schema.personas).where(eq(schema.personas.blogId, s.blogId));
  await db.insert(schema.personas).values({
    blogId: s.blogId,
    isActive: true,
    purpose: s.persona.purpose,
    audience: s.persona.audience,
    brandVoice: s.persona.brandVoice,
    pointOfView: "first_person",
    formality: "neutral",
    focusKeywordsJson: JSON.stringify(s.persona.focusKeywords),
    facilitiesJson: JSON.stringify(s.persona.facilities),
    absentFacilitiesJson: JSON.stringify(s.persona.absentFacilities),
    preferredLengthMin: 1200,
    preferredLengthMax: 1800,
    imagesPerPostMin: 2,
    imagesPerPostMax: 4,
    notes: s.persona.notes,
  });
}

function personaInputOf(s: Seed): PersonaInput {
  return {
    blogName: s.name,
    niche: s.niche,
    purpose: s.persona.purpose,
    audience: s.persona.audience,
    brandVoice: s.persona.brandVoice,
    pointOfView: "first_person",
    formality: "neutral",
    ageGroup: null,
    gender: null,
    focusKeywords: s.persona.focusKeywords,
    forbiddenWords: [],
    ctas: [],
    qualityRules: [],
    facilities: s.persona.facilities,
    absentFacilities: s.persona.absentFacilities,
    sampleSnippets: [],
    preferredLengthMin: 1200,
    preferredLengthMax: 1800,
    imagesPerPostMin: 2,
    imagesPerPostMax: 4,
    notes: s.persona.notes,
  };
}

let pass = 0;
let fail = 0;
const mark = (c: boolean) => {
  if (c) pass++;
  else fail++;
  return c ? "✅" : "❌";
};

async function runE2E(admin: string) {
  console.log("\n########## A. E2E — 식당·학원 실 LLM 완전자동 생성 ##########");
  for (const s of SEEDS) {
    await seedBlog(s);
    const grounding = buildGroundingText(personaInputOf(s));
    console.log(`\n===== [${s.name} · ${s.niche}] absent=[] (범용 게이트만 의존) =====`);
    for (let i = 1; i <= 2; i++) {
      const d = await generateDraftForBlog(s.blogId, admin);
      const hay = `${d.title}\n${d.bodyMd}`;
      const fab = findFabricationHits(hay, grounding, s.persona.absentFacilities);
      const issues: string[] = JSON.parse(d.seoIssuesJson || "[]");
      const guardFlag = issues.find((x) => x.includes("사실검증"));
      const residFlag = issues.find((x) => x.includes("미검증 주장 잔존"));
      const pos = s.positiveHints.some((k) => hay.toLowerCase().includes(k.toLowerCase()));
      const model = d.llmModel ?? "";
      console.log(`\n[run ${i}] model=${model}`);
      console.log(`  제목: ${d.title}`);
      console.log(`  글자수(공백제외): ${noWs(d.bodyMd)}`);
      console.log(
        `  ${mark(fab.length === 0)} (a) 최종본문 근거없는 주장 누출: ${
          fab.length ? "❌ " + fab.map((h) => `${h.kind}:${h.match}`).join(", ") : "0건"
        }`
      );
      console.log(`  (b) 게이트 흔적: ${guardFlag ?? "(제거 0건)"}${residFlag ? " | " + residFlag : ""}`);
      console.log(`  ${mark(pos)} 정상 생성(과잉삭제 아님, 핵심어 존재)`);
      console.log(`  ${mark(model !== "mock")} 실 LLM(mock 아님)`);
    }
  }
}

async function runGateEfficacy() {
  console.log("\n########## B. 게이트 효능(직접) — 날조 본문 vs 깨끗한 본문 ##########");
  const grounding = buildGroundingText({
    blogName: "미담한상",
    niche: "한정식 맛집",
    purpose: "한정식 후기",
    audience: "가족",
    brandVoice: "담백",
    pointOfView: "first_person",
    formality: "neutral",
    ageGroup: null,
    gender: null,
    focusKeywords: ["강남 한정식"],
    forbiddenWords: [],
    ctas: [],
    qualityRules: [],
    facilities: ["제철 한정식 코스", "점심 특선 정식", "단체 예약"],
    absentFacilities: [],
    sampleSnippets: [],
    preferredLengthMin: 1200,
    preferredLengthMax: 1800,
    imagesPerPostMin: 2,
    imagesPerPostMax: 4,
    notes: null,
  });

  // 날조 가득 — grounding에 없는 가격·수상·연혁·규모·%가 곳곳에 박힘.
  const dirty = [
    "## 미담한상 첫 방문",
    "미담한상은 무려 25년 전통의 한정식집으로, 미쉐린 가이드에도 선정된 곳입니다.",
    "<!-- IMG:slot=0 -->",
    "런치 코스가 39,000원인데 재방문율이 97%에 달할 만큼 만족도가 높습니다.",
    "현재 강남 일대에만 4호점을 운영 중이고, 네이버 후기도 1,200개가 넘습니다.",
    "## 분위기",
    "창가 자리에 앉으니 햇살이 은은하게 들어와 편안했습니다. 반찬 하나하나 정갈했어요.",
    "<!-- IMG:slot=1 -->",
  ].join("\n\n");

  // 깨끗 — 확정 사실 + 감각 묘사만. 근거 없는 구체 주장 없음.
  const clean = [
    "## 미담한상 점심 특선",
    "점심 특선 정식을 먹으러 미담한상에 다녀왔습니다. 제철 재료로 차린 한정식 코스가 정갈했어요.",
    "<!-- IMG:slot=0 -->",
    "창가에 앉아 반찬을 하나씩 맛보니 간이 세지 않아 편했습니다. 단체 예약도 가능하다고 하네요.",
    "<!-- IMG:slot=1 -->",
    "정확한 가격·구성은 방문 시 확인하시길 권합니다.",
  ].join("\n\n");

  const runGuard = async (bodyMd: string) => {
    const res = await llm({
      messages: [{ role: "user", content: factGuardPrompt({ groundingText: grounding, title: "미담한상 후기", bodyMd }) }],
      maxTokens: 4000,
    });
    const parsed = JSON.parse(
      res.text.trim().replace(/^```(?:json|markdown)?/i, "").replace(/```\s*$/i, "").trim()
    ) as { removed?: string[]; bodyMd?: string };
    return { removed: parsed.removed ?? [], bodyMd: parsed.bodyMd ?? bodyMd, model: res.model };
  };

  console.log("\n--- B-1. 날조 본문 ---");
  const before = findFabricationHits(dirty, grounding);
  const g1 = await runGuard(dirty);
  const after = findFabricationHits(g1.bodyMd, grounding);
  const imgsOk = (g1.bodyMd.match(/<!--\s*IMG:slot=\d+\s*-->/g) || []).length === 2;
  console.log(`  model=${g1.model}`);
  console.log(`  게이트 전 fabHits: ${before.length}건 [${before.map((h) => h.match).join(", ")}]`);
  console.log(`  게이트 후 fabHits: ${after.length}건 [${after.map((h) => h.match).join(", ")}]`);
  console.log(`  removed(LLM 보고): ${g1.removed.length}건 — ${g1.removed.slice(0, 6).join(" / ")}`);
  console.log(`  ${mark(g1.removed.length > 0)} LLM이 날조를 걷어냈다고 보고`);
  console.log(`  ${mark(after.length < before.length)} 게이트 후 근거없는 주장 감소(${before.length}→${after.length})`);
  console.log(`  ${mark(after.length === 0)} 게이트 후 잔존 0건(완전 차단)`);
  console.log(`  ${mark(imgsOk)} 이미지 마커 보존`);

  console.log("\n--- B-2. 깨끗한 본문(오탐 없어야) ---");
  const cleanBefore = findFabricationHits(clean, grounding);
  const g2 = await runGuard(clean);
  const cleanChars = noWs(clean);
  const outChars = noWs(g2.bodyMd);
  console.log(`  게이트 전 fabHits: ${cleanBefore.length}건`);
  console.log(`  removed(LLM 보고): ${g2.removed.length}건`);
  console.log(`  글자수 ${cleanChars}→${outChars} (보존율 ${Math.round((outChars / cleanChars) * 100)}%)`);
  console.log(`  ${mark(g2.removed.length === 0)} 깨끗한 본문은 제거 0건(오탐 없음)`);
  console.log(`  ${mark(outChars >= cleanChars * 0.7)} 정상 내용 보존(과잉삭제 아님)`);
}

async function main() {
  console.log("[factguard_e2e] DB:", process.env.DATABASE_URL);
  const admin = await adminId();
  await runE2E(admin);
  await runGateEfficacy();
  console.log(`\n================ 종합: ${pass} pass / ${fail} fail ================`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
