/**
 * Tiny markdown → HTML converter sized for the kind of content we generate
 * (paragraphs, h2/h3, lists, blockquotes, simple emphasis). Plus our custom
 * <!-- IMG:slot=N --> placeholder rewriting.
 *
 * We deliberately don't use a full markdown lib — keeps deps small and we
 * control the output for our preview/Naver-paste flow.
 */

export type ImageMap = Record<number, { url: string; caption?: string | null; alt?: string | null }>;

export type RenderOptions = {
  /**
   * 연결된 이미지가 없는 슬롯을 어떻게 처리할지.
   * "drop"(기본) = 독자 노출 본문에서 마커를 완전히 제거(아무것도 렌더하지 않음).
   * "placeholder" = 편집자용 자리표시 박스([이미지 N — 미연결])를 남긴다.
   * WHY: 시스템 자리표시가 독자가 읽는 본문에 새어 나오던 버그 → 기본은 노출 금지.
   */
  unfilledSlots?: "drop" | "placeholder";
};

/**
 * 최종 본문에서 '작가용 가이드/지시문'과 내부 메모가 새어 들어간 흔적을 제거한다.
 * WHY: 아웃라인 summary·전역 작성 가이드 같은 '작성 지시'가 모델 출력 본문 상단에
 * 이탤릭 메타노트로 그대로 복붙되어 독자에게 노출되는 누출이 있었다. 프롬프트(지시)와
 * 산출물(본문)을 최종 단계에서 분리한다. 보수적으로:
 *  (a) 첫 헤딩 이전에 오는 '전체 이탤릭' 또는 '작성지시 어구' 리드 줄,
 *  (b) 본문 어디서든 '전체 이탤릭이면서 작성지시 어구를 포함'한 독립 줄
 * 만 제거해 일반 프로즈 오탐을 최소화한다.
 */
export function sanitizeBody(md: string): string {
  if (!md) return md;
  // 작성지시(작가 가이드) 특유의 어구 — 독자용 프로즈에는 거의 등장하지 않는 표현.
  const GUIDE_HINT =
    /(쓰기\s*좋|중심에\s*(두|둔|둡)|형\s*글(로|을|로서)|톤으로\s*(쓰|작성|풀)|권장(합니다|해요|한다|됩니다)|작성하면\s*좋|구성(으로|이)\s*좋|참고\s*[:：]|메모\s*[:：]|작성\s*(가이드|지침|팁)|다음\s*지침|후기형|정보형|공감형|(관점|고민)\s*을?\s*중심에)/;
  // 한 줄이 통째로 '이탤릭 한 런'인지(굵게 **...** / __...__ 는 제외).
  const isFullyItalic = (line: string) =>
    (/^\*.+\*$/.test(line) && !/^\*\*/.test(line)) ||
    (/^_.+_$/.test(line) && !/^__/.test(line));
  const stripEmphasis = (line: string) =>
    line.replace(/^[*_]+/, "").replace(/[*_]+$/, "").trim();

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const drop = new Set<number>();

  // (a) 리드 블록: 첫 헤딩/실질 콘텐츠 전까지의 이탤릭 메타노트·지시문 줄 제거.
  let i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue; // 선행 공백은 통과
    if (/^#{1,6}\s/.test(t)) break; // 첫 헤딩 도달 → 본문 시작, 중단
    if (isFullyItalic(t) || GUIDE_HINT.test(stripEmphasis(t))) {
      drop.add(i);
      continue;
    }
    break; // 일반 콘텐츠 문단 → 보존하고 중단
  }

  // (b) 본문 전체: '전체 이탤릭 + 지시어구' 독립 줄 제거(뒤늦게 새어든 메모).
  for (let j = i; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t && isFullyItalic(t) && GUIDE_HINT.test(stripEmphasis(t))) drop.add(j);
  }

  return lines
    .filter((_, idx) => !drop.has(idx))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderMarkdown(md: string, images: ImageMap = {}, opts: RenderOptions = {}) {
  const unfilledSlots = opts.unfilledSlots ?? "drop";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let inList: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    // Image marker
    const imgMatch = line.match(/^<!--\s*IMG:slot=(\d+)\s*-->$/);
    if (imgMatch) {
      flushParagraph();
      closeList();
      const slot = Number(imgMatch[1]);
      const it = images[slot];
      if (it) {
        const cap = it.caption
          ? `<figcaption>${escapeHtml(it.caption)}</figcaption>`
          : "";
        html.push(
          `<figure><img src="${escapeAttr(it.url)}" alt="${escapeAttr(it.alt ?? "")}" loading="lazy" />${cap}</figure>`
        );
      } else if (unfilledSlots === "placeholder") {
        html.push(
          `<div class="img-placeholder" data-slot="${slot}">[이미지 ${slot} — 미연결]</div>`
        );
      }
      // "drop"(기본): 연결 안 된 슬롯은 독자 노출 본문에서 아무것도 렌더하지 않는다.
      continue;
    }

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<h1>${inline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^---+$/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<hr/>`);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (inList !== "ol") {
        closeList();
        html.push("<ol>");
        inList = "ol";
      }
      html.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }
    if (ulMatch) {
      flushParagraph();
      if (inList !== "ul") {
        closeList();
        html.push("<ul>");
        inList = "ul";
      }
      html.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

function inline(s: string) {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safe = /^(https?:|\/|#)/.test(url) ? url : "#";
    return `<a href="${safe}" target="_blank" rel="noopener">${text}</a>`;
  });
  return out;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
