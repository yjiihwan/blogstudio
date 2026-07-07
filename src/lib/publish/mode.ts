// 환경(staging/prod/local)과 "실발행 vs 모의발행(dry-run)" 단일 판별 지점.
// WHY: staging(테스트 서버)에서 실블로그/외부알림이 절대 안 나가도록, 발행 부작용을
// 내보내기 직전에 이 게이트로 강제 분기한다. 판별 로직을 한 곳에 모아 UI/서버액션/
// 어댑터가 동일한 결론을 쓰게 한다(불일치로 인한 "테스트인데 실발행" 사고 방지).

export type BlogEnv = "prod" | "staging" | "local";

/** 현재 환경. BLOG_STUDIO_ENV 최우선, 미설정 시 NODE_ENV로 보수적 추정(로컬). */
export function blogEnv(): BlogEnv {
  const raw = (process.env.BLOG_STUDIO_ENV ?? "").trim().toLowerCase();
  if (raw === "staging" || raw === "stage") return "staging";
  if (raw === "prod" || raw === "production") return "prod";
  // 미설정: 명시하지 않았으면 프로덕션 취급하지 않는다(안전측). 배포 시엔 반드시 설정.
  return process.env.NODE_ENV === "production" ? "prod" : "local";
}

export function isStaging(): boolean {
  return blogEnv() === "staging";
}

/**
 * 실제 외부 발행을 막을지(=모의발행) 여부.
 * 우선순위: PUBLISH_DRY_RUN 명시 플래그 > 환경(staging은 기본 dry-run).
 * prod/local은 플래그가 없으면 실발행.
 */
export function isPublishDryRun(): boolean {
  const flag = (process.env.PUBLISH_DRY_RUN ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return blogEnv() === "staging";
}

export function publishModeLabel(): "dry_run" | "live" {
  return isPublishDryRun() ? "dry_run" : "live";
}

/** 화면 상단 배너 노출 여부/문구 소스. staging이거나 dry-run이면 경고를 띄운다. */
export function envBanner(): { show: boolean; label: string; tone: "staging" } | null {
  if (blogEnv() === "staging" || isPublishDryRun()) {
    return {
      show: true,
      label: "테스트 서버(STAGING) — 발행은 모의실행되며 실제 블로그에는 올라가지 않습니다",
      tone: "staging",
    };
  }
  return null;
}
