import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // 네이티브 모듈 및 번들러 비호환 패키지는 외부로 분리
  serverExternalPackages: ["better-sqlite3", "openai", "@anthropic-ai/sdk"],
  experimental: {
    // 서버 액션 기본 본문 제한 1MB → 반자동 '직접 첨부' 사진 업로드 수용 위해 상향.
    // (사진 여러 장 첨부 시 1MB 초과로 "Body exceeded 1 MB limit" 500이 났었음.)
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // 프록시(구 middleware) 본문 한도(기본 10MB)도 함께 상향 — 안 하면 큰 업로드가
    // 10MB에서 잘려 "Unexpected end of form"으로 실패한다.
    proxyClientMaxBodySize: "100mb",
  },
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.loca.lt",
    "100.85.154.17",
    // Tailscale 호스트명 접속 시 /_next dev 리소스(클라이언트 JS) 차단 방지.
    // 막히면 페이지는 SSR로 보이나 하이드레이션이 안 돼 모든 버튼이 죽는다.
    "ide-macmini.taila25bd1.ts.net",
    "*.taila25bd1.ts.net",
    "*.ts.net",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
