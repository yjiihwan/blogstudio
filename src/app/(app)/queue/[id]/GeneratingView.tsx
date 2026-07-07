"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/**
 * 백그라운드 생성 중 초안 페이지 — 4초마다 서버 컴포넌트를 새로고침해
 * status 가 ready_for_review/failed 로 바뀌면 자동으로 실제 검토 화면으로 전환된다.
 * 생성은 요청과 분리돼 백그라운드에서 돌기 때문에, 이 페이지를 닫아도 계속 진행된다.
 */
export function GeneratingView({ createdAtMs }: { createdAtMs: number }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000))),
      1000
    );
    const poll = setInterval(() => router.refresh(), 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [createdAtMs, router]);

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const stuck = elapsed > 480; // 8분 초과 = 지연/중단 의심

  return (
    <div className="rounded-2xl border border-paper-300 bg-paper-50 p-8 lg:p-12 text-center max-w-3xl">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-accent-50">
        {stuck ? (
          <Sparkles className="size-6 text-accent-500" />
        ) : (
          <Loader2 className="size-6 animate-spin text-accent-500" />
        )}
      </div>
      <h2 className="text-lg font-bold text-ink-900">
        {stuck ? "생성이 예상보다 오래 걸리고 있어요" : "AI가 초안을 작성하고 있어요"}
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        주제 구상 → 개요 → 본문 → 자연스러운 문장 다듬기 → 사실 검증 순서로 진행됩니다.
        <br />
        보통 <strong>3~5분</strong> 정도 걸리며, 완료되면 이 화면이 자동으로 바뀝니다.
      </p>
      <p className="mt-4 font-mono text-2xl font-bold tracking-tight text-ink-800">
        {mm}:{ss}
      </p>
      {stuck ? (
        <p className="mt-4 text-xs text-amber-700">
          10분이 넘도록 바뀌지 않으면 일시적 오류일 수 있어요. 잠시 후에도 그대로면 새 초안으로
          다시 시도해 주세요.
        </p>
      ) : (
        <p className="mt-4 text-xs text-ink-400">
          이 페이지를 닫아도 생성은 계속됩니다. 완료되면 텔레그램으로도 알려드려요.
        </p>
      )}
    </div>
  );
}
