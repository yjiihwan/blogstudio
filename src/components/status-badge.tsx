import { Badge } from "@/components/ui/badge";

const map: Record<
  string,
  { tone: "neutral" | "amber" | "leaf" | "sky" | "accent" | "dark"; label: string }
> = {
  draft: { tone: "neutral", label: "생성중" },
  ready_for_review: { tone: "amber", label: "검토 대기" },
  revising: { tone: "sky", label: "재작성중" },
  approved: { tone: "accent", label: "발행 가능" },
  published: { tone: "leaf", label: "발행 완료" },
  archived: { tone: "neutral", label: "보관됨" },
};

export function DraftStatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
