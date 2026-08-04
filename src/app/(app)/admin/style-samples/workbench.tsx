"use client";

/**
 * 메모장형 2단 편집기 — 좌: 목록(카테고리 필터 + 검색), 우: 편집.
 * 긴 원문을 붙여넣다 날리는 사고를 막기 위해 (1)미저장 상태 표시 (2)이탈 경고
 * (beforeunload + 다른 샘플 선택 시 확인) 를 둔다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Search, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { STYLE_CATEGORIES, type StyleSampleConfig } from "@/lib/style-samples-core";
import { computeStyleMetrics } from "@/lib/style-metrics";
import {
  saveSampleAction,
  deleteSampleAction,
  saveConfigAction,
  recomputeMetricsAction,
  type SampleInput,
} from "./actions";

type Row = {
  id: string;
  category: string;
  title: string;
  body: string;
  sourceUrl: string;
  memo: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
};

type Editing = Omit<Row, "updatedAt" | "id"> & { id: string | null };

const blank = (category: string): Editing => ({
  id: null,
  category,
  title: "",
  body: "",
  sourceUrl: "",
  memo: "",
  isActive: true,
  sortOrder: 0,
});

const toInput = (e: Editing): SampleInput => ({
  id: e.id,
  category: e.category,
  title: e.title,
  body: e.body,
  sourceUrl: e.sourceUrl,
  memo: e.memo,
  isActive: e.isActive,
  sortOrder: e.sortOrder,
});

export function StyleSampleWorkbench({
  samples,
  config,
}: {
  samples: Row[];
  config: StyleSampleConfig;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of STYLE_CATEGORIES) m[c] = 0;
    for (const s of samples) m[s.category] = (m[s.category] ?? 0) + 1;
    return m;
  }, [samples]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return samples.filter(
      (s) =>
        (filter === "all" || s.category === filter) &&
        (!needle || s.title.toLowerCase().includes(needle))
    );
  }, [samples, filter, q]);

  // 이탈 경고 — 저장 안 된 원문이 있으면 브라우저 기본 확인창을 띄운다.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function confirmLeave(): boolean {
    if (!dirty) return true;
    return window.confirm("저장하지 않은 내용이 있습니다. 그래도 이동할까요?");
  }

  function patch(p: Partial<Editing>) {
    setEditing((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
    setError(null);
  }

  function openRow(r: Row) {
    if (!confirmLeave()) return;
    setEditing({ ...r });
    setDirty(false);
    setError(null);
  }

  function openNew() {
    if (!confirmLeave()) return;
    setEditing(blank(filter === "all" ? STYLE_CATEGORIES[0] : filter));
    setDirty(false);
    setError(null);
    setTimeout(() => bodyRef.current?.focus(), 0);
  }

  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    const res = await saveSampleAction(toInput(editing));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing({ ...editing, id: res.id });
    setDirty(false);
    setToast("저장했습니다.");
    router.refresh();
  }

  async function remove() {
    if (!editing?.id || busy) return;
    if (!window.confirm(`"${editing.title || "제목 없음"}" 샘플을 삭제할까요?`)) return;
    setBusy(true);
    await deleteSampleAction(editing.id);
    setBusy(false);
    setEditing(null);
    setDirty(false);
    setToast("삭제했습니다.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ConfigBar
        config={config}
        onSaved={() => setToast("설정을 저장했습니다.")}
        onRecomputed={(msg) => setToast(msg)}
      />

      {/* 편집 패널이 닫혀 있어도 재계산 결과가 보이도록 상단에도 토스트를 둔다. */}
      {toast && !editing && (
        <div className="rounded-lg border border-leaf-500/40 bg-leaf-500/10 px-3 py-2 text-sm text-ink-700">
          {toast}
        </div>
      )}

      {/* 카테고리별 등록 개수 — 어디가 비었는지 한눈에 */}
      <div className="rounded-lg border border-paper-300 bg-paper-50 p-3">
        <div className="flex flex-wrap gap-1.5">
          <CountChip
            label="전체"
            n={samples.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {STYLE_CATEGORIES.map((c) => (
            <CountChip
              key={c}
              label={c}
              n={counts[c] ?? 0}
              active={filter === c}
              onClick={() => setFilter(c)}
            />
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* ============ 좌: 목록 ============ */}
        <div className="rounded-lg border border-paper-300 bg-paper-50 overflow-hidden">
          <div className="p-2.5 border-b border-paper-300 space-y-2">
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="제목 검색"
                className="pl-8 h-9"
              />
            </div>
            <Button size="sm" className="w-full" onClick={openNew} type="button">
              <Plus className="size-4" /> 새 샘플
            </Button>
          </div>

          <ul className="max-h-[62vh] overflow-y-auto divide-y divide-paper-200">
            {visible.length === 0 && (
              <li className="p-6 text-center text-sm text-ink-400">
                등록된 샘플이 없습니다.
              </li>
            )}
            {visible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => openRow(s)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-paper-200/60 transition ${
                    editing?.id === s.id ? "bg-paper-200" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-ink-800 text-paper-100">
                      {s.category}
                    </span>
                    {s.isActive ? (
                      <span className="text-[11px] text-leaf-500 font-semibold">활성</span>
                    ) : (
                      <span className="text-[11px] text-ink-400 font-semibold">비활성</span>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {s.title || "(제목 없음)"}
                  </div>
                  <div className="text-[11px] text-ink-400">
                    {s.body.length.toLocaleString()}자 · 순서 {s.sortOrder}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ============ 우: 편집 ============ */}
        <div className="rounded-lg border border-paper-300 bg-paper-50 p-4">
          {!editing ? (
            <div className="py-24 text-center text-sm text-ink-400">
              왼쪽에서 샘플을 고르거나 <b>새 샘플</b>을 눌러 원문을 붙여넣으세요.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {dirty ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <AlertTriangle className="size-3.5" /> 저장 안 됨
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-leaf-500">
                      <Check className="size-3.5" /> 저장됨
                    </span>
                  )}
                  {toast && <span className="text-xs text-ink-500">{toast}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {editing.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={remove}
                      disabled={busy}
                    >
                      <Trash2 className="size-4" /> 삭제
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={save} disabled={busy}>
                    <Save className="size-4" /> 저장
                  </Button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid sm:grid-cols-[160px_1fr] gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-ink-600">카테고리</span>
                  <select
                    value={editing.category}
                    onChange={(e) => patch({ category: e.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm outline-none focus:border-ink-700"
                  >
                    {STYLE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink-600">제목</span>
                  <Input
                    className="mt-1"
                    value={editing.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="예: 강남 헬스장 3개월 다닌 후기 (문체 좋음)"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-ink-600">
                  본문 (원문 그대로 · {editing.body.length.toLocaleString()}자)
                </span>
                <Textarea
                  ref={bodyRef}
                  className="mt-1 font-normal leading-relaxed"
                  rows={20}
                  value={editing.body}
                  onChange={(e) => patch({ body: e.target.value })}
                  placeholder="네이버 블로그 후기 원문을 그대로 붙여넣으세요. 마크다운으로 변환하지 않습니다."
                />
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-ink-600">출처 URL (선택)</span>
                  <Input
                    className="mt-1"
                    value={editing.sourceUrl}
                    onChange={(e) => patch({ sourceUrl: e.target.value })}
                    placeholder="https://blog.naver.com/..."
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink-600">
                    메모 (선택 — 이 글의 어디가 좋은지)
                  </span>
                  <Input
                    className="mt-1"
                    value={editing.memo}
                    onChange={(e) => patch({ memo: e.target.value })}
                    placeholder="예: 군말 섞는 리듬이 자연스러움"
                  />
                </label>
              </div>

              <MetricsPanel body={editing.body} />

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.isActive}
                    onChange={(e) => patch({ isActive: e.target.checked })}
                    className="size-4"
                  />
                  활성 (프롬프트에 주입)
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  정렬 순서
                  <Input
                    type="number"
                    value={editing.sortOrder}
                    onChange={(e) => patch({ sortOrder: Number(e.target.value) || 0 })}
                    className="h-9 w-24"
                  />
                  <span className="text-xs text-ink-400">작을수록 먼저 주입</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 문체 지표 — 읽기 전용. 서버가 저장할 때 쓰는 것과 «같은 순수 함수»로 즉석 계산해서,
 * 붙여넣는 순간 바로 보이고 저장분과 어긋나지도 않는다. 차트 없이 담백한 목록.
 */
function MetricsPanel({ body }: { body: string }) {
  const m = useMemo(() => computeStyleMetrics(body), [body]);
  if (!m.sentenceCount) {
    return (
      <div className="rounded-lg border border-paper-300 bg-paper-100 px-3 py-2.5 text-xs text-ink-400">
        문체 지표 — 본문을 붙여넣으면 자동으로 계산됩니다.
      </div>
    );
  }
  const pct = (t: { label: string; ratio: number }) => `${t.label} ${t.ratio}%`;
  return (
    <div className="rounded-lg border border-paper-300 bg-paper-100 px-3 py-2.5">
      <div className="text-xs font-semibold text-ink-700 mb-2">
        문체 지표 <span className="font-normal text-ink-400">(자동 계산 · 읽기 전용)</span>
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <Row k="문장 길이">
          평균 <b className="tabular-nums">{m.avgSentenceChars}</b>자 · 중앙값{" "}
          <b className="tabular-nums">{m.medianSentenceChars}</b>자
        </Row>
        <Row k="최장 / 최단">
          <span className="tabular-nums">{m.longestSentence.chars}</span>자 /{" "}
          <span className="tabular-nums">{m.shortestSentence.chars}</span>자
        </Row>
        <Row k="분량">
          {m.totalChars.toLocaleString()}자 (공백 제외 {m.totalCharsNoSpace.toLocaleString()}자)
        </Row>
        <Row k="문단 / 문장">
          {m.paragraphCount}문단 · {m.sentenceCount}문장 · 문단당{" "}
          <b className="tabular-nums">{m.avgSentencesPerParagraph}</b>문장
        </Row>
        <Row k="도입부 유형">
          {m.introType === "unknown" ? (
            <span className="text-ink-400">unknown (규칙으로 판별 안 됨)</span>
          ) : (
            <>
              <b>{m.introType}</b>
              {m.introEvidence && (
                <span className="text-ink-400"> — {m.introEvidence}</span>
              )}
            </>
          )}
        </Row>
        <Row k="군말 빈도">
          1000자당 <b className="tabular-nums">{m.fillerPer1000}</b>회
        </Row>
        <Row k="종결어미 상위" wide>
          {m.endings.length ? m.endings.map(pct).join(" · ") : "—"}
        </Row>
        <Row k="구어체 군말" wide>
          {m.fillers.length
            ? m.fillers.map((f) => `${f.label} ${f.count}회`).join(" · ")
            : "—"}
        </Row>
        <Row k="문어체·번역투" wide>
          {m.formal.items.length || m.formal.passiveCount ? (
            <>
              {m.formal.items.map((f) => `${f.label} ${f.count}회`).join(" · ")}
              {m.formal.passiveCount > 0 && ` · 피동형 ${m.formal.passiveCount}회`}
              <span className="text-ink-400"> (1000자당 {m.formal.per1000}회)</span>
            </>
          ) : (
            <span className="text-leaf-500">없음 — 구어체로 잘 쓰인 글</span>
          )}
        </Row>
        <Row k="최장 문장" wide>
          <span className="text-ink-500 line-clamp-2">{m.longestSentence.text}</span>
        </Row>
      </dl>
      <p className="mt-2 text-[11px] text-ink-400">
        저장 시 이 값이 함께 기록되고, 같은 카테고리 활성 샘플의 평균이 «목표 문체»
        지시문으로 초안 프롬프트에 들어갑니다.
      </p>
    </div>
  );
}

function Row({
  k,
  wide,
  children,
}: {
  k: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2 flex gap-2" : "flex gap-2"}>
      <dt className="shrink-0 w-[76px] text-ink-500">{k}</dt>
      <dd className="min-w-0 text-ink-800">{children}</dd>
    </div>
  );
}

function CountChip({
  label,
  n,
  active,
  onClick,
}: {
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${
        active
          ? "bg-ink-800 text-paper-100 border-ink-800"
          : n === 0
            ? "bg-paper-100 text-ink-400 border-paper-300"
            : "bg-paper-100 text-ink-800 border-paper-300 hover:bg-paper-200"
      }`}
    >
      {label} <span className="tabular-nums">{n}</span>
    </button>
  );
}

function ConfigBar({
  config,
  onSaved,
  onRecomputed,
}: {
  config: StyleSampleConfig;
  onSaved: () => void;
  onRecomputed: (msg: string) => void;
}) {
  const router = useRouter();
  const [count, setCount] = useState(config.count);
  const [maxChars, setMaxChars] = useState(config.maxChars);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-paper-300 bg-paper-100 px-3 py-2.5 flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold text-ink-700">주입 설정</span>
      <label className="inline-flex items-center gap-1.5">
        편수
        <Input
          type="number"
          value={count}
          onChange={(e) => setCount(Number(e.target.value) || 0)}
          className="h-9 w-20"
        />
      </label>
      <label className="inline-flex items-center gap-1.5">
        편당 최대 글자수
        <Input
          type="number"
          value={maxChars}
          onChange={(e) => setMaxChars(Number(e.target.value) || 0)}
          className="h-9 w-28"
        />
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await saveConfigAction(count, maxChars);
          setBusy(false);
          onSaved();
          router.refresh();
        }}
      >
        설정 저장
      </Button>
      {/* 지표 도입 이전에 저장된 샘플·규칙 변경분을 한 번에 메꾼다. */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await recomputeMetricsAction(true);
          setBusy(false);
          onRecomputed(`문체 지표 재계산 완료 — ${r.scanned}편 중 ${r.updated}편 갱신`);
          router.refresh();
        }}
      >
        <RefreshCw className="size-4" /> 지표 재계산
      </Button>
      <span className="text-xs text-ink-400">
        편수 0 = 주입 안 함 · 상한 초과분은 앞부분만 사용
      </span>
    </div>
  );
}
