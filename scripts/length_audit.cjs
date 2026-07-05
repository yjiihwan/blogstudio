const Database = require("better-sqlite3");
const db = new Database("blog_studio.db", { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);
console.log("TABLES:", tables.join(", "));

// personas: preferred length
const personas = db
  .prepare(
    "SELECT id, blog_id, preferred_length_min, preferred_length_max, is_active FROM personas"
  )
  .all();
console.log("\n=== PERSONAS (목표 분량) ===");
for (const p of personas) {
  console.log(
    `persona=${p.id.slice(0, 8)} blog=${p.blog_id.slice(0, 8)} active=${p.is_active} target=${p.preferred_length_min}~${p.preferred_length_max}자`
  );
}

// drafts: charCount vs persona target + how it was created
const drafts = db
  .prepare(
    `SELECT d.id, d.blog_id, d.title, d.char_count, d.revision_round,
            d.llm_model, d.llm_output_tokens, d.created_at,
            t.source AS topic_source
     FROM drafts d
     LEFT JOIN topic_candidates t ON t.id = d.topic_id
     ORDER BY d.created_at DESC`
  )
  .all();

// map blog -> active persona target
const targetByBlog = {};
for (const p of personas) {
  if (p.is_active || targetByBlog[p.blog_id] === undefined) {
    targetByBlog[p.blog_id] = {
      min: p.preferred_length_min,
      max: p.preferred_length_max,
    };
  }
}

console.log("\n=== DRAFTS: 목표 vs 실제 글자수(공백 제외) ===");
console.log(
  "created            | src     | rev | model            | outTok | target      | actual | 달성률 | title"
);
const rows = [];
for (const d of drafts) {
  const t = targetByBlog[d.blog_id] || { min: "?", max: "?" };
  const tgtMid =
    typeof t.min === "number" && typeof t.max === "number"
      ? Math.round((t.min + t.max) / 2)
      : null;
  const pct = tgtMid ? Math.round((d.char_count / tgtMid) * 100) + "%" : "?";
  const created = (d.created_at || "").slice(0, 16).replace("T", " ");
  console.log(
    `${created.padEnd(18)} | ${(d.topic_source || "?").padEnd(7)} | ${String(d.revision_round).padEnd(3)} | ${(d.llm_model || "?").padEnd(16)} | ${String(d.llm_output_tokens ?? "?").padStart(6)} | ${(t.min + "~" + t.max + "자").padEnd(11)} | ${String(d.char_count).padStart(6)} | ${String(pct).padStart(5)} | ${(d.title || "").slice(0, 30)}`
  );
  rows.push({ src: d.topic_source, target: tgtMid, actual: d.char_count, pct: tgtMid ? d.char_count / tgtMid : null });
}

// aggregate: automatic (llm topic source) path shortfall
console.log("\n=== 경로별 평균 달성률 ===");
const byPath = {};
for (const r of rows) {
  if (r.pct == null) continue;
  const key = r.src === "manual" ? "반자동(brief)" : "자동(llm topic)";
  (byPath[key] = byPath[key] || []).push(r.pct);
}
for (const [k, arr] of Object.entries(byPath)) {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const under = arr.filter((x) => x < 0.8).length;
  console.log(
    `${k}: n=${arr.length}, 평균달성률=${Math.round(avg * 100)}%, 목표80%미만=${under}/${arr.length}`
  );
}
