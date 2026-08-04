/**
 * 수집된 후기 코퍼스 정량 분석 → data/review_corpus/report_style.md (산출물 A 정량부)
 *                                data/review_corpus/report_material.md (산출물 B)
 *
 * 실행: npx tsx scripts/analyze_review_corpus.mts
 *
 * 입력: data/review_corpus/raw/<category>.jsonl
 *   - 각 행의 분석 대상 텍스트 = row.body ?? row.summary
 *     (공식 API 만 쓴 경우 summary = 약 200자 스니펫 → 문단/전체길이/마무리 지표는 계산 불가로 표기)
 *
 * 원칙: 추측·창작 금지. 데이터로 계산되지 않는 항목은 "데이터 부족"으로 남긴다.
 */
import fs from "node:fs";
import path from "node:path";

const RAW_DIR = path.join(process.cwd(), "data", "review_corpus", "raw");
const OUT_DIR = path.join(process.cwd(), "data", "review_corpus");

type Row = {
  doc_id: string;
  category: string;
  category_label: string;
  title: string;
  summary: string;
  body?: string;
  ad_suspect?: boolean;
};

/** 종결어미 후보 — 긴 것 우선 매칭 */
const ENDINGS = [
  "더라고요", "더라구요", "았어요", "었어요", "했어요", "네요", "거든요", "드라고요",
  "같아요", "이에요", "예요", "해요", "어요", "아요", "구요", "고요",
  "습니다", "합니다", "됩니다", "입니다", "ㅂ니다",
  "했다", "였다", "이다", "한다", "된다",
  "죠", "지요", "래요", "게요", "볼게요", "세요",
];

/** 군말·구어 표지 */
const FILLERS = [
  "근데", "그런데", "아무튼", "암튼", "참고로", "일단", "사실", "솔직히", "개인적으로",
  "진짜", "정말", "너무", "좀", "약간", "그냥", "역시", "확실히", "생각보다",
  "ㅎㅎ", "ㅋㅋ", "ㅜㅜ", "ㅠㅠ", "!!", "~~",
];

/** 산출물 B — 시설·공간 요소 */
const FACILITY_TERMS = [
  "샤워실", "샤워", "락커", "라커", "탈의실", "주차", "주차장", "대기", "로비", "카운터",
  "화장실", "정수기", "운동복", "수건", "타월", "사우나", "파우더룸", "엘리베이터",
  "지하", "층", "환기", "에어컨", "음악", "거울", "매트", "청결", "위생",
];

/** 산출물 B — 기구·장비·프로그램 */
const EQUIP_TERMS = [
  "런닝머신", "러닝머신", "트레드밀", "사이클", "로잉", "스쿼트랙", "파워랙", "케이블",
  "덤벨", "바벨", "스미스머신", "레그프레스", "랫풀다운", "체스트프레스", "리포머",
  "캐딜락", "체어", "바렐", "링", "케틀벨", "샌드백", "미트", "스피닝", "필록싱",
  "요가매트", "폼롤러", "인바디", "PT", "OT", "그룹수업", "개인레슨",
];

const PRAISE_TERMS = [
  "친절", "깨끗", "쾌적", "넓", "저렴", "가성비", "꼼꼼", "세심", "편하", "만족",
  "좋았", "추천", "시원", "조용", "새것", "최신", "가까", "체계적", "재밌", "재미있",
];

const COMPLAINT_TERMS = [
  "비싸", "좁", "불친절", "더럽", "지저분", "대기", "기다", "붐비", "사람이 많", "주차가 힘",
  "낡", "냄새", "덥", "춥", "시끄", "환불", "강매", "영업", "아쉬", "불편",
];

/** 방문 계기 */
const MOTIVE_TERMS = [
  "이사", "다이어트", "추천", "지인", "친구", "회사 근처", "집 근처", "직장", "결심",
  "체중", "재활", "허리", "무릎", "자세", "출산", "결혼", "여름", "휴가", "건강검진",
];

/** 가격 언급 방식 */
const PRICE_EXACT = /(\d[\d,]{2,})\s*(원|만원|만\s?원)/g;
const PRICE_VAGUE = ["가격대", "비용은", "요금은", "저렴", "합리적", "가성비", "부담", "상담 받아", "문의"];

