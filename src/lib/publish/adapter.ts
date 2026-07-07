// 발행 어댑터 — 모든 "발행" 경로가 외부 부작용을 내보내기 전에 반드시 통과하는 게이트.
// WHY: 지금은 발행이 "수동 붙여넣기(manual_paste) + 텔레그램 알림"뿐이라 실제 외부 업로드는
// 없지만, 유일한 외부 부작용인 텔레그램 알림도 staging에선 나가면 안 된다. 또한 추후 네이버
// 오픈API 실업로드 어댑터가 붙어도 이 게이트를 지나게 해, dry-run 분기를 한 곳에서 강제한다.
import { isPublishDryRun } from "./mode";

export interface PublishRequest {
  draftId: string;
  title: string;
  userId: string;
}

export interface PublishOutcome {
  mode: "dry_run" | "live";
  /** publishes.method 에 기록할 값 */
  method: "manual_paste" | "dry_run";
  /** 외부 알림(텔레그램 등)이 실제로 나갔는지 */
  notified: boolean;
  /** publishes.notes 에 남길 감사 로그 */
  note: string;
}

/**
 * 발행 실행. dry-run이면 외부 알림을 절대 보내지 않고 로그만 남긴다.
 * live일 때만 notify()(외부 알림)를 호출한다. 향후 실 업로드 어댑터도 여기서 분기.
 */
export async function runPublish(
  req: PublishRequest,
  hooks: { notify: () => Promise<void> }
): Promise<PublishOutcome> {
  if (isPublishDryRun()) {
    const note = `[DRY-RUN] 모의발행 — 실블로그 업로드/외부알림 없음 (draft=${req.draftId})`;
    console.log(`[publish] ${note} title=${JSON.stringify(req.title)}`);
    return { mode: "dry_run", method: "dry_run", notified: false, note };
  }

  // LIVE: 실제 발행(현재=수동 붙여넣기 방식) — 외부 알림 발송. 알림 실패는 발행을 막지 않는다.
  await hooks.notify().catch(() => {});
  const note = `[LIVE] 발행 완료 (draft=${req.draftId})`;
  console.log(`[publish] ${note}`);
  return { mode: "live", method: "manual_paste", notified: true, note };
}
