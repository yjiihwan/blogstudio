import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3는 네이티브 모듈이므로 번들링 대상에서 제외
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["*.trycloudflare.com", "*.loca.lt", "100.85.154.17"],
};

export default nextConfig;
