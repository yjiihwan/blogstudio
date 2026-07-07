-- 엔짐 블로그 스튜디오 QA 격리 시드 (2026-07-06)
-- 원칙: 순수 INSERT OR REPLACE. qa_ 프리픽스 ID만 사용 → 실데이터 무손상, 재실행 안전.
-- 소유자 = admin(rdCxk9rRFWb2wnJr). 정리 시 DELETE ... WHERE id LIKE 'qa_%'.

BEGIN;

-- QA 블로그
INSERT OR REPLACE INTO blogs
  (id, naver_blog_id, display_name, blog_title, blog_url, niche, language, status, owner_id, created_at, updated_at)
VALUES
  ('qa_blog_ngym','qa_enzyme_ydp','[QA] 엔짐 QA 테스트 블로그','엔짐 영등포 프리미엄 피트니스',
   'https://blog.naver.com/qa_enzyme_ydp','피트니스','ko','active','rdCxk9rRFWb2wnJr',
   '2026-07-06T10:00:00.000Z','2026-07-06T10:00:00.000Z');

-- 페르소나
INSERT OR REPLACE INTO personas
  (id, blog_id, version, is_active, purpose, audience, brand_voice, point_of_view, formality,
   core_topics_json, focus_keywords_json, forbidden_words_json, ctas_json,
   preferred_length_min, preferred_length_max, images_per_post_min, images_per_post_max,
   sample_snippets_json, quality_rules_json, notes, facilities_json, absent_facilities_json,
   created_at, updated_at)
VALUES
  ('qa_persona_ngym','qa_blog_ngym',1,1,
   '엔짐 영등포점 프리미엄 피트니스 브랜딩 및 회원 유치',
   '30~40대 직장인, 프리미엄 헬스/PT 관심층',
   '차분하고 신뢰감 있는 프리미엄 톤, 과장 없이 전문성 강조',
   'first_person','polite',
   '["프리미엄 헬스장","1:1 PT","GX 그룹운동","시설 소개"]',
   '["영등포 헬스장","프리미엄 PT","엔짐"]',
   '["최고","무조건","공짜"]',
   '["무료 상담 예약","1:1 PT 체험 신청"]',
   1500,2800,3,8,'[]','[]','QA 전용 페르소나',
   '["프리웨이트존","GX스튜디오","PT룸","샤워/사우나"]','["수영장","골프연습장"]',
   '2026-07-06T10:00:00.000Z','2026-07-06T10:00:00.000Z');

-- 1) draft 상태 · 짧은 글 · 이미지 없음
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, created_at, updated_at)
VALUES
  ('qa_d_01_draft','qa_blog_ngym','[QA] 영등포 헬스장 오픈 안내 (짧은 초안)',
   '오픈 소식을 간단히 알리는 짧은 초안입니다.',
   '## 엔짐 영등포점 오픈'||char(10)||char(10)||'엔짐 영등포점이 문을 열었습니다. 프리미엄 수입 장비와 넓은 프리웨이트존을 갖췄습니다.'||char(10)||char(10)||'지금 무료 상담을 예약해 보세요.',
   '[]','["영등포헬스장","오픈"]','draft',0,
   NULL,'[]',NULL,72,0,'2026-07-06T10:01:00.000Z','2026-07-06T10:01:00.000Z');

