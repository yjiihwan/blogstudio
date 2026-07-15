-- 이번 delta 만 적용: 이모지 강도 컬럼(0~3, nullable=자동).
-- 나머지 컬럼(owner_id·age_group·facilities_json 등)은 이전에 reconcile.ts 로 이미 보강됨 —
-- generate 가 스냅샷 누락분을 함께 재출력했으나 중복 ADD 는 실 DB 에서 실패하므로 제거한다.
-- 런타임 스키마 보강의 실제 소스는 src/db/reconcile.ts(멱등) 이다.
ALTER TABLE `personas` ADD `emoji_intensity` integer;
