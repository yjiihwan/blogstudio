# 네이버 후기 코퍼스 수집 — 현재 상태 (2026-08-04)

## 상태: ⏸ **블로커 2건으로 대기 중 (수집 0편)**

지시 순서상 1번(공식 API 키 확인)에서 멈췄다. 임의 키 발급·결제·크롤링은 하지 않았다.

### 블로커 ① 네이버 오픈API 키 없음

확인한 곳 전부 비어 있음:

| 위치 | 결과 |
|---|---|
| `~/blog_studio/.env.local` | `AUTH_SECRET / APP_URL / DATABASE_URL / ENCRYPTION_KEY` 4개뿐 — 네이버 키 없음 |
| `settings` 테이블(로컬 DB) | `anthropic_api_key / telegram_bot_token / openai_api_key / unsplash_access_key / pexels_api_key / google_ai_api_key` — 네이버 키 없음 |
| Railway `blogstudio` production 변수 | 없음 |
| Railway `blogstudio` staging 변수 | 없음 |
| 다른 프로젝트 `.env.local`(sally / franchise_app / norder_app / ad_studio_v2 / agent_orchestrator) | 없음 |

`.env.example`과 `src/lib/env.ts:35-36`에 `NAVER_OPENAPI_CLIENT_ID` / `NAVER_OPENAPI_CLIENT_SECRET`
슬롯은 **선언만 되어 있고 값이 없으며, 코드 어디에서도 사용되지 않는다**(grep 결과 env.ts 2줄이 전부).

→ 형이 네이버 개발자센터에서 발급한 키를 `.env.local`에 넣어주면 즉시 수집 시작 가능.

### 블로커 ② 공식 API는 본문을 주지 않음 (지시 2번 사유)

네이버 블로그 검색 오픈API 응답은 항목당 `title` + `description`(약 200자 요약 스니펫, 개행 제거,
검색어 위치 기준 발췌)만 준다. 이 범위로 **산출 가능/불가**를 나누면:

| 산출물 A 항목 | 요약 스니펫만으로 |
|---|---|
| 종결어미 분포 상위 10 | ⭕ 가능 |
| 군말·구어 표지 빈도 | ⭕ 가능(문서 단위 등장률) |
| 평균 문장 길이 | △ 부분 가능(절단 문장 오차) |
| **도입부(첫 2~3문장) 유형 분포** | ❌ 불가 — 스니펫이 글 앞부분이라는 보장 없음 |
| **평균 문단 길이 / 글 전체 길이 분포** | ❌ 불가 — 200자 절단, 개행 제거 |
| **마무리 문장 패턴** | ❌ 불가 — 스니펫에 글 끝부분 미포함 |
| **❌/⭕ 대조쌍 20개** | ❌ 사실상 불가 — 온전한 원문 문장이 필요 |

즉 **이번 작업의 핵심 산출물(도입부 유형 · 마무리 패턴 · 대조쌍 20개)은 요약만으로는 만들 수 없다.**
본문 수집 허가 여부를 형이 결정해야 한다. 허가 전 본문 크롤링은 하지 않는다.

## 준비 완료된 것 (키만 오면 바로 실행)

- `scripts/collect_review_corpus.mts` — 14개 카테고리 × 검색어 4개, 카테고리당 15편 목표.
  순차 요청(동시 연결 1), 요청 간 1.2초 딜레이, 광고·협찬 표지 18종 필터,
  작성자 ID/닉네임/블로그 URL 미저장(링크는 sha256 앞 16자 `doc_id`로만 중복 제거).
  키 없으면 첫 줄에서 종료(네트워크 호출 0) — 실행해 확인함.
- `scripts/analyze_review_corpus.mts` — 산출물 A 정량부 + 산출물 B 생성.
  본문 유무를 자동 감지해, 불가 지표는 **"데이터 부족"**으로 명시 출력(창작 금지).
- `.gitignore`에 `/data/review_corpus/raw/` 추가 — 제3자 블로그 텍스트라 저장소 커밋 제외.
  리포트(`report_style.md` / `report_material.md`)와 스크립트만 커밋 대상.

## 형이 결정해야 할 것 2가지

1. 네이버 오픈API 키를 발급해 전달할지 (또는 발급을 나에게 지시할지)
2. 요약 스니펫만으로 축소 진행할지 / **본문 수집을 허가**할지
   (허가 시에도 순차·1초 딜레이·robots 준수·내부 참고용 보관 원칙 유지)