-- 2) ready_for_review · 긴 글 · 이미지 플랜 3슬롯 (실제 파일 미첨부)
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, llm_model, created_at, updated_at)
VALUES
  ('qa_d_02_review_long','qa_blog_ngym','[QA] 영등포 프리미엄 헬스장 200% 활용 가이드 (긴 글)',
   '시설·PT·GX를 아우르는 장문 리뷰 초안.',
   '## 영등포에서 프리미엄 피트니스를 만나다'||char(10)||char(10)||
   '영등포 직장인이라면 퇴근 후 운동 공간 선택이 늘 고민입니다. 엔짐 영등포점은 프리미엄 수입 장비와 넓은 프리웨이트존, 전문 트레이너 상주로 이 고민을 해결합니다.'||char(10)||char(10)||
   '### 1. 프리웨이트존'||char(10)||char(10)||
   '핵심 근육을 자극하는 프리웨이트 중심 구성으로, 초보자부터 상급자까지 단계별 루틴을 소화할 수 있습니다. 넉넉한 간격 배치로 붐비는 시간대에도 대기 스트레스가 적습니다.'||char(10)||char(10)||
   '[IMAGE:0]'||char(10)||char(10)||
   '### 2. 1:1 퍼스널 트레이닝'||char(10)||char(10)||
   '자세 교정과 목표 설정을 함께하는 1:1 PT 프로그램은 부상 없이 성과를 내는 가장 빠른 길입니다. 첫 방문 시 체성분 분석과 상담을 통해 개인별 루틴을 설계합니다.'||char(10)||char(10)||
   '[IMAGE:1]'||char(10)||char(10)||
   '### 3. GX 그룹운동'||char(10)||char(10)||
   '혼자 운동이 지루하다면 GX 스튜디오를 추천합니다. 다이내믹한 그룹 수업으로 유산소와 근력을 동시에 잡을 수 있습니다.'||char(10)||char(10)||
   '[IMAGE:2]'||char(10)||char(10)||
   '### 4. 편의 시설'||char(10)||char(10)||
   '운동 후 샤워실과 사우나에서 하루의 피로를 씻어내세요. 청결하게 관리되는 라커룸도 프리미엄 경험의 일부입니다.'||char(10)||char(10)||
   '### 마무리'||char(10)||char(10)||
   '영등포에서 제대로 된 운동 환경을 찾고 있다면, 지금 엔짐 영등포점 무료 상담을 예약해 보세요. 전문 트레이너가 목표 달성을 함께합니다.',
   '[{"slot":0,"role":"시설","description":"프리웨이트존 전경","needsUserShot":true},{"slot":1,"role":"PT","description":"1:1 PT 장면","needsUserShot":true},{"slot":2,"role":"GX","description":"GX 그룹운동","needsUserShot":true}]',
   '["영등포헬스장","프리미엄PT","GX","엔짐","시설소개"]','ready_for_review',1,
   82,'["⚠️ 이미지 3장 계획 대비 첨부 0장 — 발행 전 업로드 필요"]',88,620,0,'claude-sonnet-5',
   '2026-07-06T10:02:00.000Z','2026-07-06T10:02:00.000Z');

-- 3) ready_for_review · 짧은 글 · 이미지 없음
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, llm_model, created_at, updated_at)
VALUES
  ('qa_d_03_review_short','qa_blog_ngym','[QA] 여름 PT 특가 안내 (짧은 리뷰본)',
   '짧은 프로모션 안내 리뷰본.',
   '## 여름 PT 특가'||char(10)||char(10)||'여름 몸매를 위한 1:1 PT 특가를 진행합니다. 체험 신청 시 체성분 분석을 무료로 제공합니다. 자세한 내용은 무료 상담으로 확인하세요.',
   '[]','["PT특가","여름"]','ready_for_review',1,
   61,'["⚠️ 권장 길이 미달(1500자 미만)"]',70,88,0,'gpt-4o','2026-07-06T10:03:00.000Z','2026-07-06T10:03:00.000Z');

-- 4) approved · 이미지 2장 실제 첨부
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, llm_model, created_at, updated_at)
VALUES
  ('qa_d_04_approved_img','qa_blog_ngym','[QA] 엔짐 영등포 시설 투어 (승인·이미지 포함)',
   '이미지 2장이 첨부된 승인 완료 초안.',
   '## 엔짐 영등포 시설 투어'||char(10)||char(10)||
   '넓고 쾌적한 프리미엄 존을 소개합니다.'||char(10)||char(10)||
   '[IMAGE:0]'||char(10)||char(10)||
   '### 1:1 PT 룸'||char(10)||char(10)||
   '집중도 높은 1:1 PT 전용 공간입니다.'||char(10)||char(10)||
   '[IMAGE:1]'||char(10)||char(10)||
   '지금 무료 상담을 예약하세요.',
   '[{"slot":0,"role":"시설","description":"프리미엄 존"},{"slot":1,"role":"PT","description":"PT 룸"}]',
   '["시설투어","엔짐","영등포"]','approved',1,
   90,'[]',91,120,2,'claude-sonnet-5','2026-07-06T10:04:00.000Z','2026-07-06T10:04:00.000Z');

