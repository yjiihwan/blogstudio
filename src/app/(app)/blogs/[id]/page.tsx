import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, CheckCircle2 } from "lucide-react";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { PersonaEditor } from "@/components/persona-editor";
import { updateBlogAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { getAccessibleBlog, requireUser } from "@/lib/auth";

export default async function BlogEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requireUser();
  // 소유권 검증: 타인 블로그 접근 시 404
  if (!(await getAccessibleBlog(id, user))) notFound();
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, id),
    with: { personas: true, schedules: true },
  });
  if (!blog) notFound();
  const persona = blog.personas.find((p) => p.isActive) ?? blog.personas[0];
  const sched = blog.schedules[0];

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
        <div className="flex items-center gap-2 mb-1.5">
          {blog.status === "active" ? (
            <Badge tone="leaf">활성</Badge>
          ) : (
            <Badge tone="neutral">{blog.status}</Badge>
          )}
          {blog.blogUrl && (
            <a
              href={blog.blogUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"
            >
              <ExternalLink className="size-3" />
              네이버에서 보기
            </a>
          )}
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          {blog.displayName}
        </h1>
      </header>

      {saved && (
        <div className="mb-5 rounded-lg bg-leaf-100 border border-leaf-500/20 px-3 py-2 text-sm text-leaf-500 flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          저장됐습니다.
        </div>
      )}

      <PersonaEditor
        mode="edit"
        action={async (fd) => {
          "use server";
          fd.set("id", blog.id);
          await updateBlogAction(fd);
        }}
        blog={{
          naverBlogId: blog.naverBlogId,
          displayName: blog.displayName,
          blogTitle: blog.blogTitle ?? "",
          blogUrl: blog.blogUrl ?? "",
          niche: blog.niche ?? "",
          status: blog.status,
          cron: sched?.cron ?? "0 7 * * 1",
          jitterMin: sched?.jitterMin ?? 60,
        }}
        persona={{
          purpose: persona?.purpose ?? "",
          audience: persona?.audience ?? "",
          brandVoice: persona?.brandVoice ?? "",
          pointOfView: persona?.pointOfView ?? "first_person",
          formality: persona?.formality ?? "neutral",
          focusKeywords: persona ? JSON.parse(persona.focusKeywordsJson) : [],
          forbiddenWords: persona ? JSON.parse(persona.forbiddenWordsJson) : [],
          ctas: persona ? JSON.parse(persona.callsToActionJson) : [],
          qualityRules: persona ? JSON.parse(persona.qualityRulesJson) : [],
          sampleSnippets: persona
            ? JSON.parse(persona.sampleSnippetsJson)
            : [],
          preferredLengthMin: persona?.preferredLengthMin ?? 1500,
          preferredLengthMax: persona?.preferredLengthMax ?? 2800,
          imagesPerPostMin: persona?.imagesPerPostMin ?? 3,
          imagesPerPostMax: persona?.imagesPerPostMax ?? 8,
          notes: persona?.notes ?? "",
        }}
      />
    </div>
  );
}
