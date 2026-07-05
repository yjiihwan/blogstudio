/**
 * 실제 E2E 하니스 — 앱의 진짜 코드 경로(pipeline / telegram / cron)를 라이브 DB에 대고 실행한다.
 * 사용: tsx scripts/e2e_full.mts <step>
 *   diag                  설정/키/계정 진단
 *   blog                  Step① 테스트 블로그(엔짐) 생성
 *   gen <blogId> [mode]   Step② 초안 생성. mode=asis(현재설정) | system(admin을 system키 모드로)
 *   cron                  Step③ cron_tick 실행(예약 자동생성)
 */
import { db, schema } from "@/db/client";
import { and, eq, desc } from "drizzle-orm";
import { generateDraftForBlog } from "@/lib/pipeline";
import { sendTelegramToUser } from "@/lib/telegram";

const log = (...a: unknown[]) => console.log("[E2E]", ...a);
const TEST_NAVER_ID = "enzyme_ydp_e2e";

function mask(v: string | null | undefined) {
  if (!v) return "(없음)";
  return v.length <= 12 ? v : `${v.slice(0, 8)}…${v.slice(-4)} (len=${v.length})`;
}

async function getSetting(key: string) {
  const r = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  if (!r) return null;
  try { return JSON.parse(r.valueJson) as string; } catch { return r.valueJson; }
}

async function diag() {
  log("=== 설정(시스템 키) ===");
  for (const k of ["anthropic_api_key", "openai_api_key", "telegram_bot_token", "unsplash_access_key", "pexels_api_key", "google_ai_api_key"]) {
    log(` ${k}:`, mask(await getSetting(k)));
  }
  log("=== 계정 ===");
  const users = await db.query.users.findMany();
  for (const u of users) {
    log(` ${u.email} | role=${u.role} status=${u.status} provider=${u.llmProvider} keyMode=${u.apiKeyMode} personalKey=${mask((u.llmProvider === "openai" ? u.openaiApiKey : u.anthropicApiKey) ?? null)} chatId=${u.telegramChatId ?? "(없음)"}`);
  }
  log("=== 블로그 ===");
  const blogs = await db.query.blogs.findMany({ with: { personas: true } });
  for (const b of blogs) log(` ${b.id} | ${b.displayName} | owner=${b.ownerId} | personas=${b.personas.length} | status=${b.status}`);
}

async function adminUser() {
  const u = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  if (!u) throw new Error("admin 없음");
  return u;
}

async function createBlog() {
  const admin = await adminUser();
  const existing = await db.query.blogs.findFirst({ where: eq(schema.blogs.naverBlogId, TEST_NAVER_ID) });
  if (existing) { log("기존 테스트 블로그 재사용:", existing.id); return existing.id; }

  const [b] = await db.insert(schema.blogs).values({
    naverBlogId: TEST_NAVER_ID,
    displayName: "엔짐 영등포점 (E2E 테스트)",
    blogTitle: "엔짐 프리미엄 피트니스",
    niche: "프리미엄 피트니스",
    status: "active",
    ownerId: admin.id,
  }).returning();

  await db.insert(schema.personas).values({
    blogId: b.id,
    purpose: "엔짐 영등포점의 프리미엄 피트니스 경험과 전문 트레이너 PT를 소개해 방문/상담 예약을 유도",
    audience: "30~40대 직장인, 운동 효과와 시설 퀄리티를 중시하는 고관여 고객",
    brandVoice: "전문적이고 신뢰감 있되 따뜻한 프리미엄 톤. 과장 광고 배제.",
    pointOfView: "expert",
    formality: "formal",
    coreTopicsJson: "[]",
    focusKeywordsJson: JSON.stringify(["영등포 헬스장", "프리미엄 PT", "1:1 퍼스널 트레이닝"]),
    forbiddenWordsJson: JSON.stringify(["무조건", "100% 보장"]),
    callsToActionJson: JSON.stringify(["무료 체험 상담 예약하기"]),
    qualityRulesJson: JSON.stringify(["의학적 단정 금지", "수치는 일반적 범위로"]),
    facilitiesJson: JSON.stringify(["웨이트 트레이닝존", "머신·프리웨이트", "유산소 존", "그룹운동(GX)", "1:1 퍼스널 트레이닝(PT)", "샤워실·탈의실"]),
    absentFacilitiesJson: JSON.stringify(["수영", "사우나", "스파", "골프", "찜질방", "테니스"]),
    sampleSnippetsJson: "[]",
    preferredLengthMin: 1200,
    preferredLengthMax: 2200,
    imagesPerPostMin: 3,
    imagesPerPostMax: 6,
    notes: null,
  });

  await db.insert(schema.schedules).values({
    blogId: b.id,
    cron: "0 7 * * 1,4",
    jitterMin: 30,
    enabled: true,
  });
  log("블로그 생성 완료:", b.id, "(persona + schedule 포함)");
  return b.id;
}

