/**
 * Prompt templates. Kept in one file so they're easy to tune as we observe
 * which patterns Naver's algorithm rewards / punishes.
 */

export type PersonaInput = {
  blogName: string;
  niche: string | null;
  purpose: string;
  audience: string;
  brandVoice: string;
  pointOfView: "first_person" | "third_person" | "expert";
  formality: "informal" | "neutral" | "formal";
  focusKeywords: string[];
  forbiddenWords: string[];
  ctas: string[];
  qualityRules: string[];
  sampleSnippets: string[];
  preferredLengthMin: number;
  preferredLengthMax: number;
  imagesPerPostMin: number;
  imagesPerPostMax: number;
  notes: string | null;
};

export function personaPreamble(p: PersonaInput) {
  const povLabel =
    p.pointOfView === "first_person"
      ? "1인칭 (저는, 제가, 우리…)"
      : p.pointOfView === "expert"
        ? "전문가 해설"
        : "3인칭 관찰자";
  const formalityLabel =
    p.formality === "informal"
      ? "친근체 (~예요, ~죠)"
      : p.formality === "formal"
        ? "정중체 (~습니다, ~합니다)"
        : "보통체 (~요, ~ㅂ니다 혼용)";

  return [
    `당신은 한국어 네이버 블로그 글을 쓰는 작가입니다. 블로그 정체성은 다음과 같습니다.`,
    ``,
    `**블로그명**: ${p.blogName}`,
    p.niche ? `**니치**: ${p.niche}` : null,
    `**목적**: ${p.purpose || "(미정)"}`,
    `**타겟 독자**: ${p.audience || "(미정)"}`,
    `**톤·말투**: ${p.brandVoice || "(미정)"}`,
    `**화법**: ${povLabel}`,
    `**격식**: ${formalityLabel}`,
    p.focusKeywords.length
      ? `**핵심 키워드**: ${p.focusKeywords.join(", ")}`
      : null,
    p.forbiddenWords.length
      ? `**금지어 (절대 사용 금지)**: ${p.forbiddenWords.join(", ")}`
      : null,
    p.qualityRules.length
      ? `**품질 규칙**:\n${p.qualityRules.map((r) => `- ${r}`).join("\n")}`
      : null,
    p.ctas.length
      ? `**참고용 CTA 문구**: \n${p.ctas.map((c) => `- ${c}`).join("\n")}`
      : null,
    p.sampleSnippets.length
      ? `**스타일 샘플 (이 톤을 흉내내세요)**:\n${p.sampleSnippets
          .map((s, i) => `샘플 ${i + 1}:\n"""${s}"""`)
          .join("\n\n")}`
      : null,
    p.notes ? `**기타 컨텍스트**: ${p.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Step 1: discover topic candidates. */
export function topicResearchPrompt(opts: {
  persona: PersonaInput;
  recentTitles: string[];
  season: string; // e.g. "2026년 5월 말, 초여름"
}) {
  return [
    `# 작업: 다음 주에 발행할 후보 주제 5개 제안`,
    ``,
    `시기적 맥락: ${opts.season}`,
    ``,
    `최근 발행 제목 (중복 회피):`,
    opts.recentTitles.length
      ? opts.recentTitles.map((t) => `- ${t}`).join("\n")
      : "- (없음)",
    ``,
    `각 후보에 대해 JSON 배열로 응답하세요:`,
    "```json",
    `[`,
    `  {`,
    `    "title": "후보 제목 (네이버 검색 노출에 유리한 제목, 35자 내외)",`,
    `    "angle": "어떤 관점으로 접근할지 한두 문장",`,
    `    "primaryKeyword": "이 글의 메인 키워드 1개",`,
    `    "secondaryKeywords": ["보조키워드 2~4개"],`,
    `    "rationale": "왜 지금 이 주제가 좋은지 (시기·검색량·페르소나 적합성)",`,
    `    "score": 0~100`,
    `  }`,
    `]`,
    "```",
    `반드시 위 JSON만 응답하세요. 코드블록 표시 없이.`,
  ].join("\n");
}

