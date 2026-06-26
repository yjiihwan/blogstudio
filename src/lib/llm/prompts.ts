/**
 * Prompt templates. Kept in one file so they're easy to tune as we observe
 * which patterns Naver's algorithm rewards / punishes.
 */
import { ageStyleBlock } from "../age-style";
import { genderStyleBlock } from "../gender-style";

export type PersonaInput = {
  blogName: string;
  niche: string | null;
  purpose: string;
  audience: string;
  brandVoice: string;
  pointOfView: "first_person" | "third_person" | "expert";
  formality: "informal" | "neutral" | "formal";
  ageGroup?: string | null;
  gender?: string | null;
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
      ? "1인칭 경험담 — 글쓴이가 직접 겪은 듯이('제가 가보니', '~더라고요', '~었어요'). 광고 대행 티가 아니라 실제 경험·후기 톤."
      : p.pointOfView === "expert"
        ? "전문가 해설 — 근거와 정보 중심으로 차분하게 설명"
        : "3인칭 관찰자 — 담담하게 소개·관찰";
  const formalityLabel =
    p.formality === "informal"
      ? "친근체 — 해요체(~예요/~어요/~죠) 중심, 친구에게 말하듯 편하게"
      : p.formality === "formal"
        ? "정중체 — 합쇼체(~습니다/~합니다)로 단정하게"
        : "보통체 — 해요체(~요/~어요) 중심으로 친근하면서도 담백하게. '~습니다'체와 섞지 말 것(섞이면 어색함).";

  return [
    `당신은 한국어 네이버 블로그 글을 쓰는 작가입니다. 블로그 정체성은 다음과 같습니다.`,
    ``,
    `## 한국 네이버 블로그 기본 문체 (아래 페르소나 설정으로 세부 조정)`,
    `- 짧은 문단(2~4문장) 위주로, 모바일에서 읽기 좋게 문단을 자주 나눈다.`,
    `- 번역투('~할 수 있습니다', '~중 하나입니다', '~에 있어서')를 쓰지 않고, 입에 붙는 자연스러운 한국어로 쓴다.`,
    `- 정보 나열보다 직접 보고 겪은 듯한 구체적 정황·디테일로 풀어쓴다.`,
    `- 독자에게 말 거는 친근함은 좋되, '여러분' 같은 과한 호명·상투어는 쓰지 않는다.`,
    `- 종결어미를 단조롭게 반복하지 말고 사람처럼 변주한다.`,
    ``,
    `**블로그명**: ${p.blogName}`,
    p.niche ? `**니치**: ${p.niche}` : null,
    `**목적**: ${p.purpose || "(미정)"}`,
    `**타겟 독자**: ${p.audience || "(미정)"}`,
    `**톤·말투**: ${p.brandVoice || "(미정)"}`,
    `**화법**: ${povLabel}`,
    `**격식**: ${formalityLabel}`,
    ageStyleBlock(p.ageGroup),
    genderStyleBlock(p.gender),
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
  /** 사용자가 명시한 목표 글자수(공백 제외). 있으면 페르소나 기본 분량보다 우선한다. */
  lengthTarget?: number;
}) {
  const hasBrief = !!opts.userBrief?.trim();
  const fixedImages = typeof opts.imageSlotCount === "number";
  const lt = opts.lengthTarget && opts.lengthTarget > 0 ? opts.lengthTarget : null;
  return [
    `# 작업: 아래 주제로 글 구조(아웃라인) 만들기`,
    ``,
    hasBrief
      ? `⚠️ 이 글은 사용자가 주제와 내용을 **직접 지정**했습니다. 아래 "사용자 지정 내용"을 반드시 충실히 반영하세요. 다만 글의 말투·톤·금지어·CTA 등 페르소나 규칙은 그대로 지킵니다(주제만 사용자 지정, 스타일은 페르소나).${
          lt ? ` **단, 글 길이는 사용자가 명시한 약 ${lt}자를 페르소나 기본 분량보다 우선합니다.**` : " 길이도 페르소나 규칙을 따릅니다."
        }`
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
    lt
      ? `목표 길이: 공백 제외 약 ${lt}자(±10%) — 사용자 명시. 섹션 수와 각 섹션 분량을 이 목표에 맞춰 충분히 잡으세요(필요하면 H2 섹션을 더 늘려도 됩니다).`
      : `목표 길이: ${opts.persona.preferredLengthMin}~${opts.persona.preferredLengthMax}자`,
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
    (() => {
      // 큰 목표 길이는 섹션 3~5개로는 못 채운다 → 목표×(섹션당 ~500자) 기준으로 권장 섹션 수를 올린다.
      const secHint = lt && lt > 1600 ? `${Math.max(4, Math.round(lt / 500))}개 이상` : `3~5개`;
      return fixedImages
        ? `JSON만 응답. 섹션은 ${secHint}. imagePlan은 정확히 ${opts.imageSlotCount}개.`
        : `JSON만 응답. 섹션은 ${secHint}. 이미지는 페르소나 설정 범위 내.`;
    })(),
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
  /** 사용자가 명시한 목표 글자수(공백 제외). 있으면 페르소나 기본 분량보다 우선한다. */
  lengthTarget?: number;
}) {
  const hasBrief = !!opts.userBrief?.trim();
  const lt = opts.lengthTarget && opts.lengthTarget > 0 ? opts.lengthTarget : null;
  const bigTarget = lt && lt > (opts.persona.preferredLengthMax || 0) * 1.3;
  return [
    `# 작업: 아래 아웃라인을 바탕으로 본문 작성`,
    ``,
    hasBrief
      ? `⚠️ 사용자가 주제·내용을 직접 지정한 글입니다. 아래 "사용자 지정 내용"을 반드시 충실히 반영하되, 말투·톤·금지어·CTA 규칙은 페르소나 설정을 그대로 따르세요.${
          lt ? ` **단, 글 길이는 사용자가 명시한 약 ${lt}자(±10%)를 페르소나 기본 분량보다 우선합니다.**` : " 길이도 페르소나 설정을 따르세요."
        }`
      : null,
    hasBrief ? `**사용자 지정 내용**:` : null,
    hasBrief ? "```" : null,
    hasBrief ? opts.userBrief!.trim() : null,
    hasBrief ? "```" : null,
    hasBrief ? `` : null,
    `반드시 지킬 규칙:`,
    `1. **글의 주체(업체)는 실제 상호 "${opts.persona.blogName}"로 부른다.** "${opts.topic.primaryKeyword}에서는~"처럼 키워드를 상호(업체 이름) 대신 쓰지 마라.`,
    `2. **그러면서도 메인 키워드 "${opts.topic.primaryKeyword}"를 정확히 그대로 2~3회 반드시 포함한다**(검색 노출 필수 — 0회 금지, 4회 이상 남발도 금지). 상호 대신이 아니라 "검색하는 사람의 표현"으로 문맥에 녹여라. 좋은 예: "${opts.topic.primaryKeyword}을(를) 알아보고 있다면", "${opts.topic.primaryKeyword} 중에서도 ~", "${opts.topic.primaryKeyword}을(를) 고민 중이라면 ${opts.persona.blogName}". 나쁜 예: 업체를 계속 "${opts.topic.primaryKeyword}"라고 부르기.`,
    lt
      ? `3. **본문 길이 (사용자 명시 — 반드시 충족, 페르소나 기본 분량보다 우선)**: 공백 제외 약 ${lt}자(±10%)로 작성하세요. 목표에 크게 못 미치면 미반영으로 간주합니다. 같은 말 반복·군더더기로 채우지 말고 구체 정보·사례·디테일을 더해 자연스럽게 채우세요.`
      : `3. 본문 ${opts.persona.preferredLengthMin}~${opts.persona.preferredLengthMax}자`,
    bigTarget
      ? `3-1. **분량 확보 (중요)**: 목표 ${lt}자는 짧은 글이 아닙니다. 아웃라인의 각 H2 섹션을 공백 제외 400~600자의 구체적 내용으로 충실히 채우고, 부족하면 섹션을 더 추가하세요(시설·장비 상세, 트레이너/프로그램, 이용 절차, 자주 묻는 질문, 위치·이용 팁, 실제 활용 시나리오 등으로 주제를 다양화). 페르소나의 기본 길이 상한은 이 글에 한해 무시합니다.`
      : null,
    `4. H2 2~4개, 필요시 H3 사용. 짧고 검색에 노출되는 표현으로`,
    `5. 이미지 위치는 본문에 \`<!-- IMG:slot=0 -->\` 형식으로 표시 (slot은 아웃라인 imagePlan의 slot 번호)`,
    `6. 사람이 쓴 것처럼 자연스럽게 — 같은 문장 구조 반복 회피, 문단 길이 변화`,
    `7. **페르소나의 화법·격식·톤을 글 전체에 일관되게 유지.** 시스템 지침의 화법(예: 1인칭 경험담)을 끝까지 지킨다 — 공지·이벤트 글이라도 홍보 문구로 빠지지 말고, 1인칭이면 '제가 다니는/직접 본' 식으로 글쓴이 시점을 유지한다.`,
    `8. 광고티 나는 표현 회피, 페르소나의 "금지어"는 절대 사용 안 함`,
    `9. 가격·정보는 "방문 시 기준" 같은 표현으로 변동 가능성 표시`,
    `10. 마지막에 CTA 1개 (페르소나의 CTA 목록 중 1개 자연스럽게 포함)`,
    `11. Markdown으로 응답. 제목(#)은 작성하지 말고 H2(##)부터 시작.`,
    ``,
    `**상호(글의 주체)**: ${opts.persona.blogName}`,
    `**제목**: ${opts.topic.title}`,
    `**메인 키워드(검색 노출용 — 남발 금지, 2~3회)**: ${opts.topic.primaryKeyword}`,
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
/**
 * 관리자 코멘트에서 '분량/글자수 변경' 의도를 정량 목표로 환산한다.
 * WHY: "늘려줘/줄여줘"는 정성적이라 LLM이 막연히 해석해 거의 안 바뀐다(특히 누적 회차).
 * 현재 글자수 대비 구체적 목표치를 만들어 프롬프트에 박아야 실제로 반영된다.
 * 기준은 scoring.ts와 동일하게 '공백 제외' 글자수.
 */
export function parseLengthIntent(
  feedback: string,
  currentChars: number,
  preferredMin: number,
  preferredMax: number
): { direction: "up" | "down"; targetChars: number } | null {
  const f = feedback.replace(/\s+/g, " ");
  const upWords =
    /(늘려|늘리|늘여|길게|길어|길|풍부|자세히|자세하게|디테일|대폭|확장|보강|덧붙|더 (?:길|많|풍부|자세))/;
  const downWords = /(줄여|줄이|짧게|짧아|짧|간결|핵심만|절반|반으로|덜어|압축|간략|축소|쳐내)/;
  const charMatch = f.match(/(\d{2,5})\s*자/);
  const multMatch = f.match(/(\d+(?:\.\d+)?)\s*배/);
  const half = /절반|반으로/.test(f);
  const hasUp = upWords.test(f);
  const hasDown = downWords.test(f);

  let direction: "up" | "down" | null = null;
  if (charMatch) direction = parseInt(charMatch[1], 10) >= currentChars ? "up" : "down";
  else if (half) direction = "down";
  else if (multMatch) direction = parseFloat(multMatch[1]) >= 1 ? "up" : "down";
  else if (hasUp && !hasDown) direction = "up";
  else if (hasDown && !hasUp) direction = "down";
  if (!direction) return null;

  let target: number;
  if (charMatch) target = parseInt(charMatch[1], 10);
  else if (half) target = Math.round(currentChars * 0.5);
  else if (multMatch && direction === "up") target = Math.round(currentChars * parseFloat(multMatch[1]));
  else if (direction === "up") target = Math.max(Math.round(currentChars * 1.6), preferredMin || 0);
  else target = Math.round(currentChars * 0.55);

  // 합리적 범위로 클램프(하한 80자).
  // WHY: 관리자가 "3000자로"처럼 명시 숫자를 주면 그 의도를 그대로 따라야 한다 —
  // 페르소나 상한/현재×2.5로 깎으면 600→3000 요청이 2200으로 잘려 '미반영'으로 보인다(비대칭 버그).
  // 모호/비율 요청만 과확장 방지를 위해 페르소나 기반 ceiling을 쓰고,
  // 명시 숫자는 폭주 방지용 절대 상한(8000자)만 적용한다.
  const ceil = charMatch
    ? 8000
    : Math.max(preferredMax || 0, Math.round(currentChars * 2.5)) || target;
  target = Math.min(Math.max(target, 80), ceil);
  return { direction, targetChars: target };
}

/**
 * 사용자 입력(브리프/제목)에서 '명시 글자수' 목표를 추출한다 — 신규 작성 경로용.
 * WHY: 신규 글은 '현재 글자수'가 없어 parseLengthIntent를 쓸 수 없다. 또 신규 경로는 명시 길이를
 * 파싱조차 안 하고 페르소나 기본 분량만 프롬프트에 박아, "2000자로 작성" 요청이 700자로 잘렸다.
 * "2000자", "3천자", "2000자 내외/이상/정도"처럼 절대 숫자만 인식한다(모호한 '길게'는 페르소나 기본 사용).
 * 페르소나 상한에 막히지 않도록 폭주 방지용 절대 상한(8000자)만 적용한다.
 */
export function parseExplicitLength(text: string): number | null {
  const f = (text || "").replace(/\s+/g, " ");
  const thousand = f.match(/(\d+(?:\.\d+)?)\s*천\s*자/); // "3천자" → 3000
  const charMatch = f.match(/(\d{2,5})\s*자/); // "2000자"
  let target: number | null = null;
  if (thousand) target = Math.round(parseFloat(thousand[1]) * 1000);
  else if (charMatch) target = parseInt(charMatch[1], 10);
  if (target === null) return null;
  return Math.min(8000, Math.max(80, target));
}

export function revisePrompt(opts: {
  persona: PersonaInput;
  currentTitle: string;
  currentBodyMd: string;
  feedback: string;
  feedbackTags: string[];
  /** 과거 회차의 반려 코멘트(오름차순) — 이번 수정 후에도 모두 유지해야 한다. */
  priorFeedbacks?: { revision: number; feedback: string; feedbackTags: string[] }[];
}) {
  const priors = opts.priorFeedbacks ?? [];
  const currentChars = opts.currentBodyMd.replace(/\s+/g, "").length;
  const lenIntent = parseLengthIntent(
    opts.feedback,
    currentChars,
    opts.persona.preferredLengthMin,
    opts.persona.preferredLengthMax
  );
  const lengthBlock = lenIntent
    ? (() => {
        const gap = lenIntent.targetChars - currentChars;
        const bigUp = lenIntent.direction === "up" && gap >= 600;
        // 큰 확장은 모델이 단일 패스로 잘 안 따른다 → 갭과 추가할 섹션 수를 구체적으로 지시한다.
        const addSections = Math.max(2, Math.round(gap / 500));
        return [
          `**길이 목표 (정량 — 반드시 충족)**: 현재 본문은 공백 제외 약 ${currentChars}자입니다. 이번 코멘트는 분량을 ${
            lenIntent.direction === "up" ? "늘리라는" : "줄이라는"
          } 요청이므로, 다시 쓴 본문을 **공백 제외 약 ${lenIntent.targetChars}자(±10%)**로 맞추세요. ${
            lenIntent.direction === "up"
              ? "실제로 길이를 늘리되 같은 말 반복·군더더기로 채우지 말고, 새로운 구체 정보·사례·디테일을 더해 자연스럽게 늘리세요."
              : "핵심·사실은 보존한 채 중복과 군더더기를 덜어내 목표 길이로 압축하세요."
          } 목표 글자수에 크게 못 미치면(또는 크게 넘기면) 미반영으로 간주합니다.`,
          bigUp
            ? `**대폭 확장 지침 (중요)**: 지금보다 약 ${gap}자를 더 써야 합니다(현재 ${currentChars}자 → 목표 ${lenIntent.targetChars}자). 기존 문장만 약간 늘리는 정도로는 목표에 절대 도달하지 못합니다. 새로운 H2(##) 소제목 섹션을 **${addSections}개 이상** 추가하고, 각 섹션을 공백 제외 400~600자 분량의 구체적 내용으로 채우세요(예: 시설·장비 상세, 트레이너/프로그램 소개, 이용 절차, 자주 묻는 질문, 위치·이용 팁, 실제 활용 시나리오 등 주제를 다양화). 결과 본문이 목표 글자수에 도달했는지 쓰기 전에 점검하고, 부족하면 섹션을 더 추가해 반드시 목표를 채우세요. 페르소나의 기본 길이 상한은 이 관리자 요청에 한해 무시합니다.`
            : null,
          ``,
        ].filter((x): x is string => x !== null);
      })()
    : [];
  const priorBlock =
    priors.length > 0
      ? [
          `**누적 반려 반영사항 (이번 수정 후에도 전부 그대로 유지 — 표준 제약)**:`,
          ...priors.map((p) => {
            const tags = p.feedbackTags.join(", ");
            return `- ${p.revision + 1}차 반려${tags ? ` [${tags}]` : ""}: ${p.feedback}`;
          }),
          ``,
        ]
      : [];
  return [
    `# 작업: 관리자의 반려 사유를 반영해 글을 다시 다듬어주세요.`,
    ``,
    ...priorBlock,
    ...lengthBlock,
    `**이번 반려 태그**: ${opts.feedbackTags.join(", ") || "(없음)"}`,
    `**이번 관리자 코멘트**:`,
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
    // 관리자 코멘트가 페르소나 기본 격식/톤과 충돌하면 코멘트가 이긴다 — 안 그러면
    // 시스템 프리앰블의 '해요체' 같은 기본값이 명시적 톤 변경 요청을 눌러버린다(제목만 바뀌고
    // 본문은 그대로인 현상의 원인). 금지어·사실·안전 규칙만 예외 없는 절대 제약으로 남긴다.
    `**최우선 규칙 — 관리자 코멘트가 페르소나 기본값을 덮어씁니다**: 이번/누적 관리자 코멘트가 페르소나의 기본 격식·말투·시점·길이 설정과 충돌하면, **무조건 관리자 코멘트를 따르세요**(이 글에 한해 해당 기본값을 덮어씁니다). 일부만 바꾸고 나머지를 원래대로 남기는 것은 미반영으로 간주합니다. 단, **금지어와 사실·안전 규칙은 예외 없이 지킵니다.**`,
    `- **톤·격식 변경**(예: 반말로/해요체로/정중하게): 제목뿐 아니라 **본문의 모든 문장 종결어미까지 끝까지** 일관되게 바꿉니다 — '반말로'라면 ~다/~어/~야/~지 등 실제 반말로, '해요체로'라면 ~요/~어요로 전 문장을 통일하고 다른 격식체와 섞지 마세요.`,
    `- **시점·화자 변경**(예: 고객 후기 → 직원/사장/운영자 시점, 또는 그 반대): 종결어미만이 아니라 **글 전체의 주어와 관점을 끝까지 바꿉니다.** 화자가 누구인지(방문 고객인지 / 그 시설을 운영하는 사람인지)를 모든 문장에서 일관되게 유지하세요. 표현을 통째로 치환해야 합니다 — 고객/방문자 표현("다녀왔어요", "제가 가보니", "방문해보시면", "추천하고 싶어요", "인상적이었어요")을 운영자/사업자 표현("저희가 운영하는", "직접 준비했습니다", "갖춰 두었어요", "찾아주시면", "안내해 드릴게요")으로 전부 바꾸세요. 문장 한두 개만 바꾸고 나머지를 원래 후기/추천 톤으로 남기면 **미반영(시점 전환 실패)**으로 간주합니다. 반대(운영자 → 고객 후기)도 같은 강도로 적용합니다.`,
    priors.length > 0
      ? `규칙: **위 '누적 반려 반영사항'(톤·스타일·길이 등)을 그대로 유지한 채, 이번 코멘트를 추가로 적용**하세요. 과거 반영분을 되돌리지 마세요 — 예컨대 이전에 '여성스러운 톤'으로 바꿨다면 이번에 분량을 늘리더라도 그 톤을 유지합니다. 페르소나의 길이·세부 규칙은 **관리자 코멘트와 충돌하지 않는 범위에서만** 적용하고, 금지어는 반드시 지킵니다.`
      : `규칙: 코멘트의 의도에 맞춰 글을 다시 쓰세요. 페르소나 규칙은 **관리자 코멘트와 충돌하지 않는 범위에서만** 적용하고, 금지어는 반드시 지킵니다.`,
    // WHY: 누적 회차일수록 LLM이 '요청 부분만 끼워넣고' 나머지를 기계적으로 깁는 경향(같은 종결어미
    // 반복·짜깁기)이 생긴다. 매 회차 글 전체를 다시 다듬으라고 명시해 완성도 저하를 막는다.
    `**글 전체 완성도 — 기계적 패치 금지**: 요청한 부분만 끼워 넣고 나머지를 그대로 두지 마세요. 요청을 반영한 뒤 **글 전체의 흐름·문장 연결·자연스러움을 처음부터 다시 다듬으세요.** 같은 종결어미(예: ~습니다, ~해요)를 3문장 넘게 연속하지 말고, 문장 길이를 짧고 길게 섞어 사람이 직접 쓴 글처럼 만드세요. 누적 반려가 쌓여도 글이 짜깁기처럼 읽히면 안 됩니다.`,
    `응답 형식 (JSON):`,
    "```json",
    `{ "title": "수정된 제목", "bodyMd": "수정된 본문 Markdown" }`,
    "```",
    `JSON만 응답. 코드블록 표시 없이.`,
  ].join("\n");
}

/**
 * Step 3.5: 본문 생성 후 'AI 티'를 걷어내는 사람화(humanize) 리라이트 패스.
 * 모델은 제약을 지키며 생성하는 것보다 "이 글을 사람처럼 고쳐써"라는 명확한
 * 재작성 작업을 훨씬 잘 따른다 — 그래서 별도 패스로 자연스러움을 끌어올린다.
 */
export function humanizePrompt(opts: {
  title: string;
  bodyMd: string;
  /** 전역 가이드 텍스트(AI 티 금지 규칙). */
  rules: string;
  /** 글의 주체가 되는 실제 상호. */
  brandName?: string;
  /** 검색 노출용 메인 키워드(남발 교정 대상). */
  primaryKeyword?: string;
  /** 분량 늘리기 반려 직후 호출 시, 이 글자수(공백 제외) 미만으로 줄이지 못하게 한다. */
  minChars?: number;
}) {
  return [
    `# 작업: 아래 블로그 초안에서 'AI가 쓴 티'를 전부 걷어내고, 진짜 사람이 직접 쓴 것처럼 다시 써라.`,
    `이건 '제약 지키기'가 아니라 '자연스럽게 고쳐쓰기' 작업이다. 어색하거나 기계적인 부분을 사람 말투로 바꿔라.`,
    ``,
    `## 반드시 제거할 AI 티 패턴 (하나도 남기지 마라)`,
    opts.rules.trim(),
    ``,
    opts.brandName || opts.primaryKeyword
      ? `## 상호 / 키워드 교정 (중요)`
      : null,
    opts.brandName
      ? `- 업체/장소는 반드시 실제 상호 "${opts.brandName}"로 부른다. 검색 키워드를 상호처럼 쓴 부분(예: "${opts.primaryKeyword ?? ""}에서는~")은 실제 상호로 바로잡아라.`
      : null,
    opts.primaryKeyword
      ? `- **메인 키워드 "${opts.primaryKeyword}"가 본문에 정확히 그대로 2~3회 들어가야 한다(검색 노출 필수).** 지금 부족하면(0~1회) 도입부와 중간에 "검색하는 사람의 표현"으로 자연스럽게 채워 넣어라 — 예: "${opts.primaryKeyword}을(를) 알아보고 있다면", "${opts.primaryKeyword} 중에서도 ~". 4회 이상이면 줄여라. 단 상호 대신 쓰진 말 것.`
      : null,
    opts.brandName || opts.primaryKeyword ? `` : null,
    `## 절대 바꾸지 말 것`,
    `- 사실·정보·수치·고유명사·가격·기간은 그대로 유지(없는 사실 지어내기 금지).`,
    `- 이미지 마커 \`<!-- IMG:slot=N -->\` 는 개수·위치 그대로 보존.`,
    // WHY: 분량 늘리기 반려 직후엔 humanize의 '간결화'가 방금 늘린 분량을 도로 깎아 길이요청을
    // 무력화한다(실측: revise 734자 → humanize 463자). 그 경우 축소를 명시적으로 금지한다.
    opts.minChars
      ? `- H2(##) 소제목 구조는 유지. **분량을 절대 줄이지 마라 — 공백 제외 ${opts.minChars}자 이상을 유지**한다. 이 글은 관리자 요청으로 길이를 맞춘 글이니, AI 티를 걷어내되 내용을 잘라내 분량을 줄이면 안 된다.`
      : `- H2(##) 소제목 구조와 대략적 분량은 유지.`,
    // WHY: 이 패스는 '자연스럽게 다듬기'이지 '톤/시점 재설정'이 아니다. 현재 본문의 화자·시점·격식은
    // 상위 단계(생성 또는 관리자 반려 반영)에서 이미 의도적으로 맞춰진 것이므로, 페르소나 기본값으로
    // 되돌리면 안 된다. 안 그러면 '직원 시점으로' 바꾼 글을 humanize가 후기 톤으로 되돌리는 회귀가 생긴다.
    `- **글의 화자/시점(누가 쓰는 글인지: 방문 고객인지·운영자인지)과 격식·말투는 현재 본문 그대로 유지한다.** 이미 의도적으로 맞춰진 것이니 절대 다른 시점·격식으로 바꾸지 마라 — 예: 운영자(사장/직원) 시점 글을 고객 후기 톤("다녀왔어요/가보니")으로 되돌리거나, 그 반대로 바꾸는 것 모두 금지. 종결어미 격식(반말/해요체/합쇼체)도 현재 본문을 따른다.`,
    ``,
    `## 자연스럽게 만드는 법`,
    `- 문장 길이를 들쭉날쭉하게(짧은 문장·긴 문장 섞기). 같은 종결어미 연속 반복 깨기.`,
    `- 상투적 도입·마무리는 구체적 장면이나 솔직한 한마디로 교체.`,
    `- 공허한 일반론은 구체적 디테일·실제 정황으로 바꾸기.`,
    ``,
    `**제목**: ${opts.title}`,
    `**현재 본문**:`,
    "```markdown",
    opts.bodyMd,
    "```",
    ``,
    `다시 쓴 Markdown 본문만 출력. 해설·코드펜스 표시 없이.`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}
