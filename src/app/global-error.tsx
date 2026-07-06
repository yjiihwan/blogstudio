"use client";

// 최후 방어선: 루트 레이아웃 렌더/서버 액션이 통째로 깨졌을 때(세그먼트 error.tsx가
// 못 잡는 layout 레벨 에러 포함) 인앱 웹뷰의 native "This page couldn't load" 대신
// 앱 안의 재시도 화면을 보여준다. global-error는 <html>/<body>를 직접 그려야 한다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
          background: "#fafaf9",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "360px",
            textAlign: "center",
            background: "#fff",
            border: "1px solid #e7e5e4",
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <h1 style={{ fontSize: "18px", margin: "0 0 8px", color: "#1c1917" }}>
            잠시 문제가 생겼어요
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#78716c",
              margin: "0 0 20px",
            }}
          >
            요청을 처리하지 못했습니다. 대부분 일시적인 문제로, 다시 시도하면
            정상 동작합니다.
          </p>
          <button
            onClick={() => reset()}
            style={{
              width: "100%",
              padding: "10px 16px",
              marginBottom: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
              background: "#ea580c",
              border: "none",
              borderRadius: "8px",
            }}
          >
            다시 시도
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#44403c",
              background: "#fff",
              border: "1px solid #e7e5e4",
              borderRadius: "8px",
            }}
          >
            페이지 새로고침
          </button>
          {error?.digest && (
            <p style={{ fontSize: "11px", color: "#a8a29e", marginTop: "16px" }}>
              오류코드 {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
