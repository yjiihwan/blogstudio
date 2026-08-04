import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { getStyleSampleConfig } from "@/lib/style-samples";
import { StyleSampleWorkbench } from "./workbench";

export default async function AdminStyleSamplesPage() {
  // users 페이지와 동일한 가드: admin 이 아니면 대시보드로 되돌린다.
  const me = await requireAdmin().catch(() => null);
  if (!me) redirect("/dashboard");

  const rows = await db.query.styleSamples.findMany({
    orderBy: [asc(schema.styleSamples.sortOrder), asc(schema.styleSamples.createdAt)],
  });
  const config = await getStyleSampleConfig();

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">베스트 후기 원문</h1>
        <p className="mt-1 text-sm text-ink-500">
          잘 쓴 실제 후기를 카테고리별로 모아두면, 초안 생성 시 그 <b>문체만</b> 참고합니다.
          내용·고유명사는 가져오지 않도록 프롬프트에 가드가 걸려 있습니다.
        </p>
      </div>

      <StyleSampleWorkbench
        samples={rows.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          body: r.body,
          sourceUrl: r.sourceUrl ?? "",
          memo: r.memo ?? "",
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          updatedAt: r.updatedAt,
        }))}
        config={config}
      />
    </div>
  );
}
