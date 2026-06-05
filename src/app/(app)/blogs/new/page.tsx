import Link from "next/link";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { PersonaEditor } from "@/components/persona-editor";
import { createBlogAction } from "../actions";

export default async function NewBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/blogs"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft className="size-4" />
          블로그 목록
        </Link>
      </div>
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          New Blog
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          새 블로그 추가
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          이 페이지에서 입력한 가이드를 기준으로 AI가 매주 글을 만들어요.
          처음에는 빠진 부분 있어도 괜찮습니다 — 나중에 다듬을 수 있어요.
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <PersonaEditor
        mode="create"
        action={createBlogAction}
        blog={{
          naverBlogId: "",
          displayName: "",
          blogTitle: "",
          blogUrl: "",
          niche: "",
          status: "active",
          cron: "0 7 * * 1",
          jitterMin: 60,
        }}
        persona={{
          purpose: "",
          audience: "",
          brandVoice: "",
          pointOfView: "first_person",
          formality: "neutral",
          focusKeywords: [],
          forbiddenWords: ["최고", "최저가", "100%", "무조건"],
          ctas: [],
          preferredLengthMin: 1500,
          preferredLengthMax: 2800,
          imagesPerPostMin: 3,
          imagesPerPostMax: 8,
          sampleSnippets: [],
          qualityRules: [
            "과장 표현 사용 금지",
            "본문 중간 H2는 2~3개, H3은 0~1개",
            "이모지 본문 1개 이내",
          ],
          notes: "",
        }}
      />
    </div>
  );
}
