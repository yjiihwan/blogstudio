"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle, ClipboardCopy, ExternalLink, HelpCircle, ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { LOG_EVENT_LABEL, LOG_STATUS_LABEL, maskPhone, statusTone, type LogStatus } from "@/lib/notify/alimtalk-core";
import { SETUP_VENDORS, TEMPLATE_STATE_LABEL, VENDOR_CATALOG, type FieldGuide, type SetupVendor } from "@/lib/notify/alimtalk-setup-core";
import type { LogRow, SetupView } from "@/lib/notify/alimtalk-config";
import {
  clearAlimtalkLogsAction,
  confirmAlimtalkTestAction,
  resetAlimtalkAction,
  saveAlimtalkKeysAction,
  saveAlimtalkTemplatesAction,
  selectAlimtalkVendorAction,
  sendAlimtalkTestAction,
  toggleSmsFallbackAction,
  verifyAlimtalkConnectionAction,
  type SetupActionState,
} from "./alimtalk-actions";

/* «알림 채널 (카카오 알림톡)» 카드 — 개발자 없이 셀프 연동(그릴박스 발주앱 마법사 이식, 2026-10-13)
   상단 체크리스트 4칸 상시 → 탭 «연동 설정»(5단계 마법사 + 문자 대체발송) / «발송 이력»(최근 100건)
   체크리스트 4개가 모두 녹색이면 서버가 자동으로 실발송. 키 원문은 이 컴포넌트에 절대 내려오지 않는다(끝 4자리만). */

type Step = 1 | 2 | 3 | 4 | 5;
type Props = { setup: SetupView; logs: LogRow[]; adminPhoneMasked: string | null; latestTest: LogRow | null };

