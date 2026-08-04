/**
 * 「베스트 후기 원문」(style_samples) 실생성 검증 — staging 커밋 코드 그대로, 실제 LLM 호출.
 * staging 서버엔 시스템 LLM 키가 없어 서버 생성이 불가하므로 같은 코드를 로컬에서 돌린다.
 * DB는 로컬 blog_studio.db(격리), 발행 없음.
 *
 * 실행: set -a; . ./.env.local; set +a; npx tsx scripts/verify_style_samples_20260804.mts
 *
 * 검증 항목
 *  ① 카테고리 지정 시 프롬프트에 샘플이 실제로 주입되는가 (시스템 프리앰블 실측 덤프)
 *  ② 생성된 초안에 샘플의 내용·고유명사가 새어나오지 않았는가 (누출 스캔)
 *  ③ 샘플 0편(카테고리 미지정) 상태에서 기존과 동일하게 생성되는가 (회귀 검사)
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { buildSystemPreamble, generateDraftFromBrief } from "@/lib/pipeline";
import {
  loadStyleSamples,
  loadStyleMetricsAggregate,
  loadStyleMetricsDirective,
  styleSampleBlock,
} from "@/lib/style-samples";
import { computeStyleMetrics } from "@/lib/style-metrics";
import type { PersonaInput } from "@/lib/llm/prompts";

const ADMIN_ID = "rdCxk9rRFWb2wnJr"; // api_key_mode=system, llm_provider=openai
const OUT = process.env.VERIFY_OUT ?? "/Users/ideagent/blog_studio/output/style_samples_gen";
fs.mkdirSync(OUT, { recursive: true });

const BLOG_ID = "vfy0804_style";

/* ---------------------------------------------------------------------------
   샘플 2편 — 일부러 '이 글에 절대 나오면 안 되는' 고유명사·수치를 잔뜩 박아둔다.
   생성 초안에 아래 LEAK_TOKENS 가 하나라도 나오면 가드 실패다.
   --------------------------------------------------------------------------- */
const SAMPLES = [
  {
    category: "헬스",
    title: "[검증용] 역삼 파워짐 3개월 후기",
    sortOrder: 0,
    body: `회사가 역삼이라 점심시간에 잠깐 다닐 데를 찾다가 파워짐 역삼점에 등록했어요.
여기 스미스머신이 핵스코어라는 브랜드로 4대 있고, 트레드밀은 런마스터로 12대 정도 있더라고요.
근데 12시 반쯤 가면 사람이 진짜 많아요. 벤치 대기 10분씩 걸립니다.
회비는 3개월에 27만원이었고, PT는 10회 66만원으로 안내받았어요.
참고로 락커는 월 1만원 별도입니다. 수건은 무료고요.
아, 그리고 여기 지하 2층에 골든샤워라운지라고 샤워실이 따로 있는데 이건 진짜 좋았어요.
아무튼 시설은 만족하는데 시간대는 잘 골라 가셔야 해요.`,
  },
  {
    category: "헬스",
    title: "[검증용] 노원 머슬스테이션 6개월 다닌 솔직 후기",
    sortOrder: 1,
    body: `노원역 4번 출구에 머슬스테이션이라고 헬스장이 하나 있는데요. 여기 6개월째 다니는 중입니다.
처음엔 그냥 가까워서 갔는데 생각보다 기구가 알차더라고요. 특히 아이언보스 케이블 머신이 2대나 있어요.
근데 에어컨이 좀 약해요. 7월엔 진짜 땀이 줄줄 났습니다.
연간권이 39만원이었고, 헬스복 대여가 하루 2천원이에요.
참고로 관장님이 김성태 관장님이신데 물어보면 다 알려주십니다.
아무튼 가격 대비 만족합니다.`,
  },
];

/** 누출 판정 토큰 — 샘플에만 존재하고 이번 글 주제엔 없어야 하는 고유명사·수치. */
const LEAK_TOKENS = [
  "파워짐",
  "역삼",
  "핵스코어",
  "런마스터",
  "27만원",
  "66만원",
  "골든샤워라운지",
  "머슬스테이션",
  "노원",
  "아이언보스",
  "39만원",
  "김성태",
  "2천원",
];

/* ---------------------------------------------------------------------------
   대상 블로그 — 샘플과 전혀 다른 업체(부천 중동, 시설 목록도 다름)
   --------------------------------------------------------------------------- */
const BLOG = {
  naverBlogId: BLOG_ID,
  displayName: "바디하우스 중동점",
  blogTitle: "부천 중동 바디하우스 운동 기록",
  blogUrl: "https://blog.naver.com/vfy0804_style",
  niche: "헬스장",
};

