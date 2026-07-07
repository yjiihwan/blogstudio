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
  OPENAI_MODEL_DRAFT: process.env.OPENAI_MODEL_DRAFT ?? "gpt-4o",
  OPENAI_MODEL_REVIEW: process.env.OPENAI_MODEL_REVIEW ?? "gpt-4o-mini",
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY ?? "",
  PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? "",
  NAVER_OPENAPI_CLIENT_ID: process.env.NAVER_OPENAPI_CLIENT_ID ?? "",
  NAVER_OPENAPI_CLIENT_SECRET: process.env.NAVER_OPENAPI_CLIENT_SECRET ?? "",
};

export const hasAnthropic = () => env.ANTHROPIC_API_KEY.length > 0;
export const hasOpenAI = () => env.OPENAI_API_KEY.length > 0;
