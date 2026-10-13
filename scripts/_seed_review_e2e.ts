/* 로컬 E2E 시드 — 자동검수 개편·개선 제안 루프 화면 검증용(일회용, 테스트 DB 전용).
   실행: DATABASE_URL=/tmp/bs_e2e/studio.db APP_URL=http://localhost:3105 npx tsx scripts/_seed_review_e2e.ts */
import { db, schema } from "../src/db/client";
import { eq } from "drizzle-orm";
import { recordSettingIssues } from "../src/lib/proposals";

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  if (!admin) throw new Error("admin 없음 — dev 서버가 먼저 떠서 부트스트랩해야 합니다");
  await db.update(schema.users).set({ phone: "01055550001", notifyEnabled: true }).where(eq(schema.users.id, admin.id));

  const [blog] = await db.insert(schema.blogs).values({ ownerId: admin.id, naverBlogId: "e2e_review", displayName: "E2E 검수개편 테스트 블로그", niche: "헬스장", category: "fitness" }).returning();
  const [persona] = await db
    .insert(schema.personas)
    .values({
      blogId: blog.id,
      version: 1,
      isActive: true,
      purpose: "엔짐 영등포 회원 모집",
      audience: "30대 직장인",
      brandVoice: "친근하고 과장된 홍보 톤, 최고급·완비 같은 표현 적극 사용",
      pointOfView: "first_person",
      formality: "neutral",
      focusKeywordsJson: JSON.stringify(["영등포 헬스장"]),
      forbiddenWordsJson: JSON.stringify(["최고급"]),
      facilitiesJson: JSON.stringify(["프리웨이트존", "샤워실"]),
      absentFacilitiesJson: JSON.stringify(["수영장"]),
    })
    .returning();

  const mkDraft = async (title: string, verdict: "approve" | "revise" | "reject" | "failed", reason: string, flags: string[], revised = false) => {
    const meta = {
      calls: [
        { model: "gpt-5.5", purpose: "검수", inTokens: 9800, outTokens: 3100, costCents: 1960 },
        ...(revised ? [{ model: "gpt-5.5", purpose: "수정본 재검수", inTokens: 9900, outTokens: 900, costCents: 1060 }] : []),
      ],
      costCents: revised ? 3020 : 1960,
      revised,
      at: new Date().toISOString(),
      byModel: { "gpt-5.5": { calls: revised ? 2 : 1, costCents: revised ? 3020 : 1960, inTokens: revised ? 19700 : 9800, outTokens: revised ? 4000 : 3100 } },
    };
    const [d] = await db
      .insert(schema.drafts)
      .values({
        blogId: blog.id,
        title,
        summary: "(시드) 검수 개편 화면 검증용 초안",
        bodyMd: `## 첫날 등록하고 온 이야기\n\n저녁 8시에 갔는데 프리웨이트존이 꽤 비어 있었어요.\n\n<!-- IMG:slot=0 -->\n\n샤워실은 깔끔한 편이고, 주차는 조금 불편했습니다.`,
        status: "ready_for_review",
        charCount: 80,
        imageCount: 1,
        reviewVerdict: verdict,
        reviewReason: reason,
        reviewFlagsJson: JSON.stringify(flags),
        reviewModel: verdict === "failed" ? "(없음)" : "gpt-5.5",
        reviewMetaJson: verdict === "failed" ? null : JSON.stringify(meta),
        llmModel: "gpt-6-astra",
      })
      .returning();
    return d;
  };
  const d1 = await mkDraft("[시드] 영등포 헬스장 첫 방문 후기", "approve", "가이드와 페르소나에 비춰 그대로 발행해도 됩니다. 솔직한 아쉬움과 구체 장면이 있어 사람 후기처럼 읽힙니다.", []);
  const d2 = await mkDraft("[시드] 저녁 운동 루틴과 헬스장 선택", "revise", "수정함 — 도입이 일반론으로 시작해 첫 문단을 글쓴이 상황으로 바꿨습니다 / 재검수: 통과.", ["forbidden_word_used"], true);
  const d3 = await mkDraft("[시드] 수영장까지 갖춘 헬스장?", "reject", "페르소나에 없는 시설(수영장)을 있는 것처럼 썼고 고쳐도 글의 전제가 무너져 다시 써야 합니다.", ["absent_facility_used", "unfinished_slots"]);
  const d4 = await mkDraft("[시드] 검수 모델 응답 없음 케이스", "failed", "검수 모델 응답이 제한 시간을 넘겨 자동 검수를 마치지 못했습니다. 직접 검토해 주세요.", []);

  const common = { blogId: blog.id, personaId: persona.id, blogName: blog.displayName, ownerId: admin.id, callerUserId: admin.id };
  // 1) systemic+high → 즉시 제안(페르소나 톤)
  const s1 = await recordSettingIssues({
    ...common,
    draftId: d2.id,
    issues: [
      {
        target: "persona",
        field: "brandVoice",
        problem: "페르소나의 톤 설정이 «최고급·완비 같은 표현 적극 사용»을 요구해, 글마다 전체 가이드가 금지하는 브로슈어 문체(\"최고급 시설을 완비했어요\")가 반복됩니다. 이 글 한 편의 실수가 아니라 설정 자체가 가이드와 충돌합니다.",
        proposed_change: { before: "친근하고 과장된 홍보 톤, 최고급·완비 같은 표현 적극 사용", after: "친근하되 과장 없는 경험담 톤. 시설은 겪은 장면으로 보여주고 홍보 문구(최고급·완비·명실상부)는 쓰지 않음" },
        confidence: "high",
        systemic: true,
      },
      // 2) 페르소나 목록 항목(금지어 추가) — systemic+high 즉시
      {
        target: "persona",
        field: "forbiddenWordsJson",
        problem: "금지어에 «최고급»만 있어 «완비», «명실상부» 같은 같은 계열 홍보어가 그대로 통과합니다(이 글: \"샤워실까지 완비\").",
        proposed_change: { before: "[\"최고급\"]", after: "[\"최고급\",\"완비\",\"명실상부\"]" },
        confidence: "high",
        systemic: true,
      },
      // 3) 전역 가이드 — medium → 보류(pending)
      {
        target: "global_guide",
        field: "3. 남용 단어·표현 금지",
        problem: "가이드의 남용 단어 목록에 «완전», «진짜»는 있지만 «엄청»이 없어 반복 사용됩니다(이 글에 4회).",
        proposed_change: { before: "- 강조 부사 떡칠 금지: 정말, 너무, 진짜, 꼭, 매우, 굉장히, 완전.", after: "- 강조 부사 떡칠 금지: 정말, 너무, 진짜, 꼭, 매우, 굉장히, 완전, 엄청." },
        confidence: "medium",
        systemic: true,
      },
    ],
  });
  console.log("seed round1:", s1);
  // 같은 가이드 문제가 다른 초안(d3)에서 반복 → 보류 승격(after 가 동일하면 모델 호출 없이 합산)
  const s2 = await recordSettingIssues({
    ...common,
    draftId: d3.id,
    issues: [
      {
        target: "global_guide",
        field: "3. 남용 단어·표현 금지",
        problem: "«엄청»이 남용 단어 목록에 없어 이 글에서도 3회 반복됩니다.",
        proposed_change: { before: "- 강조 부사 떡칠 금지: 정말, 너무, 진짜, 꼭, 매우, 굉장히, 완전.", after: "- 강조 부사 떡칠 금지: 정말, 너무, 진짜, 꼭, 매우, 굉장히, 완전, 엄청." },
        confidence: "medium",
        systemic: true,
      },
    ],
  });
  console.log("seed round2:", s2);
  const props = await db.query.improvementProposals.findMany();
  console.log(JSON.stringify({ blogId: blog.id, personaId: persona.id, drafts: [d1.id, d2.id, d3.id, d4.id], proposals: props.map((p) => ({ id: p.id, target: p.target, field: p.field, status: p.status, occ: p.occurrenceCount })) }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