const PERSONA: Partial<typeof schema.personas.$inferInsert> = {
  purpose: "부천 중동에서 헬스장을 찾는 사람에게 직접 다녀본 경험을 남긴다.",
  audience: "부천 중동·상동 근처 20~30대 직장인",
  brandVoice: "수다스럽고 솔직한 동네 사람 말투",
  pointOfView: "first_person",
  formality: "informal",
  ageGroup: "30s",
  gender: null,
  focusKeywordsJson: JSON.stringify(["중동 헬스장"]),
  forbiddenWordsJson: "[]",
  callsToActionJson: "[]",
  qualityRulesJson: "[]",
  facilitiesJson: JSON.stringify([
    "3층 규모 운동 공간",
    "프리웨이트존",
    "유산소존",
    "그룹 스피닝 클래스",
    "남녀 분리 탈의실",
    "개인 락커",
  ]),
  absentFacilitiesJson: JSON.stringify(["수영장", "사우나", "주차장"]),
  preferredLengthMin: 1400,
  preferredLengthMax: 2000,
  imagesPerPostMin: 2,
  imagesPerPostMax: 5,
};

const TITLE = "중동 헬스장 바디하우스 두 달 다녀본 후기";
const BRIEF =
  "부천 중동에 있는 바디하우스 중동점을 두 달 다녔고 그 경험을 후기로 남깁니다. " +
  "3층 규모라 층마다 존이 나뉘어 있어서 동선이 편했고, 프리웨이트존은 저녁에도 대기가 거의 없었습니다. " +
  "그룹 스피닝 클래스를 두 번 들어봤는데 생각보다 힘들었습니다. 탈의실이 남녀 분리라 편했습니다. " +
  "아쉬운 건 주차장이 없어서 걸어다녔다는 점입니다. " +
  "가격·회비·기구 브랜드는 정확히 모르니 쓰지 마세요. 공백 제외 1400~1800자.";

/* --------------------------------------------------------------------------- */

async function ensureFixture(category: string | null) {
  const existing = await db.query.blogs.findFirst({ where: eq(schema.blogs.id, BLOG_ID) });
  if (!existing) {
    await db.insert(schema.blogs).values({ id: BLOG_ID, ...BLOG, category, status: "active" });
  } else {
    await db.update(schema.blogs).set({ category }).where(eq(schema.blogs.id, BLOG_ID));
  }
  const p = await db.query.personas.findFirst({ where: eq(schema.personas.blogId, BLOG_ID) });
  if (p) {
    await db.update(schema.personas).set(PERSONA).where(eq(schema.personas.id, p.id));
  } else {
    await db
      .insert(schema.personas)
      .values({ blogId: BLOG_ID, isActive: true, ...PERSONA } as typeof schema.personas.$inferInsert);
  }
}

async function ensureSamples() {
  for (const s of SAMPLES) {
    const row = await db.query.styleSamples.findFirst({
      where: and(eq(schema.styleSamples.title, s.title), eq(schema.styleSamples.category, s.category)),
    });
    if (row) {
      await db.update(schema.styleSamples).set(s).where(eq(schema.styleSamples.id, row.id));
    } else {
      await db.insert(schema.styleSamples).values(s);
    }
  }
}

async function personaOf(): Promise<PersonaInput> {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, BLOG_ID),
    with: { personas: true },
  });
  const p = blog!.personas.find((x) => x.isActive)!;
  return {
    blogName: blog!.displayName,
    niche: blog!.niche,
    purpose: p.purpose ?? "",
    audience: p.audience ?? "",
    brandVoice: p.brandVoice ?? "",
    pointOfView: p.pointOfView,
    formality: p.formality,
    ageGroup: p.ageGroup,
    gender: p.gender,
    focusKeywords: JSON.parse(p.focusKeywordsJson || "[]"),
    forbiddenWords: JSON.parse(p.forbiddenWordsJson || "[]"),
    ctas: JSON.parse(p.callsToActionJson || "[]"),
    qualityRules: JSON.parse(p.qualityRulesJson || "[]"),
    facilities: JSON.parse(p.facilitiesJson || "[]"),
    absentFacilities: JSON.parse(p.absentFacilitiesJson || "[]"),
    sampleSnippets: JSON.parse(p.sampleSnippetsJson || "[]"),
    preferredLengthMin: p.preferredLengthMin,
    preferredLengthMax: p.preferredLengthMax,
    imagesPerPostMin: p.imagesPerPostMin,
    imagesPerPostMax: p.imagesPerPostMax,
    emojiIntensity: null,
    category: blog!.category ?? null,
    notes: p.notes,
  };
}

function scanLeaks(body: string): string[] {
  return LEAK_TOKENS.filter((t) => body.includes(t));
}

