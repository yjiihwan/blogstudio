# 블로그 스튜디오 — 배포 흐름 (staging / prod 2환경)

Railway 프로젝트 `blogstudio` 안에 **두 개의 환경**을 둔다. 샐리(Sally)와 동일한 구조.

| 환경 | Railway environment | Git 브랜치(트리거) | DB(볼륨) | 발행 | 도메인 |
|---|---|---|---|---|---|
| **prod (실서버)** | `production` | `main` | 볼륨 A `/data` (실데이터) | **실발행(live)** | https://blogstudio-ide.asia |
| **staging (테스트)** | `staging` | `staging` | 볼륨 B `/data` (더미/시드) | **모의발행(dry-run)** | (staging 도메인) |

두 환경은 **DB·환경변수·연동키가 완전히 격리**된다. staging에서 무엇을 해도 실서버/실블로그에 영향 없음.

---

## 1. 환경변수 (환경별로 다르게 설정)

| 변수 | prod | staging | 설명 |
|---|---|---|---|
| `BLOG_STUDIO_ENV` | `prod` | `staging` | 환경 식별자. 배너·발행모드·시드가드의 기준 |
| `PUBLISH_DRY_RUN` | (미설정=live) | `1` | staging은 반드시 `1`(모의발행 강제) |
| `BLOG_STUDIO_SKIP_SEED` | `1` | (미설정) | prod=파괴적 시드 차단. staging=데모 시드 허용 |
| `DATABASE_URL` | `/data/blog_studio.db` | `/data/blog_studio.db` | 경로는 같아도 **볼륨이 달라 물리적으로 별개 파일** |
| `ANTHROPIC_API_KEY`, `NAVER_*`, `TELEGRAM_*` | 실 계정 키 | **비움 또는 테스트 키** | 연동 계정 분리 |
| `APP_URL` | `https://blogstudio-ide.asia` | staging 도메인 | |
| `AUTH_SECRET`, `ENCRYPTION_KEY` | 실 시크릿 | staging 전용 시크릿 | 세션·암호화 분리 |

> **판별 규칙** (`src/lib/publish/mode.ts`): `PUBLISH_DRY_RUN`이 있으면 그 값이 최우선.
> 없으면 `BLOG_STUDIO_ENV=staging`은 자동 dry-run, `prod`는 실발행. 안전측 기본값이라 staging에 플래그가 빠져도 실발행이 나가지 않는다.

---

## 2. 배포 3단계 (로컬 → staging → prod)

```
① 로컬        : 코드 수정 → npx tsc --noEmit && npm run build 로 검증
② staging     : git push origin staging      → staging 환경 자동배포 → 육안/헬스 검증
③ prod        : git checkout main
                git merge --ff-only staging   → main 반영
                git push origin main          → production 환경 자동배포
```

- **절대 main에 먼저 push하지 않는다.** staging에서 검증한 커밋만 `--ff-only`로 prod에 올린다.
- 롤백: `git revert <sha> && git push origin main`(prod) 또는 Railway 대시보드에서 이전 deployment로 rollback.

### 검증 커맨드
```bash
# 환경/발행모드/배포 SHA 확인 (비밀 아님)
curl -s https://blogstudio-ide.asia/api/health        # → env:"prod",    publish:"live"
curl -s https://<staging-domain>/api/health           # → env:"staging", publish:"dry_run"
```

---

## 3. Railway 환경 구성 (최초 1회)

```bash
# staging 환경을 production 복제로 생성 (서비스·변수 복사, 볼륨은 새로 생성=DB 격리)
railway environment new staging --duplicate production

# staging 환경 변수 오버라이드
railway environment link staging
railway variables --set BLOG_STUDIO_ENV=staging --set PUBLISH_DRY_RUN=1
railway variables --set ANTHROPIC_API_KEY= --set NAVER_OPENAPI_CLIENT_ID= --set NAVER_OPENAPI_CLIENT_SECRET=
# (staging 전용 AUTH_SECRET/APP_URL/도메인 지정)

# prod 보호 변수
railway environment link production
railway variables --set BLOG_STUDIO_ENV=prod --set BLOG_STUDIO_SKIP_SEED=1
```

### ⚠️ 환경별 브랜치 트리거 (Sally에서 검증된 함정)
`railway service source connect --branch`는 브랜치를 **서비스 전역**으로 적용해 두 환경을
같은 브랜치로 덮어쓴다(공유 서비스). 환경별 브랜치는 **GraphQL `deploymentTriggerUpdate`**로
각 트리거를 개별 지정해야 한다:
- staging 트리거 → `staging` 브랜치
- production 트리거 → `main` 브랜치

설정 후 반드시 양방향 검증: staging push→staging만 배포(prod deployId 불변),
main push→prod만 배포(staging 불변).

---

## 4. staging 데모 데이터
staging은 새 볼륨이라 부팅 시 `instrumentation`이 전체 스키마를 만들고
`ensureAdminSeed`가 관리자(admin@blogstudio.local / studio1234!)를 생성한다 → 즉시 로그인 가능.
데모 블로그/페르소나가 필요하면 staging 환경에서 1회:
```bash
railway run --environment staging npm run db:push   # 스키마 보강
railway run --environment staging npm run db:seed    # 데모 데이터(prod에선 가드가 차단)
```

## 5. 발행 dry-run 게이트 (staging 안전장치)
- 모든 발행 경로는 `src/lib/publish/adapter.ts`의 `runPublish()`를 통과한다.
- dry-run이면 외부 알림(텔레그램)·실업로드를 **호출하지 않고** 로그만 남기며,
  `publishes.method="dry_run"`, `notes="[DRY-RUN] …"`로 기록한다.
- 향후 네이버 오픈API 실업로드 어댑터가 붙어도 이 게이트를 지나므로 staging 유출이 원천 차단된다.
