import { db, schema } from "./client";
import { hashPassword } from "@/lib/auth/passwords";

async function main() {
  // 파괴적 시드 가드 — prod 실데이터를 staging 시드가 덮어쓰지 못하게 한다(Sally SKIP_SEED 동형).
  // 이 스크립트는 전 테이블 DELETE 후 재삽입하므로, prod/SKIP_SEED 환경에선 즉시 중단한다.
  const skip = (process.env.BLOG_STUDIO_SKIP_SEED ?? "").trim();
  const envName = (process.env.BLOG_STUDIO_ENV ?? "").trim().toLowerCase();
  if (skip === "1" || skip.toLowerCase() === "true") {
    throw new Error(
      "BLOG_STUDIO_SKIP_SEED 설정됨 — 파괴적 시드를 거부합니다(실데이터 보호). 시드하려면 플래그를 해제하세요."
    );
  }
  if (envName === "prod" || envName === "production") {
    throw new Error(
      "BLOG_STUDIO_ENV=prod — 프로덕션에서는 파괴적 시드를 실행하지 않습니다(실데이터 보호)."
    );
  }
  console.log("Seeding blog_studio…");

  await db.delete(schema.notifications);
  await db.delete(schema.rankingSnapshots);
  await db.delete(schema.publishes);
  await db.delete(schema.approvals);
  await db.delete(schema.imageRequests);
  await db.delete(schema.images);
  await db.delete(schema.draftVersions);
  await db.delete(schema.drafts);
  await db.delete(schema.topicCandidates);
  await db.delete(schema.schedules);
  await db.delete(schema.personas);
  await db.delete(schema.blogs);
  await db.delete(schema.users);
  await db.delete(schema.settings);

  await db.insert(schema.users).values({
    email: "admin@blogstudio.local",
    passwordHash: await hashPassword("studio1234!"),
    name: "스튜디오 관리자",
    role: "admin",
    status: "approved",
  });

  // Sample blog 1 — 맛집 리뷰
  const [blogFood] = await db
    .insert(schema.blogs)
    .values({
      naverBlogId: "grillbox_official",
      displayName: "그릴박스 본사 블로그",
      blogTitle: "그릴박스 한그릇 — 매일 굽는 이야기",
      blogUrl: "https://blog.naver.com/grillbox_official",
      niche: "음식점·F&B",
      status: "active",
    })
    .returning();

  await db.insert(schema.personas).values({
    blogId: blogFood.id,
    purpose: "그릴박스 한그릇 메뉴와 매장 경험을 자연스럽게 알리고, 매장 방문 유입을 만든다.",
    audience: "20~40대 직장인, 강남·홍대·잠실 등 오피스 상권 점심·저녁 식사 후보를 찾는 사람",
    brandVoice: "친근한 동료가 이야기해주듯 - 과장 없이 솔직, 음식 정보는 정확하게, 가게 자랑은 살짝만",
    pointOfView: "first_person",
    formality: "neutral",
    coreTopicsJson: JSON.stringify([
      { topic: "신메뉴/시즌메뉴 리뷰", weight: 3 },
      { topic: "매장별 분위기·접근성", weight: 2 },
      { topic: "혼밥/회식 활용 팁", weight: 2 },
      { topic: "재료·조리법 비하인드", weight: 1 },
    ]),
    focusKeywordsJson: JSON.stringify([
      "강남 점심", "직화구이 한그릇", "혼밥 메뉴", "회식 장소 추천",
    ]),
    forbiddenWordsJson: JSON.stringify([
      "최고", "최저가", "100%", "무조건", "유일한", "특가",
    ]),
    callsToActionJson: JSON.stringify([
      "예약·매장 위치는 그릴박스 홈페이지에서 확인하세요.",
      "이번 주 매장 추천 메뉴도 인스타에 매일 올라옵니다.",
    ]),
    sampleSnippetsJson: JSON.stringify([
      "지난주 강남점 들렀다가 새로 나온 양념을 먹어봤어요. 매콤한데 끝맛이 깔끔해서…",
    ]),
    qualityRulesJson: JSON.stringify([
      "1인칭 화법으로 실제 경험담 형식 유지",
      "가격 정보는 변동 가능성 언급 ('방문 시 기준')",
      "사진 캡션은 짧고 구체적으로",
      "본문 중간 H2는 2~3개, H3은 0~1개",
      "이모지 본문 1개 이내",
    ]),
    notes: "리뷰성 글은 직접 촬영 사진 비중 70% 이상 권장",
  });

  await db.insert(schema.schedules).values({
    blogId: blogFood.id,
    cron: "0 7 * * 2,5",
    jitterMin: 60,
    enabled: true,
  });

  // Sample blog 2 — 라이프스타일
  const [blogLife] = await db
    .insert(schema.blogs)
    .values({
      naverBlogId: "studio_seoul_life",
      displayName: "서울 라이프 큐레이션",
      blogTitle: "서울 사는 사람의 작은 발견",
      blogUrl: "https://blog.naver.com/studio_seoul_life",
      niche: "라이프스타일·문화",
      status: "active",
    })
    .returning();

  await db.insert(schema.personas).values({
    blogId: blogLife.id,
    purpose: "서울에서 일하는 30대의 시선으로 도시 속 작은 발견을 기록한다.",
    audience: "서울 거주 25~35세, 새로운 카페·전시·동네 산책 정보를 찾는 사람",
    brandVoice: "관찰자적이면서 따뜻한 에세이 톤. 광고티 절대 금지.",
    pointOfView: "first_person",
    formality: "informal",
    coreTopicsJson: JSON.stringify([
      { topic: "동네 산책 코스", weight: 3 },
      { topic: "독립서점·전시", weight: 2 },
      { topic: "혼자 가기 좋은 카페", weight: 2 },
    ]),
    focusKeywordsJson: JSON.stringify([
      "서울 산책 코스", "독립서점 추천", "조용한 카페", "주말 나들이",
    ]),
    forbiddenWordsJson: JSON.stringify(["광고", "협찬", "이벤트", "프로모션"]),
    callsToActionJson: JSON.stringify([]),
    qualityRulesJson: JSON.stringify([
      "에세이 호흡으로 — 한 문단 3~5문장",
      "헤더 없이 흐름 위주로 작성하는 것도 허용",
      "감상은 구체적인 디테일 1개 이상 (소리, 조명, 향 등)",
    ]),
  });

  await db.insert(schema.schedules).values({
    blogId: blogLife.id,
    cron: "0 8 * * 6",
    jitterMin: 90,
    enabled: true,
  });

  // ---- Demo topic + draft on blogFood, for UI preview ----
  const [topic] = await db
    .insert(schema.topicCandidates)
    .values({
      blogId: blogFood.id,
      title: "초여름 점심으로 좋은 한그릇 메뉴 3가지",
      angle: "더워지는 6월, 사무실 점심으로 가볍게 먹을 수 있는 그릴박스 메뉴",
      primaryKeyword: "초여름 점심",
      secondaryKeywordsJson: JSON.stringify([
        "직화구이 한그릇",
        "강남 점심",
        "가벼운 점심 메뉴",
      ]),
      searchVolumeMonthly: 4200,
      competitionScore: 38,
      intentType: "informational",
      source: "llm",
      score: 78,
      rationale: "시즌성 + 검색량 안정 + 경쟁도 낮음, 우리 메뉴와 자연스러운 매칭",
      status: "selected",
    })
    .returning();

  const sampleBody = `## 더위 시작되는 6월, 점심 메뉴가 고민이라면

요즘 점심 시간만 되면 사무실 동료들이 다 같은 고민을 해요. 너무 무거운 것도 부담스럽고, 그렇다고 샐러드 한 그릇으로는 오후가 안 버티고…

지난 주에 그릴박스 강남점에서 동료 셋이 같이 점심을 먹었는데, 의외로 만족도가 높았던 메뉴 세 가지를 소개해보려고 해요. 전부 한 그릇 형태라 자리 차지도 적고, 식후에 졸리지 않다는 점이 좋았어요.

## 1. 직화 닭다리살 한그릇

가장 인기 많았던 메뉴. 닭다리살을 숯불에 직화로 구워서 한그릇에 담아주는데, 양념이 진하지 않아서 점심으로 먹기에 부담이 적었어요.

가격은 방문 시 기준으로 9,500원이었고, 사이드로 나오는 양배추 샐러드가 의외로 양이 넉넉했어요.

## 2. 매콤 제육 한그릇

매콤한 게 당기는 날에 추천. 단맛이 적고 깔끔하게 매운 편이라 끝맛이 깨끗해요. 더운 날에 오히려 잘 맞는 종류의 매운맛이에요.

## 3. 들기름 비빔밥

가장 가벼운 옵션. 들기름과 김가루, 계란만 들어가는 단순한 구성인데 곁들이는 강된장이 좋아서 자꾸 손이 가요.

---

세 가지 다 12시 전후로 가도 5~10분이면 나오는 편이고, 매장 환기도 잘 되는 편이라 점심 시간이 길지 않은 분들에게 부담 없이 추천해드릴 수 있어요.

예약·매장 위치는 그릴박스 홈페이지에서 확인하세요.`;

  const [draft] = await db
    .insert(schema.drafts)
    .values({
      blogId: blogFood.id,
      topicId: topic.id,
      title: "초여름 점심으로 좋은 한그릇 메뉴 3가지 — 그릴박스 강남점 후기",
      summary: "더워지는 6월, 사무실 점심을 가볍게 챙기고 싶은 분들을 위한 실제 방문 후기.",
      bodyMd: sampleBody,
      imagePlanJson: JSON.stringify([
        { slot: 0, role: "hero", description: "한그릇 메뉴 3종이 가지런히 놓인 상차림 (탑다운, 자연광)", needsUserShot: true },
        { slot: 1, role: "inline", description: "직화 닭다리살 클로즈업", needsUserShot: true },
        { slot: 2, role: "inline", description: "제육 한그릇 측면 컷, 김 모락", needsUserShot: true },
        { slot: 3, role: "inline", description: "들기름 비빔밥 비비기 전 모양", needsUserShot: false },
        { slot: 4, role: "store", description: "강남점 입구 (낮 시간대)", needsUserShot: true },
      ]),
      tagsJson: JSON.stringify([
        "그릴박스", "강남점심", "직화구이", "한그릇메뉴", "초여름점심", "직장인점심",
      ]),
      status: "ready_for_review",
      seoScore: 82,
      seoIssuesJson: JSON.stringify([
        "본문에 '강남 점심' 키워드 한 번만 등장 — 자연스럽게 한 번 더 권장",
      ]),
      humanScore: 88,
      charCount: sampleBody.length,
      imageCount: 5,
      llmModel: "claude-sonnet-4-6",
      llmInputTokens: 4200,
      llmOutputTokens: 1380,
      llmCostCents: 8,
    })
    .returning();

  await db.insert(schema.draftVersions).values({
    draftId: draft.id,
    revision: 0,
    title: draft.title,
    bodyMd: sampleBody,
    imagePlanJson: draft.imagePlanJson,
    reasonForChange: "최초 생성",
  });

  // Pending photo requests
  const plan = JSON.parse(draft.imagePlanJson) as Array<{
    slot: number;
    role: string;
    description: string;
    needsUserShot: boolean;
  }>;
  for (const it of plan.filter((p) => p.needsUserShot)) {
    await db.insert(schema.imageRequests).values({
      draftId: draft.id,
      slot: it.slot,
      description: it.description,
      composition:
        it.role === "hero" ? "탑다운, 자연광 정사각형 1:1" : "16:9, 클로즈업",
    });
  }

  console.log("Done.");
  console.log("Login: admin@blogstudio.local / studio1234!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
