import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";
import { nanoid } from "nanoid";

const id = () =>
  text("id").primaryKey().$defaultFn(() => nanoid(16));

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
};

/* =========================================================================
   USERS — admin operators (the brand owner managing multiple blogs)
   ========================================================================= */
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(true),
  apiKeyMode: text("api_key_mode", { enum: ["system", "user_key"] })
    .notNull()
    .default("user_key"),
  llmProvider: text("llm_provider", { enum: ["anthropic", "openai"] })
    .notNull()
    .default("anthropic"),
  anthropicApiKey: text("anthropic_api_key"),
  openaiApiKey: text("openai_api_key"),
  imageApiKeyMode: text("image_api_key_mode", { enum: ["system", "user_key"] })
    .notNull()
    .default("system"),
  unsplashKey: text("unsplash_key"),
  pexelsKey: text("pexels_key"),
  googleAiKey: text("google_ai_key"),
  // 이미지 소스 사용여부·시도순서·자동검증 설정(JSON, lib/image-source-config.ts). null = 기본값(전부 사용).
  imageSourceConfigJson: text("image_source_config_json"),
  // 카카오 알림톡 수신 번호(숫자만, 01012345678). unique 아님 — 한 사람이 계정 여러 개일 수 있음(2026-10-13 알림톡 전환).
  phone: text("phone"),
  notifyEnabled: integer("notify_enabled", { mode: "boolean" }).notNull().default(true),
  // ── 텔레그램(10-13 알림톡 전환으로 미사용 · 되돌리기용으로 컬럼 유지) ──
  telegramChatId: text("telegram_chat_id"),
  // 일회성 텔레그램 연결코드(딥링크 /start <code>)와 만료시각(ISO). 연결 완료 시 비운다.
  telegramLinkCode: text("telegram_link_code"),
  telegramLinkExpires: text("telegram_link_expires"),
  ...timestamps,
});

/* =========================================================================
   BLOGS — each Naver blog account being managed
   ========================================================================= */
export const blogs = sqliteTable("blogs", {
  id: id(),
  /* Owner — the user who created/owns this blog. Admins see all blogs;
     everyone else only sees blogs where ownerId === their id. All child
     data (drafts, personas, schedules, …) cascade off blogs, so scoping
     blog access is enough to isolate the whole workspace per account. */
  ownerId: text("owner_id").references(() => users.id),
  /* Naver blog ID (the part after blog.naver.com/) */
  naverBlogId: text("naver_blog_id").notNull(),
  displayName: text("display_name").notNull(),       // 내부 표시명
  blogTitle: text("blog_title"),                     // 실제 블로그 제목
  blogUrl: text("blog_url"),                         // https://blog.naver.com/...
  niche: text("niche"),                              // 맛집 / 부동산 / 라이프 등
  /* 문체 샘플(style_samples) 매칭용 업종 카테고리. niche 는 자유 텍스트라 매칭 기준이
     못 되므로 별도 고정 목록을 둔다. null = 미지정(샘플 주입 건너뜀 = 기존 동작). */
  category: text("category"),
  language: text("language").notNull().default("ko"),
  status: text("status", { enum: ["active", "paused", "archived"] })
    .notNull()
    .default("active"),
  ...timestamps,
});

/* =========================================================================
   PERSONAS — per-blog content guideline (purpose, tone, taboo, samples)
   - One blog → one active persona; history kept as separate rows with
     `isActive` flag for traceability.
   ========================================================================= */
