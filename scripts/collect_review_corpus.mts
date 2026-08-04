/**
 * 네이버 실제 후기 코퍼스 수집기 (1차) — 네이버 공식 오픈API(블로그 검색)만 사용.
 *
 * 실행:
 *   set -a; . ./.env.local; set +a; npx tsx scripts/collect_review_corpus.mts
 *   (필요 env: NAVER_OPENAPI_CLIENT_ID, NAVER_OPENAPI_CLIENT_SECRET)
 *
 * 안전 규칙 (형 지시 — 위반 금지):
 *  - 공식 API만 호출한다. 블로그 본문 크롤링/브라우저 자동화 없음.
 *  - 동시 연결 1개(순차), 요청 간 최소 1초 딜레이. 대량 병렬 금지.
 *  - 작성자 ID·닉네임·블로그 URL 등 개인 식별정보는 저장하지 않는다.
 *    (원문 링크는 sha256 해시 앞 16자만 doc_id 로 남겨 중복 제거에만 쓴다)
 *  - 광고성 협찬글은 ad_suspect 플래그를 달고 본 분석 대상에서 제외한다.
 *  - 수집물은 내부 참고용. 재발행 금지.
 *
 * 출력: data/review_corpus/raw/<category>.jsonl
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CLIENT_ID = process.env.NAVER_OPENAPI_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.NAVER_OPENAPI_CLIENT_SECRET ?? "";

const OUT_DIR = path.join(process.cwd(), "data", "review_corpus", "raw");
const TARGET_PER_CATEGORY = 15;
const MIN_PER_CATEGORY = 10;
const DELAY_MS = 1200; // 최소 1초 + 여유
const DISPLAY = 100; // API 1회 최대

/** 카테고리별 검색어. 후기성 문서가 걸리도록 "후기/다녀왔" 계열 위주. */
const CATEGORIES: { key: string; label: string; queries: string[] }[] = [
  { key: "health", label: "헬스", queries: ["헬스장 후기", "헬스장 등록 후기", "동네 헬스장 다녀왔어요", "헬스장 3개월 후기"] },
  { key: "pt", label: "PT", queries: ["PT 후기", "퍼스널트레이닝 후기", "피티 10회 후기", "PT 받아본 후기"] },
  { key: "gx", label: "GX", queries: ["GX 수업 후기", "그룹운동 후기", "GX 클래스 다녀왔어요", "스피닝 후기"] },
  { key: "boxing", label: "복싱", queries: ["복싱장 후기", "복싱 다이어트 후기", "복싱 체육관 다녀왔어요", "복싱 클래스 후기"] },
  { key: "hyrox", label: "하이록스", queries: ["하이록스 후기", "HYROX 후기", "하이록스 대회 후기", "하이록스 트레이닝 후기"] },
  { key: "sauna", label: "사우나", queries: ["사우나 후기", "찜질방 후기", "사우나 다녀왔어요", "스파 사우나 후기"] },
  { key: "wellness", label: "웰니스", queries: ["웰니스 센터 후기", "웰니스 프로그램 후기", "웰니스 스파 다녀왔어요", "리커버리 센터 후기"] },
  { key: "swimming", label: "수영", queries: ["수영장 후기", "수영 강습 후기", "수영장 다녀왔어요", "성인 수영 강습 후기"] },
  { key: "crossfit", label: "크로스핏", queries: ["크로스핏 후기", "크로스핏 박스 후기", "크로스핏 체험 후기", "크로스핏 다녀왔어요"] },
  { key: "pilates", label: "필라테스", queries: ["필라테스 후기", "필라테스 등록 후기", "기구 필라테스 후기", "필라테스 다녀왔어요"] },
  { key: "yoga", label: "요가", queries: ["요가원 후기", "요가 수업 후기", "핫요가 후기", "요가 다녀왔어요"] },
  { key: "barre", label: "바레", queries: ["바레 후기", "바레 수업 후기", "발레핏 후기", "바레 클래스 다녀왔어요"] },
  { key: "restaurant", label: "식당", queries: ["맛집 후기", "식당 다녀왔어요", "점심 맛집 후기", "저녁 식사 후기"] },
  { key: "cafe", label: "카페", queries: ["카페 후기", "카페 다녀왔어요", "동네 카페 후기", "디저트 카페 후기"] },
];

