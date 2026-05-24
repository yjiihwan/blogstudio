import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function InsightsPage() {
  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-4xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Insights
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          노출 분석
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          발행한 글의 네이버 검색 순위를 매일 추적합니다.
        </p>
      </header>

      <Card>
        <CardContent className="py-20 text-center">
          <BarChart3 className="size-10 text-paper-400 mx-auto mb-3" />
          <p className="text-sm text-ink-500">
            아직 추적 데이터가 충분히 모이지 않았어요.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            첫 글이 발행되고 며칠 지나면 키워드별 순위 변화가 표시됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