const fmt = (iso?: string) => (iso ? formatDateTime(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z") : "");

export function AlimtalkCard({ setup, logs, adminPhoneMasked, latestTest }: Props) {
  const [tab, setTab] = useState<"setup" | "logs">("setup");
  const live = setup.mode.mode === "live";
  return (
    <div data-testid="alimtalk-card">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-base">알림 채널 (카카오 알림톡)</h2>
          {live ? (
            <Badge tone="leaf" data-testid="alimtalk-mode-badge">실발송 중</Badge>
          ) : (
            <Badge tone="sky" data-testid="alimtalk-mode-badge">드라이런(기록만)</Badge>
          )}
          {setup.source === "env" && <Badge tone="amber" data-testid="alimtalk-env-badge">서버 설정이 우선 적용 중</Badge>}
          {setup.mockEnabled && <Badge tone="outline" data-testid="alimtalk-mock-badge">모의 응답 모드(테스트서버)</Badge>}
        </div>
        <div className="flex gap-1 rounded-lg bg-paper-200 p-0.5" role="tablist">
          <TabBtn active={tab === "setup"} onClick={() => setTab("setup")} testId="alimtalk-tab-setup">연동 설정</TabBtn>
          <TabBtn active={tab === "logs"} onClick={() => setTab("logs")} testId="alimtalk-tab-logs">발송 이력{logs.length ? ` (${logs.length})` : ""}</TabBtn>
        </div>
      </div>
      <p className="text-sm text-ink-600 leading-relaxed mb-3">
        회원가입 대기(관리자)·계정 승인/거부·비밀번호 재설정·게시물 발행 알림을 카카오 알림톡으로 보냅니다. 받는 번호는 각 계정의 <strong>내 계정 → 알림(카카오 알림톡)</strong>에서 등록합니다.
      </p>

      {setup.failureBanner && (
        <div className="rounded-lg bg-red-50 border border-red-300 px-3 py-2.5 text-sm text-red-900 mb-3 flex gap-2 items-start" data-testid="alimtalk-failure-banner">
          <ShieldAlert className="size-5 shrink-0 text-red-600" />
          <div>
            <b>최근 24시간 동안 알림 발송이 {setup.failed24h}건 실패했습니다.</b> 업체 잔액 부족·키 만료·템플릿 변경이 흔한 원인입니다. «연결 확인»을 눌러 보고, «발송 이력» 탭에서 실패 사유를 확인해 주세요.
          </div>
        </div>
      )}

      {/* ── 체크리스트(상시) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2" data-testid="alimtalk-checklist">
        {setup.checklist.map((c) => (
          <div key={c.key} data-testid={`alimtalk-check-${c.key}`} data-ok={c.ok ? "1" : "0"} className={`rounded-lg border px-2.5 py-1.5 ${c.ok ? "bg-leaf-100/60 border-leaf-500/30" : "bg-paper-50 border-paper-300"}`}>
            <div className={`text-xs font-bold flex items-center gap-1 ${c.ok ? "text-leaf-500" : "text-ink-600"}`}>
              {c.ok ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />} {c.label}
            </div>
            <div className="text-[11px] text-ink-500 leading-snug mt-0.5 break-keep">{c.detail}</div>
          </div>
        ))}
      </div>
      <div className="text-xs mb-3" data-testid="alimtalk-mode-line">
        {live ? (
          <span className="text-leaf-500 font-semibold">✅ 4개 모두 완료 — 가입·승인·발행 알림이 실제로 카카오톡으로 나갑니다.</span>
        ) : (
          <span className="text-sky-700">🔎 지금은 드라이런(기록만). {setup.mode.mode === "dryrun" ? setup.mode.reason : ""} — 4개가 모두 녹색이 되면 자동으로 실발송으로 바뀝니다.</span>
        )}
      </div>

      {tab === "setup" ? <SetupWizard setup={setup} adminPhoneMasked={adminPhoneMasked} latestTest={latestTest} /> : <LogsTab logs={logs} />}
    </div>
  );
}

function TabBtn({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} data-testid={testId} className={`px-3 py-1 text-xs font-semibold rounded-md transition ${active ? "bg-paper-50 text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"}`}>
      {children}
    </button>
  );
}

/* ───────── 연동 설정 탭: 5단계 마법사 ───────── */
function SetupWizard({ setup, adminPhoneMasked, latestTest }: { setup: SetupView; adminPhoneMasked: string | null; latestTest: LogRow | null }) {
  const [open, setOpen] = useState<Step>(setup.openStep);
  useEffect(() => setOpen(setup.openStep), [setup.openStep]);
  const [modal, setModal] = useState<null | { kind: "vendor"; vendor: SetupVendor } | { kind: "keys" } | { kind: "reset" } | { kind: "clearlogs" }>(null);

  const [vendorState, vendorAction, vendorBusy] = useActionState<SetupActionState, FormData>(selectAlimtalkVendorAction, null);
  const [keysState, keysAction, keysBusy] = useActionState<SetupActionState, FormData>(saveAlimtalkKeysAction, null);
  const [connState, connAction, connBusy] = useActionState<SetupActionState, FormData>(verifyAlimtalkConnectionAction, null);
  const [tplState, tplAction, tplBusy] = useActionState<SetupActionState, FormData>(saveAlimtalkTemplatesAction, null);
  const [sendState, sendAction, sendBusy] = useActionState<SetupActionState, FormData>(sendAlimtalkTestAction, null);
  const [testState, testAction, testBusy] = useActionState<SetupActionState, FormData>(confirmAlimtalkTestAction, null);
  const [fbState, fbAction, fbBusy] = useActionState<SetupActionState, FormData>(toggleSmsFallbackAction, null);
  const [resetState, resetAction, resetBusy] = useActionState<SetupActionState, FormData>(resetAlimtalkAction, null);
  const [clearState, clearAction, clearBusy] = useActionState<SetupActionState, FormData>(clearAlimtalkLogsAction, null);

  /* 단계가 자동으로 넘어가면 그 단계 안의 결과문이 접혀 안 보인다 → 가장 최근 동작 결과를 단계 목록 아래에 항상 보인다 */
  const [lastNote, setLastNote] = useState<SetupActionState>(null);
  useEffect(() => setLastNote(vendorState), [vendorState]);
  useEffect(() => setLastNote(keysState), [keysState]);
  useEffect(() => setLastNote(connState), [connState]);
  useEffect(() => setLastNote(tplState), [tplState]);
  useEffect(() => setLastNote(sendState), [sendState]);
  useEffect(() => setLastNote(testState), [testState]);
  useEffect(() => setLastNote(fbState), [fbState]);
  useEffect(() => setLastNote(resetState), [resetState]);
  useEffect(() => setLastNote(clearState), [clearState]);

  const vendorFormRef = useRef<HTMLFormElement>(null);
  const vendorPick = useRef<HTMLInputElement>(null);
  const keysFormRef = useRef<HTMLFormElement>(null);
  const keysConfirm = useRef<HTMLInputElement>(null);
  const resetFormRef = useRef<HTMLFormElement>(null);
  const resetConfirm = useRef<HTMLInputElement>(null);
  const clearFormRef = useRef<HTMLFormElement>(null);
  const clearConfirm = useRef<HTMLInputElement>(null);

  const vendor = setup.vendor;
  const info = vendor ? VENDOR_CATALOG[vendor] : null;
  const envFirst = setup.source === "env";
  const doneBy = Object.fromEntries(setup.checklist.map((c) => [c.key, c.ok])) as Record<string, boolean>;
  const stepDone: Record<Step, boolean> = { 1: !!vendor, 2: setup.hasKeys, 3: doneBy.connected && doneBy.profile, 4: doneBy.templates, 5: doneBy.testReceived };
  const testArrived = !!latestTest && (latestTest.status === "sent" || latestTest.status === "sms_sent");

  const pickVendor = (v: SetupVendor) => {
    if (vendor && vendor !== v && setup.hasKeys) {
      setModal({ kind: "vendor", vendor: v });
      return;
    }
    submitVendor(v);
  };
  const submitVendor = (v: SetupVendor) => {
    if (vendorPick.current) vendorPick.current.value = v;
    vendorFormRef.current?.requestSubmit();
  };
  const onKeysSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (setup.hasKeys && keysConfirm.current?.value !== "1") {
      e.preventDefault();
      setModal({ kind: "keys" });
    }
  };

  return (
    <div className="rounded-2xl border border-paper-300 bg-paper-100/60 p-3 sm:p-4" data-testid="alimtalk-setup">
      {envFirst && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 mb-3" data-testid="alimtalk-env-note">
          서버 환경변수(ALIMTALK_PROVIDER 등)가 들어 있어 <b>그 설정으로 발송</b>합니다. 아래 마법사에서 저장한 값은 환경변수를 지우기 전까지 쓰이지 않습니다. 환경변수 삭제는 개발 담당에게 요청하세요.
        </div>
      )}

      <ol className="space-y-1.5">
        <StepShell n={1} title="업체 선택" done={stepDone[1]} open={open === 1} onOpen={() => setOpen(1)} summary={info ? info.label : "아직 안 골랐음"}>
          <form ref={vendorFormRef} action={vendorAction}>
            <input ref={vendorPick} type="hidden" name="vendor" defaultValue={vendor ?? ""} />
          </form>
          <div className="grid sm:grid-cols-2 gap-2 mb-2">
            {SETUP_VENDORS.filter((v) => !VENDOR_CATALOG[v].advanced).map((v) => (
              <VendorCard key={v} v={v} selected={vendor === v} busy={vendorBusy} onPick={() => pickVendor(v)} />
            ))}
          </div>
          <details className="text-xs" data-testid="alimtalk-advanced">
            <summary className="cursor-pointer text-ink-500 select-none">고급(개발자용) — 범용 HTTP 중계</summary>
            <div className="mt-2">
              <VendorCard v="http" selected={vendor === "http"} busy={vendorBusy} onPick={() => pickVendor("http")} />
            </div>
          </details>
        </StepShell>

        <StepShell n={2} title="키 입력" done={stepDone[2]} open={open === 2} onOpen={() => setOpen(2)} summary={!vendor ? "업체를 먼저 고르세요" : setup.hasKeys ? `저장됨 · ${fmt(setup.savedAt)}` : "아직 입력 전"}>
          {!info || !vendor ? (
            <p className="text-xs text-ink-500">1단계에서 업체를 먼저 골라 주세요.</p>
          ) : (
            <form ref={keysFormRef} action={keysAction} onSubmit={onKeysSubmit} className="space-y-2.5" data-testid="alimtalk-keys-form">
              <input type="hidden" name="vendor" value={vendor} />
              <input ref={keysConfirm} type="hidden" name="confirm" defaultValue="" />
              {info.fields.map((f) => (
                <KeyField key={f.name} f={f} current={setup.fields.find((x) => x.name === f.name)} />
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="submit" variant="accent" size="sm" disabled={keysBusy} data-testid="alimtalk-keys-save">
                  {keysBusy ? "저장 중…" : setup.hasKeys ? "키 바꿔 저장" : "암호화해 저장"}
                </Button>
                <span className="text-[11px] text-ink-500">저장 뒤에는 끝 4자리만 보입니다. 빈 칸은 기존 값을 그대로 둡니다.</span>
              </div>
            </form>
          )}
        </StepShell>

        <StepShell n={3} title="연결 확인" done={stepDone[3]} open={open === 3} onOpen={() => setOpen(3)} summary={setup.status.connected ? `${setup.status.connected.ok && setup.status.connected.profileFound ? "성공" : "실패"} · ${fmt(setup.status.connected.at)}` : "아직 확인 전"}>
          <p className="text-xs text-ink-600 mb-2">업체에 잔액과 발신프로필(카카오 채널) 목록을 물어봐 키가 맞는지 확인합니다. 실제 발송은 하지 않습니다.</p>
          <form action={connAction} className="flex items-center gap-2 flex-wrap">
            <Button type="submit" variant="accent" size="sm" disabled={connBusy || !setup.hasKeys} data-testid="alimtalk-verify">
              {connBusy ? "확인 중…" : "연결 확인"}
            </Button>
            {setup.status.connected && (
              <span className="text-xs text-ink-600" data-testid="alimtalk-conn-status">
                마지막 확인: {setup.status.connected.ok && setup.status.connected.profileFound ? "✅" : "⚠️"} {setup.status.connected.message}
              </span>
            )}
          </form>
        </StepShell>

        <StepShell n={4} title="템플릿 등록·확인(6종)" done={stepDone[4]} open={open === 4} onOpen={() => setOpen(4)} summary={`${setup.templates.filter((t) => t.ready).length}/5 완료`}>
          {info && (
            <ol className="text-xs text-ink-700 space-y-1 mb-2 list-decimal pl-5">
              {info.templateSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 mb-3" data-testid="alimtalk-template-warn">
            ⚠️ 심사 통과 후 <b>글자 하나라도 바꾸면 재심사</b>를 받아야 합니다(발송도 거부됨). 아래 문구를 «복사» 버튼으로 그대로 붙여넣고, 문구를 고치고 싶으면 등록 전에 개발 담당에게 알려 주세요.
          </div>
          <form action={tplAction} className="space-y-3" data-testid="alimtalk-template-form">
            {setup.templates.map((t) => (
              <div key={t.event} className="rounded-xl border border-paper-300 bg-paper-50 p-3" data-testid={`alimtalk-template-${t.event}`} data-ready={t.ready ? "1" : "0"}>
                <TemplateBox name={t.name} text={t.text} testId={`alimtalk-template-${t.event}`} />
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="w-56">
                    <Label htmlFor={`tpl-${t.event}`}>템플릿 코드(심사 승인 뒤)</Label>
                    <Input id={`tpl-${t.event}`} name={`tpl_${t.event}`} defaultValue={t.code} placeholder={vendor === "aligo" ? "TP_1234" : "KA01TP…"} maxLength={100} disabled={envFirst} />
                  </div>
                  <span className="text-xs text-ink-600 pb-2" data-testid={`alimtalk-template-state-${t.event}`}>
                    {t.ready ? "✅ " : ""}
                    {t.state ? TEMPLATE_STATE_LABEL[t.state] : t.code ? "미확인" : "코드 없음"}
                    {t.checkedAt ? ` · ${fmt(t.checkedAt)}` : ""}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="submit" variant="accent" size="sm" disabled={tplBusy || !stepDone[3] || envFirst} data-testid="alimtalk-template-verify">
                {tplBusy ? "조회 중…" : "템플릿 확인"}
              </Button>
              {!stepDone[3] && <span className="text-[11px] text-ink-500">3단계 «연결 확인»을 먼저 통과해야 합니다.</span>}
            </div>
          </form>
        </StepShell>

        <StepShell n={5} title="테스트 발송" done={stepDone[5]} open={open === 5} onOpen={() => setOpen(5)} summary={setup.status.testReceived ? `도착 확인 · ${fmt(setup.status.testReceived.at)}` : "아직 확인 전"}>
          <ol className="text-xs text-ink-700 space-y-1 mb-2 list-decimal pl-5">
            <li>
              관리자 본인 휴대폰 번호가 필요합니다: {adminPhoneMasked ? <b>{adminPhoneMasked}</b> : <a href="/account" className="underline text-accent-600">내 계정 → 알림(카카오 알림톡)</a>}
              {adminPhoneMasked ? "" : " 에서 먼저 등록해 주세요."}
            </li>
            <li>«테스트 발송»을 누릅니다. 1~4단계가 끝났으면 실제로 카카오톡이 갑니다.</li>
            <li>휴대폰에 도착하면 <b>«받았어요»</b>를 눌러 주세요. 그때부터 모든 알림이 실제로 나갑니다.</li>
          </ol>
          <div className="flex items-center gap-2 flex-wrap">
            <form action={sendAction}>
              <Button type="submit" variant="accent" size="sm" disabled={sendBusy || !adminPhoneMasked || !stepDone[2]} data-testid="alimtalk-test-send">
                {sendBusy ? "보내는 중…" : "테스트 발송"}
              </Button>
            </form>
            <form action={testAction}>
              <Button type="submit" variant={stepDone[5] ? "secondary" : "primary"} size="sm" disabled={testBusy || !testArrived || stepDone[5]} data-testid="alimtalk-test-confirm">
                {stepDone[5] ? "받았어요 ✓" : testBusy ? "저장 중…" : "받았어요"}
              </Button>
            </form>
            <span className="text-xs text-ink-600" data-testid="alimtalk-latest-test">
              {latestTest ? `최근 테스트: ${maskPhone(latestTest.to)} · ${LOG_STATUS_LABEL[latestTest.status]} · ${fmt(latestTest.createdAt)}${latestTest.error ? ` · ${latestTest.error}` : ""}` : "아직 테스트 발송 기록이 없습니다."}
            </span>
          </div>
        </StepShell>
      </ol>

      <div data-testid="alimtalk-last-note">
        <ResultNote state={lastNote} />
      </div>

      {/* ── 문자 대체발송 ── */}
      <form action={fbAction} className="flex items-center gap-3 rounded-xl border border-paper-300 bg-paper-50 px-3 py-2.5 mt-3" data-testid="alimtalk-fallback">
        <div className="flex-1 text-xs">
          <div className="font-semibold">알림톡 실패 시 문자(SMS/LMS)로 대체발송</div>
          <div className="text-ink-500">카카오톡 미가입·수신 차단 등으로 알림톡이 안 가면 같은 내용을 문자로 보냅니다. 문자 요금(건당 약 10~30원)이 별도로 붙습니다. 승인 안내가 안 가면 사용자가 로그인 시점을 모르니 켬을 권장합니다.</div>
        </div>
        <Badge tone={setup.smsFallback ? "leaf" : "neutral"} data-testid="alimtalk-fallback-badge">{setup.smsFallback ? "켬" : "끔"}</Badge>
        <Button type="submit" size="sm" variant="secondary" disabled={fbBusy} data-testid="alimtalk-fallback-toggle">
          {fbBusy ? "…" : setup.smsFallback ? "끄기" : "켜기"}
        </Button>
      </form>

      <details className="mt-3 text-xs" data-testid="alimtalk-reset-box">
        <summary className="cursor-pointer text-ink-500 select-none">연동 초기화(키·확인 결과·템플릿 코드 삭제) · 발송 이력 비우기</summary>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <form ref={resetFormRef} action={resetAction}>
            <input ref={resetConfirm} type="hidden" name="confirm" defaultValue="" />
            <Button type="button" size="sm" variant="ghost" disabled={resetBusy || !vendor} onClick={() => setModal({ kind: "reset" })} data-testid="alimtalk-reset">
              연동 초기화
            </Button>
          </form>
          <form ref={clearFormRef} action={clearAction}>
            <input ref={clearConfirm} type="hidden" name="confirm" defaultValue="" />
            <Button type="button" size="sm" variant="ghost" disabled={clearBusy} onClick={() => setModal({ kind: "clearlogs" })} data-testid="alimtalk-clear-logs">
              발송 이력 비우기
            </Button>
          </form>
        </div>
      </details>

      {modal && (
        <ConfirmModal
          title={modal.kind === "vendor" ? "업체를 바꿀까요?" : modal.kind === "keys" ? "저장된 키를 덮어쓸까요?" : modal.kind === "clearlogs" ? "발송 이력을 모두 지울까요?" : "연동을 초기화할까요?"}
          body={
            modal.kind === "vendor"
              ? `지금 ${info?.label ?? ""} 키가 저장돼 있습니다. ${VENDOR_CATALOG[modal.vendor].label} 로 바꾸면 기존 키·연결 확인·템플릿 코드가 모두 지워지고 드라이런으로 돌아갑니다.`
              : modal.kind === "keys"
                ? "기존 키 위에 새 값을 저장합니다. 저장 뒤 «연결 확인»·«템플릿 확인»·«받았어요»를 다시 해야 하며, 그동안은 드라이런(기록만)으로 돌아갑니다."
                : modal.kind === "clearlogs"
                  ? "발송 이력 전체를 지웁니다(테스트 기록 정리용). 연동 설정과 키는 그대로 둡니다."
                  : "저장된 키와 확인 결과·템플릿 코드를 모두 지웁니다. 알림은 드라이런(기록만)으로 돌아갑니다."
          }
          confirmLabel={modal.kind === "vendor" ? "업체 바꾸기" : modal.kind === "keys" ? "덮어쓰기" : modal.kind === "clearlogs" ? "비우기" : "초기화"}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const m = modal;
            setModal(null);
            if (m.kind === "vendor") submitVendor(m.vendor);
            else if (m.kind === "keys") {
              if (keysConfirm.current) keysConfirm.current.value = "1";
              keysFormRef.current?.requestSubmit();
            } else if (m.kind === "clearlogs") {
              if (clearConfirm.current) clearConfirm.current.value = "1";
              clearFormRef.current?.requestSubmit();
            } else {
              if (resetConfirm.current) resetConfirm.current.value = "1";
              resetFormRef.current?.requestSubmit();
            }
          }}
        />
      )}
    </div>
  );
}

/* ───────── 발송 이력 탭 ───────── */
function LogsTab({ logs }: { logs: LogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-paper-300 px-3 py-6 text-xs text-ink-500 text-center" data-testid="alimtalk-logs-empty">
        아직 발송 이력이 없습니다. 회원가입·승인·발행이 일어나면 여기에 기록됩니다(드라이런도 기록).
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-paper-300 overflow-hidden" data-testid="alimtalk-logs">
      <div className="px-3 py-2 text-[11px] text-ink-500 bg-paper-100 border-b border-paper-300">최근 {logs.length}건 (최대 100건) · 번호는 가운데를 가립니다</div>
      <ul className="divide-y divide-paper-200 max-h-[480px] overflow-y-auto">
        {logs.map((l) => (
          <li key={l.id} className="px-3 py-2 text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5" data-testid="alimtalk-log-row" data-status={l.status}>
            <span className="text-ink-400 tabular-nums w-[7.5rem] shrink-0">{fmt(l.createdAt)}</span>
            <StatusBadge s={l.status} />
            <span className="font-semibold text-ink-800">{LOG_EVENT_LABEL[l.event] ?? l.event}</span>
            <span className="text-ink-600">{l.userName ? `${l.userName} · ` : ""}{l.to ? maskPhone(l.to) : "(번호 없음)"}</span>
            {l.templateCode && <span className="text-ink-400">{l.templateCode}</span>}
            {l.error && <span className="text-red-700 basis-full sm:basis-auto break-all">{l.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
function StatusBadge({ s }: { s: LogStatus }) {
  const t = statusTone(s);
  const cls = t === "red" ? "bg-red-100 text-red-700" : "";
  return (
    <Badge tone={t === "red" ? "neutral" : t} className={cls}>
      {LOG_STATUS_LABEL[s]}
    </Badge>
  );
}

/* ───────── 조각 ───────── */
function StepShell({ n, title, done, open, onOpen, summary, children }: { n: Step; title: string; done: boolean; open: boolean; onOpen: () => void; summary: string; children: React.ReactNode }) {
  return (
    <li className={`rounded-xl border bg-paper-50 ${open ? "border-accent-500/60 shadow-sm" : "border-paper-300"}`} data-testid={`alimtalk-step-${n}`} data-done={done ? "1" : "0"} data-open={open ? "1" : "0"}>
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left" data-testid={`alimtalk-step-${n}-head`}>
        <span className={`shrink-0 size-6 rounded-full text-xs font-bold flex items-center justify-center ${done ? "bg-leaf-500 text-white" : open ? "bg-accent-500 text-white" : "bg-paper-200 text-ink-600"}`}>{done ? "✓" : n}</span>
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-[11px] text-ink-500 truncate max-w-[55%]">{summary}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-0.5 border-t border-paper-200">{children}</div>}
    </li>
  );
}

function VendorCard({ v, selected, busy, onPick }: { v: SetupVendor; selected: boolean; busy: boolean; onPick: () => void }) {
  const i = VENDOR_CATALOG[v];
  return (
    <div className={`rounded-xl border p-3 ${selected ? "border-accent-500 bg-accent-50/40 ring-1 ring-accent-300" : "border-paper-300 bg-paper-50"}`} data-testid={`alimtalk-vendor-${v}`} data-selected={selected ? "1" : "0"}>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-sm">{i.label}</span>
        {selected && <Badge tone="accent">선택됨</Badge>}
      </div>
      <div className="text-xs text-ink-600 mb-1">{i.blurb}</div>
      <div className="text-[11px] text-ink-500 mb-2">{i.fee}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" size="sm" variant={selected ? "secondary" : "accent"} disabled={busy || selected} onClick={onPick} data-testid={`alimtalk-pick-${v}`}>
          {selected ? "선택됨" : "이 업체로"}
        </Button>
        {i.signupUrl && (
          <a href={i.signupUrl} target="_blank" rel="noreferrer" className="text-[11px] text-accent-600 underline inline-flex items-center gap-0.5">
            가입·콘솔 열기 <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function KeyField({ f, current }: { f: FieldGuide; current?: { masked: string; set: boolean } }) {
  const [help, setHelp] = useState(false);
  const id = `at-${f.name}`;
  return (
    <div data-testid={`alimtalk-field-${f.name}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Label htmlFor={id}>{f.label}</Label>
        {current?.set && (
          <span className="text-[11px] text-leaf-500 tabular-nums" data-testid={`alimtalk-masked-${f.name}`}>
            저장됨 {current.masked}
          </span>
        )}
        <button type="button" onClick={() => setHelp((v) => !v)} className="text-[11px] text-accent-600 underline inline-flex items-center gap-0.5 ml-auto" data-testid={`alimtalk-help-${f.name}`}>
          <HelpCircle className="size-3" /> 어디서 찾나요?
        </button>
      </div>
      {help && (
        <ul className="text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 my-1 space-y-0.5 list-disc pl-6" data-testid={`alimtalk-help-${f.name}-body`}>
          {f.where.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <Input id={id} name={f.name} type={f.secret ? "password" : "text"} autoComplete="off" inputMode={f.name === "senderPhone" ? "tel" : undefined} placeholder={current?.set ? `저장됨 ${current.masked} — 바꾸려면 새 값 입력` : f.placeholder} maxLength={f.name === "httpUrl" ? 1000 : 500} />
    </div>
  );
}

function TemplateBox({ name, text, testId }: { name: string; text: string; testId: string }) {
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(""), 2500);
  };
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-xs font-semibold">템플릿 이름: {name}</span>
        <Button type="button" size="sm" variant="outline" onClick={copy} data-testid={`${testId}-copy`}>
          <ClipboardCopy className="size-3.5" /> 복사
        </Button>
        {copied === "ok" && <span className="text-[11px] text-leaf-500" data-testid={`${testId}-copied`}>복사했습니다 — 업체 콘솔 템플릿 내용에 붙여넣으세요</span>}
        {copied === "fail" && <span className="text-[11px] text-red-700">복사가 막혔습니다. 아래 문구를 드래그해 복사해 주세요.</span>}
      </div>
      <pre className="whitespace-pre-wrap text-xs bg-paper-100 border border-paper-300 rounded-lg px-3 py-2 font-sans select-all" data-testid={`${testId}-text`}>
        {text}
      </pre>
    </div>
  );
}

function ResultNote({ state }: { state: SetupActionState }) {
  if (!state) return null;
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${state.ok ? "bg-leaf-100/60 border-leaf-500/30 text-leaf-500" : state.tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-red-50 border-red-200 text-red-800"}`} data-testid="alimtalk-result">
      {state.ok ? "✅ " : state.tone === "warn" ? "🔎 " : "⚠️ "}
      {state.message}
      {state.checks && state.checks.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 list-disc pl-5" data-testid="alimtalk-result-checks">
          {state.checks.map((c) => (
            <li key={c.event}>
              <b>{LOG_EVENT_LABEL[c.event]}</b>: {c.code || "(코드 없음)"} — {c.state ? TEMPLATE_STATE_LABEL[c.state] : "미확인"} · {c.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onCancel, onConfirm }: { title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="alimtalk-confirm-modal">
      <div className="bg-paper-50 rounded-2xl shadow-xl max-w-md w-full p-5">
        <div className="font-bold text-base mb-2">{title}</div>
        <p className="text-sm text-ink-700 mb-4 leading-relaxed">{body}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} data-testid="alimtalk-modal-cancel">취소</Button>
          <Button type="button" variant="accent" size="sm" onClick={onConfirm} data-testid="alimtalk-modal-confirm">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
