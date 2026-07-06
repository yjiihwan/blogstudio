"use client";

import { useEffect, useState } from "react";

// 인증된 앱 전 페이지(초안 큐/발행 포함)의 에러 바운더리.
// WHY: 이게 없으면 서버 액션(예: '발행 완료로 표시')이 프로덕션에서 실패할 때
// — 버전 스큐(Failed to find Server Action)든 모바일 웹뷰의 요청 중단(ECONNRESET)이든 —
// 에러가 루트까지 전파돼 인앱 웹뷰가 자기네 native "This page couldn't load" 죽은화면을
// 띄운다(앱 밖으로 튕겨 복구 불가). 이 경계를 두면 같은 실패를 앱 안의
// "다시 시도" 화면으로 흡수해 사용자가 컨텍스트를 잃지 않고 재시도할 수 있다.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  // 버전 스큐 추정 시 1회에 한해 하드 리로드로 최신 클라이언트 번들을 받아 자동 복구.
  // 무한 루프 방지: sessionStorage 가드로 세션당 1번만 자동 새로고침한다.
  const isSkew =
    /Failed to find Server Action|deployment|Server Action/i.test(
      error?.message ?? ""
    );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSkew) return;
    const KEY = "bs_auto_reloaded";
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    setReloading(true);
    window.location.reload();
  }, [isSkew]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-500 text-2xl">
          !
        </div>
        <h1 className="text-lg font-semibold text-ink-900">
          잠시 문제가 생겼어요
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {reloading
            ? "최신 버전으로 새로고침 중입니다…"
            : "요청을 처리하지 못했습니다. 대부분 일시적인 문제로, 다시 시도하면 정상 동작합니다."}
        </p>

        {!reloading && (
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => reset()}
              className="w-full rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.99]"
            >
              다시 시도
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 active:scale-[0.99]"
            >
              페이지 새로고침
            </button>
            <a
              href="/queue"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-ink-400"
            >
              초안 큐로 돌아가기
            </a>
          </div>
        )}

        {error?.digest && (
          <p className="mt-4 text-[11px] text-ink-300">오류코드 {error.digest}</p>
        )}
      </div>
    </div>
  );
}