function sentences(text: string): string[] {
  return text
    .replace(/([.!?…])\s*/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function endingOf(sentence: string): string | null {
  const s = sentence.replace(/[.!?~…\s"'”’)\]]+$/g, "");
  for (const e of ENDINGS) if (s.endsWith(e)) return e;
  return null;
}

function countTerms(texts: string[], terms: string[]): { term: string; n: number }[] {
  const map = new Map<string, number>();
  for (const t of texts) for (const term of terms) if (t.includes(term)) map.set(term, (map.get(term) ?? 0) + 1);
  return [...map.entries()].map(([term, n]) => ({ term, n })).sort((a, b) => b.n - a.n);
}

function pct(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`;
}

function loadCategories(): { key: string; label: string; rows: Row[] }[] {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`❌ ${RAW_DIR} 없음. 먼저 scripts/collect_review_corpus.mts 를 실행하세요.`);
    process.exit(1);
  }
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  return files.map((f) => {
    const rows = fs
      .readFileSync(path.join(RAW_DIR, f), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row)
      .filter((r) => !r.ad_suspect);
    return { key: path.basename(f, ".jsonl"), label: rows[0]?.category_label ?? path.basename(f, ".jsonl"), rows };
  });
}

const textOf = (r: Row) => (r.body && r.body.length > r.summary.length ? r.body : r.summary);
const hasBody = (rows: Row[]) => rows.some((r) => !!r.body && r.body.length > 400);

function main() {
  const cats = loadCategories();
  const bodyAvailable = cats.some((c) => hasBody(c.rows));
  const stamp = new Date().toISOString().slice(0, 10);

  /* ===== 산출물 A ===== */
  const A: string[] = [];
  A.push(`# 네이버 실제 후기 코퍼스 — 문체 근거 리포트 (산출물 A)`);
  A.push(``);
  A.push(`- 생성일: ${stamp}`);
  A.push(`- 수집 방법: 네이버 공식 오픈API(블로그 검색). 본문 크롤링 ${bodyAvailable ? "포함(형 허가분)" : "**없음**"}`);
  A.push(`- 분석 대상 텍스트: ${bodyAvailable ? "본문" : "**제목 + 약 200자 요약 스니펫**"}`);
  A.push(`- ⚠️ 이 리포트의 모든 수치는 위 텍스트 범위에서만 계산됐다. 계산 불가 항목은 "데이터 부족"으로 남긴다.`);
  A.push(``);
  A.push(`## 0. 카테고리별 수집 편수`);
  A.push(``);
  A.push(`| 카테고리 | 편수 | 최소10편 |`);
  A.push(`|---|---:|---|`);
  for (const c of cats) A.push(`| ${c.label} | ${c.rows.length} | ${c.rows.length >= 10 ? "✅" : "⚠️ 미달"} |`);
  A.push(`| **합계** | **${cats.reduce((a, c) => a + c.rows.length, 0)}** | |`);
  A.push(``);

  for (const c of cats) {
    const texts = c.rows.map(textOf);
    const sents = texts.flatMap(sentences);
    A.push(`## ${c.label} (${c.rows.length}편, 문장 ${sents.length}개)`);
    A.push(``);

    if (c.rows.length === 0) {
      A.push(`데이터 부족 — 수집 0편.`);
      A.push(``);
      continue;
    }

    /* 도입부 */
    A.push(`### 도입부(첫 2~3문장) 실제 예시`);
    if (bodyAvailable) {
      const intros = texts.slice(0, 5).map((t) => sentences(t).slice(0, 3).join(" "));
      for (const i of intros) A.push(`- "${i}"`);
      A.push(``);
      A.push(`> 도입부 유형 분류(자기소개형/방문계기형/사실형/일반론형)는 위 실제 문장을 근거로 수기 분류한다.`);
    } else {
      A.push(`**데이터 부족** — 공식 API 요약 스니펫은 글 앞부분이라는 보장이 없고 200자에서 잘린다.`);
      A.push(`도입부 유형 분포는 본문 수집 허가 후에만 산출 가능. 아래는 참고용 스니펫 앞부분 5개:`);
      for (const t of texts.slice(0, 5)) A.push(`- "${t.slice(0, 90)}…"`);
    }
    A.push(``);

    /* 종결어미 */
    const endMap = new Map<string, number>();
    let endTotal = 0;
    for (const s of sents) {
      const e = endingOf(s);
      if (e) {
        endMap.set(e, (endMap.get(e) ?? 0) + 1);
        endTotal++;
      }
    }
    const topEnds = [...endMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    A.push(`### 종결어미 상위 10 (판정된 문장 ${endTotal}개 기준)`);
    A.push(``);
    if (endTotal === 0) {
      A.push(`데이터 부족 — 종결어미가 판정된 문장 없음(스니펫 절단 영향).`);
    } else {
      A.push(`| 어미 | 건수 | 비율 |`);
      A.push(`|---|---:|---:|`);
      for (const [e, n] of topEnds) A.push(`| ~${e} | ${n} | ${pct(n, endTotal)} |`);
    }
    A.push(``);

    /* 군말 */
    const fillers = countTerms(texts, FILLERS).slice(0, 12);
    A.push(`### 군말·구어 표지 (해당 표현이 등장한 글 수 / 전체 ${c.rows.length}편)`);
    A.push(``);
    if (fillers.length === 0) A.push(`데이터 부족 — 검출 0건.`);
    else {
      A.push(`| 표지 | 등장 글 수 | 비율 |`);
      A.push(`|---|---:|---:|`);
      for (const f of fillers) A.push(`| ${f.term} | ${f.n} | ${pct(f.n, c.rows.length)} |`);
    }
    A.push(``);

    /* 길이 */
    const sentLens = sents.map((s) => s.length);
    const avgSent = sentLens.length ? (sentLens.reduce((a, b) => a + b, 0) / sentLens.length).toFixed(1) : "-";
    const docLens = texts.map((t) => t.length).sort((a, b) => a - b);
    A.push(`### 길이 지표`);
    A.push(``);
    A.push(`- 평균 문장 길이: **${avgSent}자** (문장 ${sentLens.length}개)`);
    A.push(
      `- 글 전체 길이: ${
        bodyAvailable
          ? `중앙값 ${docLens[Math.floor(docLens.length / 2)] ?? "-"}자 / 최소 ${docLens[0] ?? "-"} / 최대 ${docLens.at(-1) ?? "-"}`
          : `**데이터 부족** — 스니펫이 200자에서 잘려 전체 길이를 알 수 없음`
      }`,
    );
    A.push(`- 평균 문단 길이: ${bodyAvailable ? "본문 개행 기준 산출" : "**데이터 부족** — 스니펫에 개행이 제거돼 있음"}`);
    A.push(``);

    /* 마무리 */
    A.push(`### 마무리 문장 패턴`);
    A.push(
      bodyAvailable
        ? `- 각 글 마지막 2문장 기준 집계.`
        : `**데이터 부족** — 요약 스니펫에는 글의 마지막 부분이 포함되지 않는다. 본문 수집 허가 후 산출 가능.`,
    );
    A.push(``);
  }

  A.push(`## ❌/⭕ 대조쌍`);
  A.push(``);
  A.push(
    `대조쌍 20개는 위 수집 문장 중 대표 사례를 골라 **수기로** 작성한다(자동 생성 금지 — 창작 문장이 섞이면 근거가 무너짐).`,
  );
  A.push(`작성 규칙: ⭕ = 수집한 실제 후기 문장 원문(그대로), ❌ = 같은 내용을 현재 프롬프트가 금지하는 '장면 연출체'로 바꾼 것.`);
  A.push(``);

  fs.writeFileSync(path.join(OUT_DIR, "report_style.md"), A.join("\n"), "utf8");

  /* ===== 산출물 B ===== */
  const B: string[] = [];
  B.push(`# 네이버 실제 후기 코퍼스 — 소재 재료 풀 (산출물 B)`);
  B.push(``);
  B.push(`- 생성일: ${stamp}`);
  B.push(`- 분석 대상: ${bodyAvailable ? "본문" : "제목 + 약 200자 요약 스니펫"}`);
  B.push(``);
  B.push(`> ⚠️ **이 데이터의 용도**`);
  B.push(`> 페르소나 \`facilities_json\` 이 비었을 때 "그럴듯한 사실"을 지어내는 용도가 **아니다**.`);
  B.push(`> 오직 (1) 어떤 항목을 형에게 물어봐야 하는지 (2) 어떤 주제를 다룰 수 있는지 판단하는 **참고용**이다.`);
  B.push(`> 여기 있는 항목을 그대로 글에 넣으면 사실 날조가 된다.`);
  B.push(``);

  for (const c of cats) {
    const texts = c.rows.map((r) => `${r.title} ${textOf(r)}`);
    B.push(`## ${c.label} (${c.rows.length}편)`);
    B.push(``);
    if (c.rows.length === 0) {
      B.push(`데이터 부족 — 수집 0편.`);
      B.push(``);
      continue;
    }
    const sec = (title: string, list: { term: string; n: number }[], top = 10) => {
      B.push(`**${title}**`);
      B.push(``);
      if (list.length === 0) B.push(`- 데이터 부족 — 검출 0건`);
      else for (const x of list.slice(0, top)) B.push(`- ${x.term} (${x.n}편)`);
      B.push(``);
    };
    sec("시설·공간 요소", countTerms(texts, FACILITY_TERMS));
    sec("기구·장비·프로그램", countTerms(texts, EQUIP_TERMS));
    sec("칭찬 포인트 상위", countTerms(texts, PRAISE_TERMS));
    sec("불만 포인트 상위", countTerms(texts, COMPLAINT_TERMS));
    sec("방문 계기", countTerms(texts, MOTIVE_TERMS));

    const exact = texts.filter((t) => {
      PRICE_EXACT.lastIndex = 0;
      return PRICE_EXACT.test(t);
    }).length;
    const vague = countTerms(texts, PRICE_VAGUE).reduce((a, b) => Math.max(a, b.n), 0);
    B.push(`**가격 언급 방식**`);
    B.push(``);
    B.push(`- 정확한 금액(숫자+원/만원) 표기: ${exact}편 / ${c.rows.length}편 (${pct(exact, c.rows.length)})`);
    B.push(`- 완곡 표현("가격대", "합리적", "상담 문의" 등) 최다 항목 등장: ${vague}편`);
    B.push(``);
  }

  fs.writeFileSync(path.join(OUT_DIR, "report_material.md"), B.join("\n"), "utf8");

  console.log(`✅ report_style.md / report_material.md 생성 완료 → ${OUT_DIR}`);
  console.log(`   본문 데이터: ${bodyAvailable ? "있음" : "없음(요약 스니펫만) — 다수 지표가 '데이터 부족'으로 표기됨"}`);
}

main();