/** Step 2: outline a chosen topic. */
export function outlinePrompt(opts: {
  persona: PersonaInput;
  topic: {
    title: string;
    angle: string | null;
    primaryKeyword: string;
    secondaryKeywords: string[];
  };
  /** 반자동 모드: 사용자가 직접 지정한 내용 디테일. 있으면 반드시 충실히 반영. */
  userBrief?: string;
  /** 반자동 + 직접 업로드: 정확히 이 개수의 이미지 슬롯(slot 0..N-1)을 둔다. */
  imageSlotCount?: number;
}) {
  const hasBrief = !!opts.userBrief?.trim();
  const fixedImages = typeof opts.imageSlotCount === "number";
  return [
    `# 작업: 아래 주제로 글 구조(아웃라인) 만들기`,
    ``,
    hasBrief
      ? `⚠️ 이 글은 사용자가 주제와 내용을 **직접 지정**했습니다. 아래 "사용자 지정 내용"을 반드시 충실히 반영하세요. 다만 글의 말투·톤·금지어·길이·CTA 등 페르소나 규칙은 그대로 지킵니다(주제만 사용자 지정, 스타일은 페르소나).`
      : null,
    hasBrief ? `` : null,
    hasBrief ? `**사용자 지정 내용**:` : null,
    hasBrief ? "```" : null,
    hasBrief ? opts.userBrief!.trim() : null,
    hasBrief ? "```" : null,
    hasBrief ? `` : null,
    `**제목 (최종은 본문 작성 단계에서 조정 가능)**: ${opts.topic.title}`,
    opts.topic.angle ? `**앵글**: ${opts.topic.angle}` : null,
    `**메인 키워드**: ${opts.topic.primaryKeyword}`,
    opts.topic.secondaryKeywords.length
      ? `**보조 키워드**: ${opts.topic.secondaryKeywords.join(", ")}`
      : null,
    ``,
    `목표 길이: ${opts.persona.preferredLengthMin}~${opts.persona.preferredLengthMax}자`,
    fixedImages
      ? `이미지: 사용자가 사진 ${opts.imageSlotCount}장을 직접 업로드했습니다. imagePlan에 정확히 ${opts.imageSlotCount}개의 슬롯(slot 0부터 ${Math.max(0, (opts.imageSlotCount ?? 0) - 1)}까지)을 만들고, 본문 흐름에 맞는 위치를 배정하세요. needsUserShot 은 모두 false(이미 업로드됨).`
      : `목표 이미지 수: ${opts.persona.imagesPerPostMin}~${opts.persona.imagesPerPostMax}장`,
    ``,
    `아웃라인 형식 (JSON):`,
    "```json",
    `{`,
    `  "hookParagraph": "도입부 1문단 — 독자가 더 읽도록 끌어들이는 한국어 자연체",`,
    `  "sections": [`,
    `    { "h2": "섹션 제목", "summary": "이 섹션에 들어갈 내용 요약", "needsImage": true }`,
    `  ],`,
    `  "imagePlan": [`,
    `    { "slot": 0, "role": "hero|inline|store|product", "description": "찍을/넣을 이미지 묘사", "needsUserShot": ${fixedImages ? "false" : "true"} }`,
    `  ]`,
    `}`,
    "```",
    fixedImages
      ? `JSON만 응답. 섹션은 3~5개. imagePlan은 정확히 ${opts.imageSlotCount}개.`
      : `JSON만 응답. 섹션은 3~5개. 이미지는 페르소나 설정 범위 내.`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/** Step 3: write the full body from an outline. */
export function bodyPrompt(opts: {
  persona: PersonaInput;
  topic: { title: string; primaryKeyword: string; secondaryKeywords: string[] };
  outline: unknown;
  /** 반자동 모드: 사용자가 직접 지정한 내용 디테일. 있으면 반드시 충실히 반영. */
  userBrief?: string;
}) {
  const hasBrief = !!opts.userBrief?.trim();
  return [
    `# 작업: 아래 아웃라인을 바탕으로 본문 작성`,
    ``,
    hasBrief
      ? `⚠️ 사용자가 주제·내용을 직접 지정한 글입니다. 아래 "사용자 지정 내용"을 반드시 충실히 반영하되, 말투·톤·금지어·길이·CTA 규칙은 페르소나 설정을 그대로 따르세요.`
      : null,
    hasBrief ? `**사용자 지정 내용**:` : null,
    hasBrief ? "```" : null,
    hasBrief ? opts.userBrief!.trim() : null,
    hasBrief ? "```" : null,
    hasBrief ? `` : null,
    `반드시 지킬 규칙:`,
    `1. 네이버 블로그 알고리즘 친화적 — 첫 1~2문단에 메인 키워드 자연스럽게 등장`,
    `2. 본문 ${opts.persona.preferredLengthMin}~${opts.persona.preferredLengthMax}자`,
    `3. H2 2~4개, 필요시 H3 사용. 짧고 검색에 노출되는 표현으로`,
    `4. 이미지 위치는 본문에 \`<!-- IMG:slot=0 -->\` 형식으로 표시 (slot은 아웃라인 imagePlan의 slot 번호)`,
    `5. 사람이 쓴 것처럼 자연스럽게 — 같은 문장 구조 반복 회피, 문단 길이 변화`,
    `6. 광고티 나는 표현 회피, 페르소나의 "금지어"는 절대 사용 안 함`,
    `7. 가격·정보는 "방문 시 기준" 같은 표현으로 변동 가능성 표시`,
    `8. 마지막에 CTA 1개 (페르소나의 CTA 목록 중 1개 자연스럽게 포함)`,
    `9. Markdown으로 응답. 제목(#)은 작성하지 말고 H2(##)부터 시작.`,
    ``,
    `**제목**: ${opts.topic.title}`,
    `**메인 키워드**: ${opts.topic.primaryKeyword}`,
    `**보조 키워드**: ${opts.topic.secondaryKeywords.join(", ")}`,
    ``,
    `**아웃라인 JSON**:`,
    "```json",
    JSON.stringify(opts.outline, null, 2),
    "```",
    ``,
    `Markdown 본문만 출력하세요. 메타정보·해설·코드블록 표시 없이.`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/** Step 4: revise on rejection feedback. */
export function revisePrompt(opts: {
  persona: PersonaInput;
  currentTitle: string;
  currentBodyMd: string;
  feedback: string;
  feedbackTags: string[];
}) {
  return [
    `# 작업: 관리자의 반려 사유를 반영해 글을 다시 다듬어주세요.`,
    ``,
    `**반려 태그**: ${opts.feedbackTags.join(", ") || "(없음)"}`,
    `**관리자 코멘트**:`,
    "```",
    opts.feedback,
    "```",
    ``,
    `**현재 제목**: ${opts.currentTitle}`,
    `**현재 본문**:`,
    "```markdown",
    opts.currentBodyMd,
    "```",
    ``,
    `규칙: 코멘트의 의도에 맞춰 글을 다시 쓰세요. 페르소나·금지어·길이 규칙은 그대로 지킵니다.`,
    `응답 형식 (JSON):`,
    "```json",
    `{ "title": "수정된 제목", "bodyMd": "수정된 본문 Markdown" }`,
    "```",
    `JSON만 응답. 코드블록 표시 없이.`,
  ].join("\n");
}