INSERT OR REPLACE INTO images
  (id, blog_id, draft_id, source, source_meta_json, file_path, mime_type, width, height, file_size, alt_text, caption, created_at, updated_at)
VALUES
  ('qa_img_01','qa_blog_ngym','qa_d_04_approved_img','user_upload','{"slot":0}','/storage/qa_ngym_gym.png','image/png',1200,800,6695,'프리미엄 존','엔짐 영등포 프리미엄 존','2026-07-06T10:04:10.000Z','2026-07-06T10:04:10.000Z'),
  ('qa_img_02','qa_blog_ngym','qa_d_04_approved_img','user_upload','{"slot":1}','/storage/qa_ngym_pt.png','image/png',1200,800,6205,'PT 룸','1:1 PT 전용 룸','2026-07-06T10:04:11.000Z','2026-07-06T10:04:11.000Z');

-- 5) published · 발행 완료 상태 (재렌더/재발행 UI 확인용)
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, llm_model,
   published_at, published_url, created_at, updated_at)
VALUES
  ('qa_d_05_published','qa_blog_ngym','[QA] 영등포 헬스장 첫 방문 후기 (발행 완료)',
   '이미 발행된 글 — published 상태 렌더 확인용.',
   '## 첫 방문 후기'||char(10)||char(10)||'엔짐 영등포점 첫 방문에서 느낀 프리미엄 경험을 정리했습니다. 깔끔한 시설과 친절한 트레이너 응대가 인상적이었습니다.'||char(10)||char(10)||'무료 상담으로 직접 확인해 보세요.',
   '[]','["후기","영등포헬스장"]','published',1,
   87,'[]',89,95,0,'claude-sonnet-5',
   '2026-07-05T09:00:00.000Z','https://blog.naver.com/qa_enzyme_ydp/qa05','2026-07-05T08:00:00.000Z','2026-07-05T09:00:00.000Z');

-- 6) ready_for_review · 중간 길이 · 이미지 없음 (반려→재작성 대상)
INSERT OR REPLACE INTO drafts
  (id, blog_id, title, summary, body_md, image_plan_json, tags_json, status, revision_round,
   seo_score, seo_issues_json, human_score, char_count, image_count, llm_model, created_at, updated_at)
VALUES
  ('qa_d_06_review_noimg','qa_blog_ngym','[QA] 직장인 아침 운동 루틴 (리뷰·이미지 없음)',
   '반려/재작성 플로우 테스트용 리뷰본.',
   '## 직장인 아침 운동 루틴'||char(10)||char(10)||
   '바쁜 직장인일수록 아침 운동이 하루의 컨디션을 좌우합니다. 엔짐 영등포점은 이른 아침에도 쾌적하게 운동할 수 있는 환경을 제공합니다.'||char(10)||char(10)||
   '가벼운 유산소로 몸을 깨우고, 프리웨이트로 근력을 더한 뒤, 스트레칭으로 마무리하는 30분 루틴을 추천합니다. 출근 전 짧은 시간에도 충분한 효과를 볼 수 있습니다.'||char(10)||char(10)||
   '지금 무료 상담을 예약하고 아침 운동 습관을 시작해 보세요.',
   '[]','["아침운동","직장인","루틴"]','ready_for_review',1,
   74,'[]',80,210,0,'gpt-4o','2026-07-06T10:06:00.000Z','2026-07-06T10:06:00.000Z');

COMMIT;
