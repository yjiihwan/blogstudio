import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blog Studio — 네이버 블로그 자동화 스튜디오",
  description:
    "주제 리서치부터 초안 생성, 이미지 큐레이션, 승인 발행까지 — 작가 한 사람의 흐름으로.",
  applicationName: "Blog Studio",
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-paper-100 text-ink-800 antialiased">
        {children}
      </body>
    </html>
  );
}