async function runCase(key: string, category: string | null) {
  console.log(`\n=== [${key}] category=${category ?? "(미지정)"} ===`);
  await ensureFixture(category);

  // ① 실제 시스템 프리앰블(= LLM 에 그대로 가는 문자열) 덤프
  const persona = await personaOf();
  const preamble = await buildSystemPreamble(persona);
  fs.writeFileSync(path.join(OUT, `${key}.preamble.txt`), preamble);
  const loaded = await loadStyleSamples(persona.category);
  const directive = loaded.length ? await loadStyleMetricsDirective(persona.category) : "";
  const block = styleSampleBlock(loaded, directive);
  const injected = block.length > 0 && preamble.includes(block);
  const directiveInjected = directive.length > 0 && preamble.includes(directive);
  fs.writeFileSync(path.join(OUT, `${key}.directive.txt`), directive || "(없음)");
  console.log(
    `  프리앰블 ${preamble.length}자 · 샘플 ${loaded.length}편 · 원문주입=${injected ? "O" : "X"} · 지표지시문=${directiveInjected ? "O" : "X"}`
  );

  // ② 실제 초안 생성
  const [ph] = await db
    .insert(schema.drafts)
    .values({ blogId: BLOG_ID, title: TITLE, status: "draft" })
    .returning();
  await generateDraftFromBrief({
    blogId: BLOG_ID,
    callerUserId: ADMIN_ID,
    title: TITLE,
    brief: BRIEF,
    keywords: ["중동 헬스장"],
    photoMode: "auto",
    existingDraftId: ph.id,
  });
  const row = await db.query.drafts.findFirst({ where: eq(schema.drafts.id, ph.id) });
  const body = row?.bodyMd ?? "";
  const leaks = scanLeaks(body);
  const draftM = computeStyleMetrics(body);
  const agg = await loadStyleMetricsAggregate(persona.category);

  const meta = {
    key,
    category,
    draftId: ph.id,
    status: row?.status,
    title: row?.title,
    charsNoSpace: body.replace(/\s/g, "").length,
    samplesLoaded: loaded.length,
    sampleBlockChars: block.length,
    sampleBlockInjected: injected,
    /* --- 문체 지표 --- */
    directiveChars: directive.length,
    directiveInjected,
    targetMetrics: agg
      ? {
          avgSentenceChars: agg.avgSentenceChars,
          avgSentencesPerParagraph: agg.avgSentencesPerParagraph,
          topEndings: agg.topEndings.slice(0, 3).map((e) => `${e.label} ${e.ratio}%`),
          introTop: agg.introDistribution[0]?.type ?? null,
        }
      : null,
    // 목표를 실제로 따라갔는지 — 생성된 초안을 같은 자로 재서 비교한다.
    draftMetrics: {
      avgSentenceChars: draftM.avgSentenceChars,
      avgSentencesPerParagraph: draftM.avgSentencesPerParagraph,
      topEndings: draftM.endings.slice(0, 3).map((e) => `${e.label} ${e.ratio}%`),
      introType: draftM.introType,
      fillerPer1000: draftM.fillerPer1000,
      formalPer1000: draftM.formal.per1000,
    },
    sentenceLenGap: agg ? Math.round(Math.abs(draftM.avgSentenceChars - agg.avgSentenceChars) * 10) / 10 : null,
    leakedTokens: leaks,
    leakVerdict: leaks.length === 0 ? "✅ 유출 없음" : `❌ 유출 ${leaks.length}건`,
    seoScore: row?.seoScore,
    humanScore: row?.humanScore,
    llmModel: row?.llmModel,
  };
  fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(OUT, `${key}.md`), body);
  console.log(JSON.stringify(meta, null, 2));
  return meta;
}

await ensureSamples();

const withSamples = await runCase("A_with_samples", "헬스");
const without = await runCase("B_no_samples", null); // 회귀: 카테고리 미지정 = 기존 동작

const summary = {
  "①원문 주입": withSamples.sampleBlockInjected ? "✅ 주입됨" : "❌ 미주입",
  "②지표 지시문 주입": withSamples.directiveInjected
    ? `✅ 주입됨 (${withSamples.directiveChars}자)`
    : "❌ 미주입",
  "③내용 유출": withSamples.leakVerdict,
  "④문체 추종(문장 평균 길이 차)":
    withSamples.sentenceLenGap === null
      ? "—"
      : `목표 ${withSamples.targetMetrics?.avgSentenceChars}자 vs 실제 ${withSamples.draftMetrics.avgSentenceChars}자 (차 ${withSamples.sentenceLenGap}자)`,
  "⑤회귀(샘플 0편)":
    without.sampleBlockChars === 0 &&
    without.directiveChars === 0 &&
    without.status === "ready_for_review"
      ? "✅ 블록·지시문 없음 + 정상 생성"
      : `⚠️ blockChars=${without.sampleBlockChars} directiveChars=${without.directiveChars} status=${without.status}`,
};
fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify({ summary, withSamples, without }, null, 2));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
