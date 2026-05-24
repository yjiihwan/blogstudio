/**
 * Tiny markdown → HTML converter sized for the kind of content we generate
 * (paragraphs, h2/h3, lists, blockquotes, simple emphasis). Plus our custom
 * <!-- IMG:slot=N --> placeholder rewriting.
 *
 * We deliberately don't use a full markdown lib — keeps deps small and we
 * control the output for our preview/Naver-paste flow.
 */

export type ImageMap = Record<number, { url: string; caption?: string | null; alt?: string | null }>;

export function renderMarkdown(md: string, images: ImageMap = {}) {
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
      } else {
        html.push(
          `<div class="img-placeholder" data-slot="${slot}">[이미지 ${slot} — 미연결]</div>`
        );
      }
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
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
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
