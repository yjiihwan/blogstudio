import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireUser, getAccessibleBlog } from "@/lib/auth";
import { ManualDraftForm } from "./ManualDraftForm";

export default async function ManualDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const user = await requireUser();
  const { blogId } = await searchParams;

  const blog = blogId ? await getAccessibleBlog(blogId, user) : null;
  const persona = blog
    ? await db.query.personas.findFirst({
        where: eq(schema.personas.blogId, blog.id),
      })
    : null;
  const personaName = persona?.brandVoice || persona?.purpose || "기본 페르소나";

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/queue/new"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft className="size-4" />
          새 초안 생성
        </Link>
      </div>

      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          반자동 · 직접 입력
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          직접 입력해 초안 만들기
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          이벤트·단발성 글 등 직접 정한 주제로 작성합니다. 입력한 내용을 충실히
          반영하되, 이 블로그의 <strong>페르소나 톤·규칙은 그대로</strong> 적용됩니다.
        </p>
      </header>

      {!blog ? (
        <div className="rounded-lg bg-amber-100 border border-amber-500/20 px-4 py-3 text-sm text-amber-700">
          블로그를 찾을 수 없거나 권한이 없습니다.{" "}
          <Link href="/queue/new" className="underline font-semibold">
            새 초안 생성으로 돌아가기
          </Link>
        </div>
      ) : (
        <ManualDraftForm
          blogId={blog.id}
          blogName={blog.displayName}
          personaName={personaName}
        />
      )}
    </div>
  );
}
