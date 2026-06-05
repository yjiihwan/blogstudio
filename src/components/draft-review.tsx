"use client";

import { useState, useTransition } from "react";
import { Textarea, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  ClipboardCopy,
  ExternalLink,
  AlertTriangle,
  Save,
  ChevronDown,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export type ReviewProps = {
  draftId: string;
  initialTitle: string;
  initialBody: string;
  initialSummary: string;
  imagePlan: Array<{
    slot: number;
    role: string;
    description: string;
    needsUserShot?: boolean;
  }>;
  imageUrls: Record<number, string>;
  seo: {
    score: number;
    checks: Array<{ ok: boolean; label: string; detail?: string }>;
  };
  human: {
    score: number;
    checks: Array<{ ok: boolean; label: string; detail?: string }>;
  };
  naverBlogId: string;
  blogName: string;
  status: string;
  /* Server actions */
  saveDraft: (formData: FormData) => Promise<void>;
  approveDraft: (formData: FormData) => Promise<void>;
  rejectAndRevise: (formData: FormData) => Promise<void>;
  markPublished: (formData: FormData) => Promise<void>;
};

const FEEDBACK_TAGS = [
  { value: "tone", label: "톤·말투" },
  { value: "structure", label: "구조" },
  { value: "fact", label: "사실 오류" },
  { value: "keyword", label: "키워드" },
  { value: "image", label: "이미지" },
  { value: "length", label: "길이" },
  { value: "ad", label: "광고티" },
];

export function DraftReview(p: ReviewProps) {
  const [title, setTitle] = useState(p.initialTitle);
  const [body, setBody] = useState(p.initialBody);
  const [summary, setSummary] = useState(p.initialSummary);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [showReject, setShowReject] = useState(false);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function toggleTag(v: string) {
    const next = new Set(tags);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setTags(next);
  }

  const imgMap: Record<number, { url: string }> = Object.fromEntries(
    Object.entries(p.imageUrls).map(([k, v]) => [Number(k), { url: v }])
  );
  const html = renderMarkdown(body, imgMap);

  async function doSave() {
    const fd = new FormData();
    fd.set("draftId", p.draftId);
    fd.set("title", title);
    fd.set("summary", summary);
    fd.set("bodyMd", body);
    startTransition(() => p.saveDraft(fd));
  }

  async function doApprove() {
    const fd = new FormData();
    fd.set("draftId", p.draftId);
    fd.set("title", title);
    fd.set("summary", summary);
    fd.set("bodyMd", body);
    startTransition(() => p.approveDraft(fd));
  }

  async function doReject() {
    const fd = new FormData();
    fd.set("draftId", p.draftId);
    fd.set("feedback", feedback);
    Array.from(tags).forEach((t) => fd.append("feedbackTags", t));
    startTransition(() => p.rejectAndRevise(fd));
  }

  async function copyAndOpenNaver() {
    /* Build Naver-paste payload: bold the H2s, paragraphs separated.
       For images we leave alt-text placeholders the user will fill in. */
    const naverText = body
      .replace(/^##\s+(.*)$/gm, "[$1]") // mark headings
      .replace(/<!--\s*IMG:slot=(\d+)\s*-->/g, "{이미지 $1}")
      .trim();
    const payload = `${title}\n\n${naverText}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
    window.open(
      `https://blog.naver.com/${p.naverBlogId}?Redirect=Write`,
      "_blank"
    );
  }

  async function markPub() {
    const fd = new FormData();
    fd.set("draftId", p.draftId);
    startTransition(() => p.markPublished(fd));
  }

  return (
    <div className="flex flex-col-reverse lg:grid lg:grid-cols-[1fr_360px] gap-6">
      {/* Left: preview / edit */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Tab active={tab === "preview"} onClick={() => setTab("preview")}>
            미리보기
          </Tab>
          <Tab active={tab === "edit"} onClick={() => setTab("edit")}>
            편집
          </Tab>
          <div className="grow" />
          <span className="text-[11px] text-ink-400">
            {body.replace(/\s+/g, "").length.toLocaleString()}자
          </span>
        </div>

        {tab === "preview" ? (
          <Card>
            <div className="px-7 lg:px-10 py-8 lg:py-12 max-w-[680px] mx-auto">
              <div className="text-xs text-ink-400 mb-1">
                {p.blogName}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-ink-900 leading-tight">
                {title}
              </h1>
              {summary && (
                <p className="mt-2 text-base text-ink-500 italic">
                  {summary}
                </p>
              )}
              <div
                className="prose-blog mt-8"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-base font-semibold h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="summary">요약</Label>
                <Input
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body">본문 (Markdown)</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={22}
                  className="font-mono text-[13px] leading-relaxed"
                />
                <p className="text-[11px] text-ink-400">
                  이미지 위치는 <code>&lt;!-- IMG:slot=0 --&gt;</code>{" "}
                  형식으로 적어둡니다. 발행 시 사진이 자동 삽입됩니다.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={doSave} disabled={pending} variant="secondary">
                  <Save className="size-4" />
                  변경사항 저장
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Image plan inline */}
        <div className="mt-4">
          <h3 className="text-sm font-bold mb-2">이미지 플랜 {p.imagePlan.length}장</h3>
          <ul className="grid sm:grid-cols-2 gap-2 text-xs">
            {p.imagePlan.map((img) => {
              const hasUrl = !!p.imageUrls[img.slot];
              return (
                <li
                  key={img.slot}
                  className="rounded-lg border border-paper-300 bg-paper-50 p-3 flex gap-3"
                >
                  <div
                    className={cn(
                      "size-14 shrink-0 rounded-md flex items-center justify-center font-bold text-sm",
                      hasUrl
                        ? "bg-leaf-100 text-leaf-500"
                        : img.needsUserShot
                          ? "bg-accent-100 text-accent-700"
                          : "bg-paper-200 text-ink-400"
                    )}
                  >
                    {hasUrl ? "✓" : img.slot}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-800 flex items-center gap-1 flex-wrap">
                      슬롯 {img.slot}
                      <span className="text-[10px] text-ink-400 font-normal">
                        ({img.role})
                      </span>
                      {img.needsUserShot && !hasUrl && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700">
                          직접 촬영 필요
                        </span>
                      )}
                    </div>
                    <div className="text-ink-500 mt-0.5">
                      {img.description}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Right: actions + scores */}
      <aside className="space-y-4 lg:sticky lg:top-6 self-start">
        {/* Approve / reject */}
        <Card>
          <CardContent className="space-y-3">
            <h3 className="font-bold text-sm">검토 결정</h3>

            {p.status === "ready_for_review" || p.status === "revising" ? (
              <>
                <Button
                  onClick={doApprove}
                  disabled={pending}
                  variant="accent"
                  size="lg"
                  className="w-full"
                >
                  <CheckCircle2 className="size-4" />
                  승인 — 발행 준비
                </Button>
                <Button
                  onClick={() => setShowReject(!showReject)}
                  variant="outline"
                  size="md"
                  className="w-full"
                >
                  <XCircle className="size-4" />
                  반려 + AI 재작성 요청
                  <ChevronDown
                    className={cn(
                      "size-3 transition",
                      showReject ? "rotate-180" : ""
                    )}
                  />
                </Button>

                {showReject && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1.5">
                      <Label>반려 사유 태그</Label>
                      <div className="flex flex-wrap gap-1">
                        {FEEDBACK_TAGS.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => toggleTag(t.value)}
                            className={cn(
                              "px-3 py-2 rounded-md text-[11px] font-semibold transition touch-manipulation min-h-[36px]",
                              tags.has(t.value)
                                ? "bg-accent-500 text-white"
                                : "bg-paper-200 text-ink-600 hover:bg-paper-300"
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>상세 코멘트</Label>
                      <Textarea
                        rows={4}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="어떤 부분이 어떻게 다듬어졌으면 좋겠는지 구체적으로…"
                      />
                    </div>
                    <Button
                      onClick={doReject}
                      disabled={pending || (!feedback && tags.size === 0)}
                      variant="danger"
                      size="md"
                      className="w-full"
                    >
                      <Sparkles className="size-4" />
                      피드백 보내고 다시 쓰기
                    </Button>
                  </div>
                )}
              </>
            ) : p.status === "approved" ? (
              <>
                <div className="text-xs text-leaf-500 font-semibold mb-2">
                  발행 준비 완료
                </div>
                <Button
                  onClick={copyAndOpenNaver}
                  variant="accent"
                  size="lg"
                  className="w-full"
                >
                  <ClipboardCopy className="size-4" />
                  {copied ? "복사됨 — 네이버 열림" : "복사 + 네이버 에디터 열기"}
                </Button>
                <Button
                  onClick={markPub}
                  disabled={pending}
                  variant="outline"
                  size="md"
                  className="w-full"
                >
                  <ExternalLink className="size-4" />
                  발행 완료로 표시
                </Button>
                <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">
                  네이버 에디터가 새 탭으로 열립니다. 본문 영역에 그대로
                  붙여넣고, 이미지는 슬롯 번호에 맞춰 직접 첨부해주세요.
                </p>
              </>
            ) : (
              <div className="text-sm text-ink-500">
                이 단계에서는 추가 결정이 필요하지 않습니다.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scores */}
        <ScoreCard
          label="SEO 점수"
          score={p.seo.score}
          checks={p.seo.checks}
        />
        <ScoreCard
          label="휴먼 톤 점수"
          score={p.human.score}
          checks={p.human.checks}
        />
      </aside>
    </div>
  );
}

function Tab({
  active,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      {...rest}
      className={cn(
        "px-3 h-9 rounded-md text-xs font-semibold transition touch-manipulation",
        active
          ? "bg-paper-50 text-ink-900 shadow-sm border border-paper-300"
          : "text-ink-500 hover:text-ink-800"
      )}
    />
  );
}

function ScoreCard({
  label,
  score,
  checks,
}: {
  label: string;
  score: number;
  checks: Array<{ ok: boolean; label: string; detail?: string }>;
}) {
  const tone =
    score >= 85 ? "leaf-500" : score >= 65 ? "amber-500" : "accent-600";
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">{label}</div>
          <div className={`text-xl font-black text-${tone}`}>{score}</div>
        </div>
        <ul className="space-y-1.5">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px]">
              <span
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  c.ok ? "text-leaf-500" : "text-accent-600"
                )}
              >
                {c.ok ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <AlertTriangle className="size-3.5" />
                )}
              </span>
              <span className="flex-1">
                <span
                  className={c.ok ? "text-ink-700" : "text-ink-900 font-semibold"}
                >
                  {c.label}
                </span>
                {c.detail && (
                  <span className="text-ink-400 ml-1">— {c.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
