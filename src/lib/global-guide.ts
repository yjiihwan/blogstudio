/**
 * 서비스 전체 공통 글쓰기 가이드.
 * 개별 블로그 페르소나보다 "우선"하는 상위 규칙으로, 모든 초안 생성
 * (완전자동·반자동·재작성)의 시스템 프롬프트 맨 앞에 주입된다.
 * 관리자가 설정에서 켜고/끄고 내용을 편집한다.
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export const GLOBAL_GUIDE_KEY = "global_writing_guide";

export type GlobalGuide = { enabled: boolean; text: string };

/** 권장 기본값 — AI 티 나는 글을 사전에 차단하는 규칙 모음. */
export const DEFAULT_GLOBAL_GUIDE = `## 절대 규칙 — AI 티 / 기계적 글 금지
- "오늘은 ~에 대해 알아보겠습니다", "~에 대해 소개해 드리겠습니다" 같은 상투적 도입부 금지. 바로 본론·장면으로 시작한다.
- "지금까지 ~에 대해 알아봤습니다", "이상으로 ~를 마치겠습니다" 같은 기계적 요약 마무리 금지.
- "여러분", "~분들"의 과한 호명, "정말", "너무", "꼭" 같은 강조 부사 남발 금지.
- 모든 문단을 같은 길이·같은 구조로 쓰지 않는다. 문장 길이와 리듬을 사람처럼 변주한다.
- 불릿/번호 목록 남발 금지. 정보 나열이 아니라 자연스러운 문단 흐름으로 쓴다.
- 영혼 없는 일반론("건강은 중요합니다" 류) 금지. 구체적 디테일·실제 경험·감각 묘사로 채운다.
- 과장 광고체, 이모지 떡칠, 해시태그 나열 금지.

## 신뢰성
- 확실하지 않은 사실·수치는 단정하지 말고 "방문 시 기준" 등으로 표시한다.
- 똑같은 표현/문장을 글 안에서 반복하지 않는다.`;

/** settings에서 전체 가이드를 읽어온다. 미설정 시 기본값(켜짐)으로 폴백. */
export async function getGlobalWritingGuide(): Promise<GlobalGuide> {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(schema.settings.key, GLOBAL_GUIDE_KEY),
    });
    if (!row) return { enabled: true, text: DEFAULT_GLOBAL_GUIDE };
    const parsed = JSON.parse(row.valueJson) as Partial<GlobalGuide>;
    return {
      enabled: parsed.enabled ?? true,
      text: typeof parsed.text === "string" ? parsed.text : DEFAULT_GLOBAL_GUIDE,
    };
  } catch {
    return { enabled: true, text: DEFAULT_GLOBAL_GUIDE };
  }
}

/**
 * 시스템 프롬프트에 끼울 가이드 블록. 비활성/빈 내용이면 빈 문자열.
 * 페르소나 preamble 앞에 붙이고, 충돌 시 이 규칙이 우선임을 명시한다.
 */
export async function globalGuideBlock(): Promise<string> {
  const g = await getGlobalWritingGuide();
  if (!g.enabled || !g.text.trim()) return "";
  return [
    `# ⚠️ 서비스 전체 공통 글쓰기 규칙 (최우선)`,
    `아래 규칙은 모든 글에 무조건 적용됩니다. 개별 블로그 페르소나 설정과 충돌하면 **이 규칙을 우선**하세요.`,
    ``,
    g.text.trim(),
  ].join("\n");
}
