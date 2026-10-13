/* 자동검수 개편(A안) + 개선 제안 — 순수 규칙 단위 테스트(DB·네트워크 없음)
   실행: npx tsx scripts/test_review_core.ts */
import {
  HARD_FLAGS, VERDICT_LABEL, extractJsonObject, findTermHits, formatWon, imageMarkerSlots, imageMarkersPreserved, parseReviewResponse, summarizeCalls,
} from "../src/lib/review-core";
import {
  PERSONA_FIELDS, applyGuideChange, diffLines, displayValue, fieldLabel, isRejectBlocked, normalizeIssue, normalizePersonaField, parseListValue,
  personaColumnValue, proposalSummaryLine, shouldPromotePending, shouldProposeImmediately,
} from "../src/lib/proposals-core";
import { NOTIFY_EVENTS, TEMPLATES, fillVars, renderTemplate } from "../src/lib/notify/alimtalk-core";
import { reviewUserPrompt, similarityPrompt } from "../src/lib/llm/review-prompts";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${note ? ` — ${note}` : ""}`);
};

console.log("== 검수 응답 파싱 ==");
const good = `{"verdict":"revise","reason":"도입이 상투적입니다.","revised_body_md":"# 제목\\n\\n본문 <!-- IMG:slot=0 -->","hard_flags":["unfinished_slots","bogus"],"setting_issues":[{"target":"persona","field":"brandVoice","problem":"톤 지시가 모호","proposed_change":{"before":"친근하게","after":"친근하되 과장 없이"},"confidence":"high","systemic":true},{"target":"persona"}]}`;
const p1 = parseReviewResponse(good)!;
check("정상 JSON 파싱", !!p1 && p1.verdict === "revise");
check("알 수 없는 hard_flag 제거", p1.hardFlags.length === 1 && p1.hardFlags[0] === "unfinished_slots");
check("수정본 추출", p1.revisedBodyMd?.includes("IMG:slot=0") === true);
check("setting_issues 스키마 불일치 항목 버림", p1.settingIssues.length === 1 && p1.droppedIssues === 1);
check("코드펜스 감싼 JSON 파싱", parseReviewResponse("```json\n{\"verdict\":\"approve\",\"reason\":\"좋음\"}\n```")?.verdict === "approve");
check("앞뒤 잡음 섞인 JSON 파싱", parseReviewResponse("판단 결과입니다:\n{\"verdict\":\"reject\",\"reason\":\"날조\"}\n끝")?.verdict === "reject");
check("비JSON 응답 → null(자동 승인 금지 경로)", parseReviewResponse("승인합니다. 문제 없음.") === null);
check("verdict 값 불량 → null", parseReviewResponse(`{"verdict":"ok","reason":"x"}`) === null);
check("빈 문자열 → null", parseReviewResponse("") === null && extractJsonObject("") === null);
check("HARD_FLAGS 4종", HARD_FLAGS.length === 4);
check("판정 라벨 4종(한국어)", Object.keys(VERDICT_LABEL).length === 4 && VERDICT_LABEL.failed === "검수 실패");

console.log("== 사진 자리 마커 보존 ==");
const orig = "a <!-- IMG:slot=0 --> b <!-- IMG:slot=2 --> c";
check("마커 순서 추출", imageMarkerSlots(orig).join(",") === "0,2");
check("동일 → 보존", imageMarkersPreserved(orig, "x <!-- IMG:slot=0 --> y <!--IMG:slot=2--> z"));
check("개수 부족 → 유실", !imageMarkersPreserved(orig, "x <!-- IMG:slot=0 --> z"));
check("순서 바뀜 → 유실", !imageMarkersPreserved(orig, "<!-- IMG:slot=2 --> <!-- IMG:slot=0 -->"));
check("마커 없는 글은 항상 보존", imageMarkersPreserved("no markers", "still none"));

console.log("== 금지어·없는 시설 잔존 ==");
check("띄어쓰기 우회 검출", findTermHits("저희 수 영 장은 넓어요", ["수영장"]).length === 1);
check("없으면 빈 배열", findTermHits("헬스장 후기", ["수영장", "사우나"]).length === 0);
check("빈 용어 무시", findTermHits("본문", ["", "  "]).length === 0);

console.log("== 호출 집계·비용 표기 ==");
const meta = summarizeCalls([
  { model: "gpt-5.5", purpose: "검수", inTokens: 100, outTokens: 50, costCents: 120 },
  { model: "gpt-5.5", purpose: "재검수", inTokens: 100, outTokens: 20, costCents: 80 },
  { model: "gpt-6.1-sol", purpose: "유사판정", inTokens: 10, outTokens: 5, costCents: 3 },
], true);
check("모델별 호출 횟수", meta.byModel["gpt-5.5"].calls === 2 && meta.byModel["gpt-6.1-sol"].calls === 1);
check("총비용 합산", meta.costCents === 203 && meta.revised === true);
check("원 표기", formatWon(123456) === "약 1,235원");

console.log("== 프롬프트 ==");
const up = reviewUserPrompt({ title: "T", bodyMd: "B", guideText: "G", personaText: "P", allowRevise: true });
check("1차 프롬프트: revise 허용 문구·JSON 스키마", up.includes('"revise"') && up.includes("revised_body_md") && up.includes("setting_issues"));
const up2 = reviewUserPrompt({ title: "T", bodyMd: "B", guideText: "G", personaText: "P", allowRevise: false, priorReason: "r" });
check("재검수 프롬프트: approve/reject 만", up2.includes("approve") && up2.includes("더 고칠 수 없다") && up2.includes("1차 검수 사유"));
check("숫자 기준 없음 명시", up.includes("숫자 기준은 없다"));
check("설정 범위 밖 제안 금지", up.includes("API 키") && up.includes("절대 제안하지 않는다"));
check("유사판정 프롬프트", similarityPrompt({ candidate: { target: "persona", field: "brandVoice", problem: "p", after: "a" }, existing: [{ id: "x1", field: "brandVoice", problem: "q", after: "b", status: "pending" }] }).includes("same_as"));

