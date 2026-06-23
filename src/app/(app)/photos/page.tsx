import Link from "next/link";
import { db, schema } from "@/db/client";
import { and, eq, desc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, FileEdit } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { requireUser, scopeByDraftId } from "@/lib/auth";
import { PhotoUploadForm } from "./photo-upload-form";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await requireUser();
  const reqs = await db.query.imageRequests.findMany({
    where: and(
      eq(schema.imageRequests.status, "pending"),
      await scopeByDraftId(user, schema.imageRequests.draftId)
    ),
    with: { draft: { with: { blog: true } } },
    orderBy: desc(schema.imageRequests.createdAt),
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-6xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Photo Requests
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          사진 요청
        </h1>
        <p className="mt-1.5 text-sm text-ink-500 max-w-xl">
          AI가 글에 필요하다고 판단한 이미지 자리입니다. 직접 촬영·업로드하거나,
          <strong> 자동 이미지(스톡 검색 / AI 생성 / 스톡→AI)</strong>로 채울 수 있어요.
          마음에 안 들면 피드백을 주고 다시 만들 수 있습니다.
        </p>
      </header>

      {reqs.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <Camera className="size-10 text-paper-400 mx-auto mb-3" />
            <p className="text-sm text-ink-500">대기 중인 사진 요청이 없어요.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {reqs.map((r) => (
            <Card key={r.id}>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="size-12 rounded-lg bg-accent-100 text-accent-700 flex items-center justify-center font-black shrink-0">
                    {r.slot}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge tone="outline">{r.draft.blog.displayName}</Badge>
                      <span className="text-[11px] text-ink-400">
                        {relativeTime(r.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-ink-900 mb-0.5">
                      {r.description}
                    </div>
                    {r.composition && (
                      <div className="text-xs text-ink-500">
                        구도: {r.composition}
                      </div>
                    )}
                    <Link
                      href={`/queue/${r.draftId}`}
                      className="text-xs text-accent-600 font-semibold mt-2 inline-flex items-center gap-1 hover:underline"
                    >
                      <FileEdit className="size-3" />
                      원본 초안 보기
                    </Link>
                  </div>
                </div>

                <PhotoUploadForm requestId={r.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