async function gen(blogId: string, mode: string) {
  const admin = await adminUser();
  let restored: { apiKeyMode: "system" | "user_key" } | null = null;
  if (mode === "system" && admin.apiKeyMode !== "system") {
    restored = { apiKeyMode: admin.apiKeyMode };
    await db.update(schema.users).set({ apiKeyMode: "system" }).where(eq(schema.users.id, admin.id));
    log(`admin api_key_mode: ${restored.apiKeyMode} → system (테스트용 임시변경)`);
  }
  log(`초안 생성 시작 — blog=${blogId} caller=${admin.email} mode=${mode}`);
  const t0 = Date.now();
  try {
    const draft = await generateDraftForBlog(blogId, admin.id);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    log(`✅ 생성 성공 (${dt}s)`);
    log(`   draftId=${draft.id}`);
    log(`   title=${draft.title}`);
    log(`   model=${draft.llmModel} isMock=${draft.llmModel === "mock"}`);
    log(`   charCount=${draft.charCount} seo=${draft.seoScore} human=${draft.humanScore} cost=${draft.llmCostCents}전`);
    log(`   본문 미리보기:\n${draft.bodyMd.slice(0, 300)}\n   ---`);
    log("   텔레그램 발송 시도(실제 봇)…");
    await sendTelegramToUser(admin.id, `[E2E] ✅ 초안 생성 검증 완료\n제목: ${draft.title}`);
    log("   텔레그램 호출 반환됨(에러는 위 로그 확인).");
  } catch (e) {
    log(`❌ 생성 실패: ${(e as Error).name}: ${(e as Error).message}`);
    log((e as Error).stack?.split("\n").slice(0, 4).join("\n"));
  } finally {
    if (restored) {
      await db.update(schema.users).set({ apiKeyMode: restored.apiKeyMode }).where(eq(schema.users.id, admin.id));
      log(`admin api_key_mode 원복: → ${restored.apiKeyMode}`);
    }
  }
}

async function cron() {
  log("cron_tick 시뮬레이션 — enabled 스케줄 중 due 인 것 처리");
  const { execSync } = await import("node:child_process");
  log("실제 cron_tick.ts는 next_run 비교가 필요하므로, 여기선 due 강제 후 직접 generateDraftForBlog 호출");
  const scheds = await db.query.schedules.findMany({ where: eq(schema.schedules.enabled, true), with: { blog: true } });
  for (const s of scheds) {
    if (s.blog.status !== "active") { log(`skip ${s.blog.displayName} (status=${s.blog.status})`); continue; }
    log(`[cron] generating for ${s.blog.displayName} (owner=${s.blog.ownerId})`);
    try {
      const d = await generateDraftForBlog(s.blogId, s.blog.ownerId ?? undefined);
      log(`  → draft ${d.id} model=${d.llmModel}`);
    } catch (e) {
      log(`  ✗ failed: ${(e as Error).name}: ${(e as Error).message}`);
    }
  }
  void execSync;
}

const step = process.argv[2];
if (step === "diag") await diag();
else if (step === "blog") await createBlog();
else if (step === "gen") await gen(process.argv[3], process.argv[4] ?? "asis");
else if (step === "cron") await cron();
else log("unknown step:", step);
process.exit(0);