/** 광고·협찬 의심 표지 */
const AD_MARKERS = [
  "협찬", "제공받아", "제공 받아", "원고료", "소정의", "무상으로", "무료로 제공",
  "체험단", "서포터즈", "유료광고", "광고 포함", "대가를 받아", "대가를 지급",
  "업체로부터", "지원받아", "지원 받아", "AD ", "#광고",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 네이버 API 응답의 <b> 하이라이트·HTML 엔티티 제거 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function docId(link: string): string {
  return crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
}

type Item = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
};

type Row = {
  doc_id: string;
  category: string;
  category_label: string;
  query: string;
  postdate: string;
  title: string;
  /** API 가 주는 요약 스니펫(약 200자). 본문 전체가 아님. */
  summary: string;
  summary_len: number;
  ad_suspect: boolean;
  ad_markers: string[];
  source: "naver_openapi_blog_search";
  collected_at: string;
};

async function searchBlog(query: string, start: number): Promise<Item[]> {
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(DISPLAY));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort", "sim");

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": CLIENT_ID,
      "X-Naver-Client-Secret": CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Naver API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { items?: Item[] };
  return json.items ?? [];
}

function detectAd(text: string): string[] {
  return AD_MARKERS.filter((m) => text.includes(m));
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "❌ NAVER_OPENAPI_CLIENT_ID / NAVER_OPENAPI_CLIENT_SECRET 이 비어 있습니다.\n" +
        "   네이버 개발자센터에서 발급받은 키를 .env.local 에 넣고 다시 실행하세요.\n" +
        "   (키 임의 발급 금지 — 형 지시)",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const collectedAt = new Date().toISOString();
  const summary: { category: string; kept: number; adFlagged: number; queries: number }[] = [];

  for (const cat of CATEGORIES) {
    const seen = new Set<string>();
    const rows: Row[] = [];
    let adFlagged = 0;
    let usedQueries = 0;

    for (const query of cat.queries) {
      if (rows.length >= TARGET_PER_CATEGORY) break;
      usedQueries++;
      let items: Item[] = [];
      try {
        items = await searchBlog(query, 1);
      } catch (e) {
        console.error(`  ⚠️ [${cat.label}] "${query}" 실패: ${(e as Error).message}`);
        await sleep(DELAY_MS);
        continue;
      }

      for (const it of items) {
        if (rows.length >= TARGET_PER_CATEGORY) break;
        const id = docId(it.link);
        if (seen.has(id)) continue;
        seen.add(id);

        const title = stripHtml(it.title ?? "");
        const summaryText = stripHtml(it.description ?? "");
        if (summaryText.length < 40) continue; // 너무 짧은 스니펫은 분석 불가

        const markers = detectAd(`${title} ${summaryText}`);
        if (markers.length > 0) {
          adFlagged++;
          continue; // 광고 의심 = 본 분석 대상 제외
        }

        rows.push({
          doc_id: id,
          category: cat.key,
          category_label: cat.label,
          query,
          postdate: it.postdate ?? "",
          title,
          summary: summaryText,
          summary_len: summaryText.length,
          ad_suspect: false,
          ad_markers: [],
          source: "naver_openapi_blog_search",
          collected_at: collectedAt,
        });
      }

      await sleep(DELAY_MS); // 요청 간 최소 1초, 순차(동시 연결 1)
    }

    const outFile = path.join(OUT_DIR, `${cat.key}.jsonl`);
    fs.writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
    summary.push({ category: cat.label, kept: rows.length, adFlagged, queries: usedQueries });

    const flag = rows.length < MIN_PER_CATEGORY ? " ⚠️ 최소 10편 미달" : "";
    console.log(`[${cat.label}] 수집 ${rows.length}편 (광고제외 ${adFlagged}, 검색어 ${usedQueries}개)${flag}`);
  }

  const metaFile = path.join(OUT_DIR, "_collection_meta.json");
  fs.writeFileSync(
    metaFile,
    JSON.stringify(
      {
        collected_at: collectedAt,
        method: "naver_openapi_blog_search",
        note: "API 는 제목 + 약 200자 요약 스니펫만 제공한다. 본문 전체 아님.",
        target_per_category: TARGET_PER_CATEGORY,
        min_per_category: MIN_PER_CATEGORY,
        delay_ms: DELAY_MS,
        concurrency: 1,
        summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  const total = summary.reduce((a, b) => a + b.kept, 0);
  const short = summary.filter((s) => s.kept < MIN_PER_CATEGORY);
  console.log(`\n총 ${total}편 / 목표 ${CATEGORIES.length * TARGET_PER_CATEGORY}편`);
  if (short.length) console.log(`⚠️ 최소 10편 미달 카테고리: ${short.map((s) => `${s.category}(${s.kept})`).join(", ")}`);
  console.log(`저장: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
