/* 모델 검수(A안) 프롬프트 — 숫자 기준 없이 «가이드·페르소나에 비춰 이 글을 그대로 내보낼 수 있는가»만 묻는다.
   출력은 JSON 고정 스키마. 설정 개선안(setting_issues)은 설정 자체 결함을 확신할 때만. */

export const REVIEW_SYSTEM_PROMPT = [
  `너는 네이버 블로그 글을 발행 직전에 검수하는 편집장이다. 글을 쓴 모델과 다른 모델로서 독립적으로 판단한다.`,
  `판단 기준은 오직 두 가지 문서 — (1) 서비스 전체 글쓰기 가이드 (2) 이 블로그의 페르소나 설정 — 와 주어진 확정 사실뿐이다.`,
  `점수·글자 수·흠의 개수 같은 기계적 기준은 없다. 글 전체를 읽고 "이 글을 지금 그대로 발행해도 되는가"를 편집장으로서 결정하라.`,
  `반드시 JSON 객체 하나만 출력한다. 설명·머리말·코드펜스 없이.`,
].join("\n");

export type ReviewPromptInput = {
  title: string;
  bodyMd: string;
  guideText: string;
  personaText: string;
  /** 반자동이면 사용자가 직접 입력한 사실·브리프, 자동이면 주제·키워드 */
  factsText?: string;
  styleSamplesText?: string;
  /** true = revise 허용(직접 고친 전문을 낼 수 있음). false = 수정본 재검수(approve/reject 만). */
  allowRevise: boolean;
  /** 재검수 때 1차 판정 사유(맥락용) */
  priorReason?: string;
};

export function reviewUserPrompt(i: ReviewPromptInput): string {
  const verdictRule = i.allowRevise
    ? [
        `- "approve": 가이드·페르소나에 비춰 그대로 내보내도 된다.`,
        `- "revise": 문제가 있지만 네가 직접 고치면 내보낼 수 있다. 이때 revised_body_md 에 **고친 전문(Markdown)** 을 넣어라. 부분만 쓰지 말고 처음부터 끝까지. 사실·고유명사·확정 정보는 보존하고, 사진 자리 마커(<!-- IMG:slot=N -->)는 개수·순서·위치를 그대로 둔다.`,
        `- "reject": 고쳐도 내보낼 수 없다(사실 날조·설정과 정면 충돌·구조적으로 다시 써야 함). revised_body_md 는 null.`,
      ]
    : [
        `- 이 글은 네가 한 번 고친 수정본이다. 더 고칠 수 없다(수정 기회는 한 번뿐). "approve" 또는 "reject" 만 낸다. revised_body_md 는 항상 null.`,
      ];
  return [
    `# 검수 대상`,
    `## 제목`,
    i.title,
    ``,
    `## 본문(Markdown)`,
    "```markdown",
    i.bodyMd,
    "```",
    ``,
    `# 판단 기준 문서`,
    `## (1) 서비스 전체 글쓰기 가이드 — 페르소나보다 우선`,
    i.guideText.trim() || "(가이드 없음)",
    ``,
    `## (2) 이 블로그의 페르소나 설정`,
    i.personaText.trim() || "(페르소나 없음)",
    ``,
    i.factsText?.trim() ? `## (3) 확정 사실(이 글에서 사실로 쓸 수 있는 것)\n${i.factsText.trim()}\n` : null,
    i.styleSamplesText?.trim() ? `## (4) 문체 참고 샘플(문체만 참고, 내용 차용 금지)\n${i.styleSamplesText.trim()}\n` : null,
    i.priorReason ? `## 1차 검수 사유(참고)\n${i.priorReason}\n` : null,
    `# 판정 규칙`,
    ...verdictRule,
    `- 분량·사람다움·검색 노출·흠 개수에 숫자 기준은 없다. 가이드와 페르소나가 요구하는 바에 비춰 편집장으로서 판단하라.`,
    `- hard_flags 는 아래 네 가지 사고 유형이 글에 실제로 있을 때만 넣는다(없으면 빈 배열):`,
    `  · "image_marker_lost" 사진 자리 마커가 비정상(중복·깨짐) · "absent_facility_used" 페르소나의 '없는 시설'을 있는 것처럼 씀 · "forbidden_word_used" 페르소나 금지어 사용 · "unfinished_slots" [슬롯: …] 같은 미완성 빈칸이 남아 완성본이 아님`,
    `- reason 은 사람이 읽는 한두 문장. 개발 용어·점수 없이, 결정의 핵심 근거만.`,
    ``,
    `# 설정 개선안(setting_issues)`,
    `글의 문제가 이 글 한 편의 실수가 아니라 **가이드 또는 페르소나 설정 자체**에서 비롯됐다고 **확신**할 때만 낸다. 한 번의 글쓰기 실수는 내지 않는다. 확신이 없으면 빈 배열.`,
    `설정 범위 밖(API 키·계정·발행 설정·일정·이미지 소스)은 절대 제안하지 않는다.`,
    `각 항목:`,
    `  · target: "global_guide"(전역 가이드) | "persona"(이 블로그 페르소나)`,
    `  · field: persona 면 설정 항목 이름 중 하나 — purpose(블로그 목적) · audience(타겟 독자) · brandVoice(톤·말투) · formality(격식: informal|neutral|formal) · pointOfView(화자: first_person|owner|third_person|expert) · focusKeywordsJson(핵심 키워드 목록) · forbiddenWordsJson(금지어 목록) · callsToActionJson(행동 유도 문구 목록) · qualityRulesJson(품질 규칙 목록) · facilitiesJson(실제 있는 시설·프로그램 목록) · absentFacilitiesJson(없는 시설 목록) · sampleSnippetsJson(문체 예시 목록) · notes(메모). global_guide 면 해당 섹션 제목(예: "3. 남용 단어·표현 금지").`,
    `  · problem: 무엇이 잘못됐는지 — 글에서 발견한 근거 문장을 그대로 인용해 설명.`,
    `  · proposed_change: { before, after } — persona 의 목록 항목(…Json)은 before/after 를 JSON 배열 문자열로(예: ["수영장","사우나"]). 텍스트 항목·가이드는 바꿀 문단 원문(before)과 바꾼 문단(after).`,
    `  · confidence: "high" | "medium" · systemic: 이 글 하나가 아니라 설정 자체 문제면 true`,
    ``,
    `# 출력(JSON 객체 하나만)`,
    `{"verdict":"approve|revise|reject","reason":"…","revised_body_md":null 또는 "고친 전문","hard_flags":[],"setting_issues":[]}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/** «같은 문제인가» 유사판정 — 저비용 모델(role=review_lite). 기존 후보 중 같은 설정 문제를 가리키는 id 하나 또는 null. */
export function similarityPrompt(i: {
  candidate: { target: string; field: string; problem: string; after: string };
  existing: Array<{ id: string; field: string; problem: string; after: string; status: string }>;
}): string {
  return [
    `다음 «새 제안» 이 «기존 제안 목록» 중 어느 것과 사실상 같은 설정 문제를 가리키는지 판단하라. 표현이 달라도 같은 설정 항목의 같은 방향 변경이면 같은 것이다. 같은 것이 없으면 null.`,
    ``,
    `## 새 제안`,
    JSON.stringify(i.candidate),
    ``,
    `## 기존 제안 목록`,
    ...i.existing.map((e) => JSON.stringify(e)),
    ``,
    `JSON 하나만 출력: {"same_as": "<기존 id>" 또는 null}`,
  ].join("\n");
}