export const personas = sqliteTable("personas", {
  id: id(),
  blogId: text("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

  /* === Brand & purpose === */
  purpose: text("purpose"),                  // 블로그 목적
  audience: text("audience"),                // 타겟 독자
  brandVoice: text("brand_voice"),           // 톤·말투
  pointOfView: text("point_of_view", {
    enum: ["first_person", "owner", "third_person", "expert"],
  }).notNull().default("first_person"),
  formality: text("formality", {
    enum: ["informal", "neutral", "formal"],
  }).notNull().default("neutral"),
  ageGroup: text("age_group", {
    enum: ["teens", "20s", "30s", "40s", "50s", "60s"],
  }),
  gender: text("gender", { enum: ["female", "male"] }),

  /* === Content strategy === */
  coreTopicsJson: text("core_topics_json").notNull().default("[]"),       // [{topic, weight}]
  focusKeywordsJson: text("focus_keywords_json").notNull().default("[]"), // string[]
  forbiddenWordsJson: text("forbidden_words_json").notNull().default("[]"),
  callsToActionJson: text("ctas_json").notNull().default("[]"),

  /* === Naver SEO hints === */
  preferredLengthMin: integer("preferred_length_min").notNull().default(1500),
  preferredLengthMax: integer("preferred_length_max").notNull().default(2800),
  imagesPerPostMin: integer("images_per_post_min").notNull().default(3),
  imagesPerPostMax: integer("images_per_post_max").notNull().default(8),

  /* === 이모지 강도(0~3) ===
     null = 미지정(자동): 격식/프리미엄 톤이면 레벨1, 그 외 레벨2로 해석.
     0~3 = 사용자 명시(최우선). 표준 기본값은 2. (emoji_intensity_spec §4) */
  emojiIntensity: integer("emoji_intensity"),

  /* === Sample writing (used as style reference for the LLM) === */
  sampleSnippetsJson: text("sample_snippets_json").notNull().default("[]"),

  /* === Anti-detection / quality rules === */
  qualityRulesJson: text("quality_rules_json").notNull().default("[]"),

  /* === Facility facts (없는 시설 날조 방지) ===
     facilities: 실제 제공하는 시설·프로그램(확정 — 이 목록에 있는 것만 '있다'고 쓸 수 있음).
     absentFacilities: 없는 것/오해 소지(예: 수영장·사우나·골프). 제목·본문에 등장해도 사실로
     취급 금지 + 발행 전 게이트가 이 키워드로 날조를 검출한다. */
  facilitiesJson: text("facilities_json").notNull().default("[]"),          // string[]
  absentFacilitiesJson: text("absent_facilities_json").notNull().default("[]"), // string[]

  notes: text("notes"),
  ...timestamps,
});

/* =========================================================================
   SCHEDULES — when to generate drafts for a blog
   ========================================================================= */
export const schedules = sqliteTable("schedules", {
  id: id(),
  blogId: text("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  /* cron expression or simpler weekly pattern */
  cron: text("cron").notNull().default("0 6 * * 1"), // every Mon 06:00
  /* jitter in minutes — randomly offset from exact cron time so posts
     don't always appear at the same minute (anti-bot signal) */
  jitterMin: integer("jitter_min").notNull().default(45),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  ...timestamps,
});

/* =========================================================================
   TOPIC_CANDIDATES — discovered/proposed topics, scored
   ========================================================================= */
export const topicCandidates = sqliteTable("topic_candidates", {
  id: id(),
  blogId: text("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  angle: text("angle"),
  primaryKeyword: text("primary_keyword").notNull(),
  secondaryKeywordsJson: text("secondary_keywords_json").notNull().default("[]"),
  searchVolumeMonthly: integer("search_volume_monthly"),
  competitionScore: integer("competition_score"),
  intentType: text("intent_type", {
    enum: ["informational", "transactional", "navigational", "local"],
  }),
  source: text("source"), // 'naver_datalab' | 'rss' | 'manual' | 'llm'
  rationale: text("rationale"),
  /* combined score 0~100 (higher = better fit) */
  score: integer("score"),
  status: text("status", {
    enum: ["proposed", "selected", "discarded"],
  }).notNull().default("proposed"),
  ...timestamps,
});

/* =========================================================================
   DRAFTS — a candidate post being generated/iterated
   ========================================================================= */
export const drafts = sqliteTable("drafts", {
  id: id(),
  blogId: text("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  topicId: text("topic_id").references(() => topicCandidates.id),
  scheduleId: text("schedule_id").references(() => schedules.id),

  title: text("title").notNull(),
  /* concise hook shown in card; not part of the post itself */
  summary: text("summary"),

  /* Long-form body (Markdown). Naver editor accepts pasted rich text and we
     convert at publish time. */
  bodyMd: text("body_md").notNull().default(""),

  /* The "image plan" decides which images are needed. Items are filled by
     the image pipeline (auto-found, AI-gen, or queued for user-shot). */
  imagePlanJson: text("image_plan_json").notNull().default("[]"),
  tagsJson: text("tags_json").notNull().default("[]"),

  status: text("status", {
    enum: [
      "draft",            // AI 생성 진행중(백그라운드)
      "failed",           // 백그라운드 생성 실패
      "ready_for_review", // 관리자 승인 대기
      "revising",         // 반려 후 재작성중
      "approved",         // 발행 가능
      "published",        // 네이버 업로드 완료
      "archived",         // 폐기
    ],
  }).notNull().default("draft"),

  /* Iteration counter — increments on each "revise based on feedback" cycle */
  revisionRound: integer("revision_round").notNull().default(0),

  /* SEO scoring snapshot computed at draft time */
  seoScore: integer("seo_score"),
  seoIssuesJson: text("seo_issues_json").notNull().default("[]"),
  /* Anti-detection heuristic score (0=very robotic, 100=very human) */
  humanScore: integer("human_score"),

  /* Words/chars for quick UI */
  charCount: integer("char_count").notNull().default(0),
  imageCount: integer("image_count").notNull().default(0),

  llmModel: text("llm_model"),
  llmInputTokens: integer("llm_input_tokens"),
  llmOutputTokens: integer("llm_output_tokens"),
  llmCostCents: integer("llm_cost_cents"),

  /* === 모델 검수(2026-10-13 A안) ===
     기계 점수(seoScore·humanScore)는 더 이상 쓰지 않고(컬럼은 nullable 유지), 검수 모델이 글 전체를 읽고
     낸 판정을 저장한다. failed = 응답 파싱 실패·타임아웃(자동 승인 금지, 사람 검수로). */
  reviewVerdict: text("review_verdict", { enum: ["approve", "revise", "reject", "failed"] }),
  reviewReason: text("review_reason"),
  reviewFlagsJson: text("review_flags_json").notNull().default("[]"),  // HardFlag[]
  reviewModel: text("review_model"),
  // 검수 호출 내역 {calls:[{model,purpose,inTokens,outTokens,costCents}], costCents, revised, at}
  reviewMetaJson: text("review_meta_json"),

  scheduledPublishAt: text("scheduled_publish_at"),
  publishedAt: text("published_at"),
  publishedUrl: text("published_url"),

  ...timestamps,
});

/* =========================================================================
   DRAFT_VERSIONS — full snapshot per revision (for diff + audit)
   ========================================================================= */
export const draftVersions = sqliteTable("draft_versions", {
  id: id(),
  draftId: text("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  imagePlanJson: text("image_plan_json").notNull().default("[]"),
  reasonForChange: text("reason_for_change"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   IMAGES — actual image files (uploaded, AI-generated, or stock-licensed)
   ========================================================================= */
export const images = sqliteTable("images", {
  id: id(),
  blogId: text("blog_id").references(() => blogs.id),
  draftId: text("draft_id").references(() => drafts.id),

  source: text("source", {
    enum: ["upload", "ai_generated", "stock_free", "stock_paid", "user_shot"],
  }).notNull(),
  /* For ai_generated: prompt used; for stock: license info */
  sourceMetaJson: text("source_meta_json"),
  filePath: text("file_path").notNull(), // /storage/<id>.jpg
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  altText: text("alt_text"),
  caption: text("caption"),

  ...timestamps,
});

/* =========================================================================
   IMAGE_REQUESTS — when AI determines a real photo is needed
   ========================================================================= */
export const imageRequests = sqliteTable("image_requests", {
  id: id(),
  draftId: text("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(), // position in imagePlan
  /* What kind of photo is needed */
  description: text("description").notNull(),
  composition: text("composition"), // close-up, wide, top-down ...
  example: text("example"),         // optional URL of example
  status: text("status", {
    enum: ["pending", "uploaded", "skipped"],
  }).notNull().default("pending"),
  uploadedImageId: text("uploaded_image_id").references(() => images.id),
  uploadedAt: text("uploaded_at"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   APPROVALS — admin decisions per revision
   ========================================================================= */
export const approvals = sqliteTable("approvals", {
  id: id(),
  draftId: text("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  reviewerUserId: text("reviewer_user_id").references(() => users.id),
  revision: integer("revision").notNull(),
  decision: text("decision", {
    enum: ["approve", "reject", "edit_and_approve"],
  }).notNull(),
  feedback: text("feedback"),     // 반려 사유 / 수정 요청
  feedbackTagsJson: text("feedback_tags_json").notNull().default("[]"),
  /* If edit_and_approve: store the edited body inline so we can audit */
  editedBodyMd: text("edited_body_md"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   PUBLISHES — record of every publish action (audit + rollback context)
   ========================================================================= */
export const publishes = sqliteTable("publishes", {
  id: id(),
  draftId: text("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  publishedByUserId: text("published_by_user_id").references(() => users.id),
  method: text("method", {
    enum: ["manual_paste", "open_api", "browser_auto", "dry_run"],
  })
    .notNull()
    .default("manual_paste"),
  publishedAt: text("published_at"),
  publishedUrl: text("published_url"),
  /* Metadata we displayed in the success screen */
  copyPayloadMd: text("copy_payload_md"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   RANKING_SNAPSHOTS — daily Naver search position for tracked keywords
   ========================================================================= */
export const rankingSnapshots = sqliteTable("ranking_snapshots", {
  id: id(),
  draftId: text("draft_id").references(() => drafts.id),
  blogId: text("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  position: integer("position"),   // 1-based; null if not in top 100
  resultBlock: text("result_block"), // 'view' / 'blog' / 'web'
  capturedAt: text("captured_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   NOTIFICATIONS — in-app + external (email/slack/telegram) outbox
   ========================================================================= */
export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  type: text("type").notNull(),  // 'draft_ready' | 'rejected' | 'photo_needed' ...
  title: text("title").notNull(),
  body: text("body"),
  linkUrl: text("link_url"),
  channel: text("channel", { enum: ["inapp", "email", "slack", "telegram"] })
    .notNull()
    .default("inapp"),
  sentAt: text("sent_at"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   STYLE_SAMPLES — 어드민이 직접 붙여넣는 '베스트 후기 원문'
   - 자동 수집이 불가(네이버는 블로그 본문 API 미제공)해서, 운영자가 좋은 글을
     골라 원문 그대로 보관한다. 초안 생성 시 카테고리가 맞는 활성 샘플을
     few-shot 으로 주입해 '문체만' 참고시킨다(내용·고유명사 차용은 금지).
   - category 는 STYLE_CATEGORIES(src/lib/style-samples.ts) 14종 중 하나.
     enum 대신 text 로 두어, 카테고리 추가 시 마이그레이션이 필요 없게 한다.
   ========================================================================= */
export const styleSamples = sqliteTable("style_samples", {
  id: id(),
  category: text("category").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),      // 원문 전문(마크다운 렌더링 안 함)
  sourceUrl: text("source_url"),
  memo: text("memo"),                            // "이 글의 어디가 좋은지" 운영자 메모
  // 규칙 기반 문체 지표(LLM 호출 없음). 저장 시 자동 계산 — 없거나 구버전이면 읽을 때 재계산.
  styleMetricsJson: text("style_metrics_json"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* =========================================================================
   ALIMTALK LOGS — 카카오 알림톡 발송 이력(드라이런·발송·실패). 관리자 «발송 이력» 탭 + 실패 배너 집계
   ========================================================================= */
export const alimtalkLogs = sqliteTable("alimtalk_logs", {
  id: id(),
  userId: text("user_id"),
  event: text("event").notNull(),
  to: text("to").notNull().default(""),
  templateCode: text("template_code").notNull().default(""),
  status: text("status", { enum: ["dry_run", "sent", "sms_sent", "failed", "skipped"] }).notNull(),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   IMPROVEMENT_PROPOSALS — 검수 모델이 보고한 «설정(전역 가이드·페르소나) 결함» 개선 제안
   - 생성 규칙(소음 방지): systemic+high 는 즉시 proposed, 그 외는 pending(보류 집계) 으로 두었다가
     다른 초안 2건 이상에서 반복되면 proposed 로 승격. 거절 건과 같은 내용은 30일 재제안 금지.
   - 적용은 사용자가 «동의» 를 눌렀을 때만(자동 적용 절대 금지). rollbackJson 에 적용 전 값을 보관.
   ========================================================================= */
export const improvementProposals = sqliteTable("improvement_proposals", {
  id: id(),
  draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }),
  blogId: text("blog_id").references(() => blogs.id, { onDelete: "cascade" }),
  personaId: text("persona_id"),
  target: text("target", { enum: ["global_guide", "persona"] }).notNull(),
  field: text("field").notNull(),
  problem: text("problem").notNull(),
  proposedChangeJson: text("proposed_change_json").notNull().default("{}"), // {before, after}
  confidence: text("confidence", { enum: ["high", "medium"] }).notNull().default("medium"),
  systemic: integer("systemic", { mode: "boolean" }).notNull().default(false),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  evidenceDraftIdsJson: text("evidence_draft_ids_json").notNull().default("[]"),
  targetUserIdsJson: text("target_user_ids_json").notNull().default("[]"),
  status: text("status", {
    enum: ["pending", "proposed", "accepted", "applied", "rejected", "rolled_back", "expired"],
  }).notNull().default("pending"),
  // 사용자가 «수정 후 적용» 으로 고친 after 값(적용된 실제 값). null 이면 proposedChange.after 그대로.
  appliedAfter: text("applied_after"),
  rejectReason: text("reject_reason"),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: text("decided_at"),
  appliedAt: text("applied_at"),
  rollbackJson: text("rollback_json"),
  ...timestamps,
});

/* =========================================================================
   SETTINGS — singleton-ish key/value (encrypted at app layer for secrets)
   ========================================================================= */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/* =========================================================================
   RELATIONS
   ========================================================================= */
export const blogsRelations = relations(blogs, ({ one, many }) => ({
  owner: one(users, { fields: [blogs.ownerId], references: [users.id] }),
  personas: many(personas),
  drafts: many(drafts),
  schedules: many(schedules),
  topics: many(topicCandidates),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  blog: one(blogs, { fields: [schedules.blogId], references: [blogs.id] }),
}));

export const topicCandidatesRelations = relations(
  topicCandidates,
  ({ one }) => ({
    blog: one(blogs, {
      fields: [topicCandidates.blogId],
      references: [blogs.id],
    }),
  })
);

export const personasRelations = relations(personas, ({ one }) => ({
  blog: one(blogs, { fields: [personas.blogId], references: [blogs.id] }),
}));

export const improvementProposalsRelations = relations(improvementProposals, ({ one }) => ({
  draft: one(drafts, { fields: [improvementProposals.draftId], references: [drafts.id] }),
  blog: one(blogs, { fields: [improvementProposals.blogId], references: [blogs.id] }),
  decider: one(users, { fields: [improvementProposals.decidedBy], references: [users.id] }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  blog: one(blogs, { fields: [drafts.blogId], references: [blogs.id] }),
  topic: one(topicCandidates, {
    fields: [drafts.topicId],
    references: [topicCandidates.id],
  }),
  versions: many(draftVersions),
  images: many(images),
  imageRequests: many(imageRequests),
  approvals: many(approvals),
  publishes: many(publishes),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one }) => ({
  draft: one(drafts, { fields: [draftVersions.draftId], references: [drafts.id] }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  blog: one(blogs, { fields: [images.blogId], references: [blogs.id] }),
  draft: one(drafts, { fields: [images.draftId], references: [drafts.id] }),
}));

export const imageRequestsRelations = relations(imageRequests, ({ one }) => ({
  draft: one(drafts, { fields: [imageRequests.draftId], references: [drafts.id] }),
  uploadedImage: one(images, {
    fields: [imageRequests.uploadedImageId],
    references: [images.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  draft: one(drafts, { fields: [approvals.draftId], references: [drafts.id] }),
  reviewer: one(users, {
    fields: [approvals.reviewerUserId],
    references: [users.id],
  }),
}));

export const publishesRelations = relations(publishes, ({ one }) => ({
  draft: one(drafts, { fields: [publishes.draftId], references: [drafts.id] }),
  publishedBy: one(users, {
    fields: [publishes.publishedByUserId],
    references: [users.id],
  }),
}));

export const rankingSnapshotsRelations = relations(rankingSnapshots, ({ one }) => ({
  draft: one(drafts, { fields: [rankingSnapshots.draftId], references: [drafts.id] }),
  blog: one(blogs, {
    fields: [rankingSnapshots.blogId],
    references: [blogs.id],
  }),
}));
