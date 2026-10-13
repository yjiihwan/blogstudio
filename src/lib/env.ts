function required(key: string, fallback?: string) {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env: ${key}`);
    }
    return "";
  }
  return v;
}

export const env = {
  AUTH_SECRET: required(
    "AUTH_SECRET",
    "dev-secret-blog-studio-please-set-AUTH_SECRET"
  ),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
  APP_URL: required("APP_URL", "http://localhost:3001"),
  // 환경 분리(staging/prod) + 발행 dry-run 게이트. 상세 판별은 lib/publish/mode.ts.
  BLOG_STUDIO_ENV: process.env.BLOG_STUDIO_ENV ?? "",
  PUBLISH_DRY_RUN: process.env.PUBLISH_DRY_RUN ?? "",
  BLOG_STUDIO_SKIP_SEED: process.env.BLOG_STUDIO_SKIP_SEED ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL_DRAFT:
    process.env.ANTHROPIC_MODEL_DRAFT ?? "claude-sonnet-4-6",
  ANTHROPIC_MODEL_REVIEW:
    process.env.ANTHROPIC_MODEL_REVIEW ?? "claude-haiku-4-5-20251001",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  // 글 생성·재작성·사람화 모델. gpt-4o(구형) → gpt-5.5 → GPT-6 Astra(2026-10 전환).
  // Astra 는 Chat Completions 에서 max_completion_tokens·reasoning_effort 를 받고 max_tokens 는 거부(400).
  // 단가는 gpt-5.5 의 2배($10/$50 per 1M) — llm/index.ts PRICES_USD_PER_M 와 함께 갱신할 것.
  OPENAI_MODEL_DRAFT: process.env.OPENAI_MODEL_DRAFT ?? "gpt-6-astra",
  // 검수(approve/revise/reject 판정)·설정 개선안 제안 모델. 글작성 모델(Astra)과 «다른» 모델로 교차검증하는 것이
  // 목적이라 gpt-5.5 + 추론 강도 high 고정(llm/index.ts role="review"). 옛 기본값 gpt-5.5-mini 는 OpenAI 에 없는 모델.
  OPENAI_MODEL_REVIEW: process.env.OPENAI_MODEL_REVIEW ?? "gpt-5.5",
  // «이미 보류·거절된 제안과 같은 문제인가» 같은 단순 유사판정 잔무용 저비용 모델($2/$10 per 1M, role="review_lite").
  OPENAI_MODEL_REVIEW_LITE: process.env.OPENAI_MODEL_REVIEW_LITE ?? "gpt-6.1-sol",
  // 이미지 품질·묘사 일치 심사(비전) 모델. 지시된 gpt-5.5-mini 는 OpenAI 모델 목록에 없어(404)
  // 비전 지원 mini급 중 가장 저렴한 gpt-5.4-mini($0.75/$4.50 per 1M) 를 기본값으로 둔다.
  OPENAI_MODEL_IMAGE_JUDGE: process.env.OPENAI_MODEL_IMAGE_JUDGE ?? "gpt-5.4-mini",
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY ?? "",
  PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? "",
  NAVER_OPENAPI_CLIENT_ID: process.env.NAVER_OPENAPI_CLIENT_ID ?? "",
  NAVER_OPENAPI_CLIENT_SECRET: process.env.NAVER_OPENAPI_CLIENT_SECRET ?? "",
};

export const hasAnthropic = () => env.ANTHROPIC_API_KEY.length > 0;
export const hasOpenAI = () => env.OPENAI_API_KEY.length > 0;
