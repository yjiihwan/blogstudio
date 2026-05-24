# Blog Studio — 네이버 블로그 자동화 스튜디오

여러 네이버 블로그 계정에 페르소나 가이드를 등록해두면, AI가 매주 주제 리서치
→ 본문 작성 → 이미지 큐레이션 → 승인 → 발행까지 대신 처리합니다.

- **스택**: Next.js 16 (App Router) + TypeScript + Tailwind 4 + Drizzle ORM (SQLite dev / Postgres prod)
- **LLM**: Anthropic Claude API (Sonnet 4.6 기본, Opus 4.7 옵션) — 키 미연결 시 mock 모드로 흐름 확인 가능
- **이미지**: 직접 촬영 요청 큐 + Unsplash/Pexels + Firefly (운영 시 키 등록)
- **인증**: JWT(jose) + bcrypt
- **발행 방식**: "복사 + 네이버 에디터 열기" (수동 붙여넣기) — ToS·저품질 리스크 최소화
- **스케줄러**: cron tick 스크립트 + jitter (자연스러운 발행 시간)
- **품질 가드**: SEO 10가지 + 휴먼 톤 7가지 자동 채점 + 금지어 차단

## 처음부터 다시 띄우는 법

```bash
cd /Users/ideagent/blog_studio

# 1) 의존성
npm install

# 2) DB 스키마 + 데모 시드
npm run db:push
npm run db:seed

# 3) 개발 서버
AUTH_SECRET="dev-secret-blog-studio-please-set" npm run dev
# → http://localhost:3000
```

## 데모 계정

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 본사/오너 | admin@blogstudio.local | studio1234! |

## Anthropic API 키 연결 (실 LLM 모드 활성화)

1. https://console.anthropic.com 에서 키 발급
2. 프로젝트 루트의 `.env.local` 파일에 한 줄 추가:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. `npm run dev` 재시작
4. 어드민 → 설정 화면에서 "연결됨" 상태 확인

미연결 상태에서도 모든 화면·플로우는 동작합니다 (자리표시 텍스트로 생성).

## 자동 스케줄러 등록 (옵션)

맥 launchd / cron 한 줄 등록:

```bash
*/5 * * * *  cd /Users/ideagent/blog_studio && /usr/local/bin/npm run -s cron:tick >> /tmp/blog_cron.log 2>&1
```

5분마다 체크해서 cron 도래한 블로그만 자동 초안 생성. jitter 설정으로 실제 실행 시각은 ±N분 흔들립니다.

## 외부 접속 (모바일 PWA 테스트)

```bash
brew install cloudflared           # 한 번만
cloudflared tunnel --url http://localhost:3000
# 출력에서 https://xxxx.trycloudflare.com URL 사용
```

## 구조

```
src/
├── app/
│   ├── (auth)/login            # 로그인
│   └── (app)/                  # 인증 후 모든 화면
│       ├── dashboard           # 오늘 검토할 글, KPI, 예정 스케줄, Quick Actions
│       ├── queue               # 초안 큐 + 새 초안 생성 + 초안 상세 (좌 미리보기 / 우 검토패널)
│       ├── blogs               # 블로그·페르소나 카드 + 추가/편집
│       ├── photos              # 사진 요청 큐 (휴대폰 촬영·업로드)
│       ├── schedule            # 스케줄 + cron 등록 가이드
│       ├── insights            # 노출 분석 (운영 시 활성화)
│       └── settings            # API 키·이미지 소스·알림 채널 설정
├── components/
│   ├── ui/                     # button·input·card·badge·label·chips-input
│   ├── app-shell.tsx           # 어드민 레이아웃 (사이드바·모바일 하단탭)
│   ├── persona-editor.tsx      # 브랜드 브리프 입력 폼 (섹션화)
│   ├── draft-review.tsx        # 좌측 미리보기 / 우측 승인·반려·점수 패널
│   └── status-badge.tsx
├── db/
│   ├── schema.ts               # 11개 테이블 Drizzle 스키마
│   ├── client.ts               # SQLite 연결
│   └── seed.ts                 # 데모 시드 (블로그 2개 + 페르소나 + 초안)
└── lib/
    ├── auth.ts                 # 세션·쿠키·해시
    ├── pipeline.ts             # 초안 생성 4단계 (주제→아웃라인→본문→점수)
    ├── llm/                    # Anthropic SDK + 프롬프트 + mock 폴백
    ├── scoring.ts              # SEO 10가지 + 휴먼 톤 7가지 휴리스틱
    ├── markdown.ts             # 미리보기용 MD→HTML 변환
    └── env.ts
scripts/
├── cron_tick.ts                # 스케줄러 (5분 간격)
├── make_token.ts               # 테스트용 JWT 발급
└── screenshot.ts               # puppeteer-core 자동 캡처
```

## 운영 진입 전 체크리스트

- [ ] Anthropic API 키 등록 → 실 LLM 모드 전환
- [ ] AUTH_SECRET 운영 키로 교체
- [ ] DB 마이그레이션: SQLite → Postgres (Supabase/Neon)
- [ ] Vercel 배포 + 커스텀 도메인
- [ ] launchd/cron 등록 (또는 Vercel Cron 전환)
- [ ] Unsplash/Pexels API 키 등록 (자동 이미지 소스)
- [ ] 노출 추적 자동화 (네이버 검색 일일 폴링 → ranking_snapshots)
- [ ] 외부 알림 채널 (텔레그램/슬랙/이메일) 연결
- [ ] 각 블로그의 페르소나·금지어·CTA를 실제 운영 가이드로 다듬기
- [ ] 첫 글 발행 → 실 노출 추이 확인 후 페르소나 반복 튜닝