console.log("== 개선 제안 규칙 ==");
check("systemic+high → 즉시", shouldProposeImmediately({ systemic: true, confidence: "high" }));
check("systemic+medium → 보류", !shouldProposeImmediately({ systemic: true, confidence: "medium" }));
check("비systemic+high → 보류", !shouldProposeImmediately({ systemic: false, confidence: "high" }));
check("다른 초안 2건 → 승격", shouldPromotePending(["d1", "d2"]) && !shouldPromotePending(["d1", "d1"]) && !shouldPromotePending(["d1"]));
const now = new Date("2026-10-13T00:00:00Z");
check("거절 29일 → 재제안 금지", isRejectBlocked("2026-09-14T00:00:00Z", now));
check("거절 31일 → 허용", !isRejectBlocked("2026-09-12T00:00:00Z", now));
check("거절일 없음 → 허용", !isRejectBlocked(null, now));

console.log("== 페르소나 항목 정규화·값 변환 ==");
check("컬럼명 그대로", normalizePersonaField("forbiddenWordsJson") === "forbiddenWordsJson");
check("별칭(금지어)", normalizePersonaField("금지어") === "forbiddenWordsJson" && normalizePersonaField("brand_voice") === "brandVoice");
check("모르는 항목 → null", normalizePersonaField("preferredLengthMin") === null && normalizePersonaField("apiKey") === null);
check("목록: JSON 배열", JSON.stringify(parseListValue('["수영장","사우나"]')) === '["수영장","사우나"]');
check("목록: 줄 구분", JSON.stringify(parseListValue("- 수영장\n- 사우나\n")) === '["수영장","사우나"]');
check("목록: 쉼표 구분", JSON.stringify(parseListValue("수영장, 사우나")) === '["수영장","사우나"]');
check("enum 유효", personaColumnValue("formality", "formal") === "formal");
check("enum 불량 → null", personaColumnValue("formality", "아주 격식") === null);
check("텍스트 그대로", personaColumnValue("brandVoice", "담백하게") === "담백하게");
check("숫자 항목은 허용 목록에 없음", !PERSONA_FIELDS["preferredLengthMin"] && !PERSONA_FIELDS["emojiIntensity"]);
check("표시값(목록 줄바꿈)", displayValue("facilitiesJson", '["a","b"]', "persona") === "a\nb");
const ni = normalizeIssue({ target: "persona", field: "톤", problem: "x", proposed_change: { before: "", after: "담백" }, confidence: "high", systemic: true });
check("normalizeIssue 별칭 → 컬럼", ni?.field === "brandVoice");
check("normalizeIssue enum 불량 → null", normalizeIssue({ target: "persona", field: "formality", problem: "x", proposed_change: { before: "", after: "격식체" }, confidence: "high", systemic: true }) === null);
check("normalizeIssue after 비면 null", normalizeIssue({ target: "global_guide", field: "3. 남용", problem: "x", proposed_change: { before: "a", after: "  " }, confidence: "high", systemic: true }) === null);
check("라벨", fieldLabel("persona", "brandVoice") === "톤·말투" && fieldLabel("global_guide", "3. 남용 단어").startsWith("전체 글쓰기 가이드"));

console.log("== 전역 가이드 문단 교체 ==");
const guide = "# 규칙\n\n## 3. 남용\n- 정말, 너무 금지\n\n## 4. 리듬\n- 변주";
const r1 = applyGuideChange(guide, "3. 남용", "- 정말, 너무 금지", "- 정말, 너무, 진짜 금지");
check("정확 일치 교체", r1.mode === "replaced" && r1.text.includes("진짜 금지") && !r1.text.includes("- 정말, 너무 금지\n"));
const r2 = applyGuideChange(guide, "3. 남용", "-  정말,   너무 금지", "- X");
check("공백 차이 줄 단위 교체", r2.mode === "replaced" && r2.text.includes("- X"));
const r3 = applyGuideChange(guide, "8. 새 규칙", "없는 문단", "- 새 내용");
check("못 찾으면 끝에 덧붙임", r3.mode === "appended" && r3.text.endsWith("## 8. 새 규칙\n- 새 내용"));
check("원문 보존", r3.text.startsWith(guide));

console.log("== diff·요약 ==");
const d = diffLines("a\nb\nc", "a\nx\nc");
check("줄 diff", d.filter((l) => l.type === "same").length === 2 && d.some((l) => l.type === "del" && l.text === "b") && d.some((l) => l.type === "add" && l.text === "x"));
const sum = proposalSummaryLine({ target: "persona", field: "brandVoice", problem: "  톤이   과장됨 ".repeat(10) }, "엔짐");
check("알림 요약(대상·80자)", sum.대상 === "엔짐 페르소나 · 톤·말투" && sum.내용.length <= 80);

console.log("== 알림 템플릿 6종 ==");
check("NOTIFY_EVENTS 6종", NOTIFY_EVENTS.length === 6 && NOTIFY_EVENTS.includes("improvement_proposal"));
const t = TEMPLATES.improvement_proposal;
check("템플릿 변수 3종", t.vars.length === 3 && t.text.includes("#{제안주소}"));
const rendered = renderTemplate(t.text, fillVars("improvement_proposal", { 대상: "엔짐 페르소나 · 톤·말투", 내용: "과장 표현", 제안주소: "https://x/proposals/1" }));
check("치환 후 #{} 없음·개발 용어 없음", !rendered.includes("#{") && !/json|persona|verdict/i.test(rendered));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
