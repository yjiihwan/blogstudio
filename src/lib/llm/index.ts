/**
 * LLM facade — single interface used by the rest of the app. Real Anthropic
 * SDK call when ANTHROPIC_API_KEY is set; otherwise returns a high-quality
 * deterministic mock so the whole pipeline is testable end-to-end without a
 * key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env, hasAnthropic } from "@/lib/env";

const client = hasAnthropic()
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

export type LLMMessage = { role: "user" | "assistant"; content: string };

export type LLMOptions = {
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: LLMMessage[];
  /** When true, force the mock path even if a key is configured. */
  forceMock?: boolean;
  /** Override (for tests) returning a deterministic completion. */
  mockResponder?: (msgs: LLMMessage[]) => string;
};

export type LLMResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  isMock: boolean;
};

/* Rough Sonnet 4.6 prices in USD per 1M tokens (May 2026) */
const PRICES_USD_PER_M: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
};
const USD_KRW = 1380;

function costFor(model: string, inT: number, outT: number) {
  const p = PRICES_USD_PER_M[model] ?? PRICES_USD_PER_M["claude-sonnet-4-6"];
  const usd = (inT * p.in + outT * p.out) / 1_000_000;
  return Math.round(usd * USD_KRW * 100); // cents of KRW (i.e. 0.01원 단위)
}

export async function llm(opts: LLMOptions): Promise<LLMResult> {
  const model = opts.model ?? env.ANTHROPIC_MODEL_DRAFT;

  if (!client || opts.forceMock) {
    const text = opts.mockResponder
      ? opts.mockResponder(opts.messages)
      : defaultMock(opts);
    const inT = roughTokenCount(
      [opts.system ?? "", ...opts.messages.map((m) => m.content)].join("\n")
    );
    const outT = roughTokenCount(text);
    return {
      text,
      model: "mock",
      inputTokens: inT,
      outputTokens: outT,
      costCents: 0,
      isMock: true,
    };
  }

  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: opts.messages,
  });

  const text =
    res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n")
      .trim() ?? "";
  const inT = res.usage?.input_tokens ?? 0;
  const outT = res.usage?.output_tokens ?? 0;

  return {
    text,
    model,
    inputTokens: inT,
    outputTokens: outT,
    costCents: costFor(model, inT, outT),
    isMock: false,
  };
}

export function roughTokenCount(s: string) {
  /* Korean text averages ~1 token per Korean char; English ~1/4. */
  let count = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    count += code >= 0xac00 && code <= 0xd7a3 ? 1 : 0.3;
  }
  return Math.round(count);
}

/* Naive default mock: echoes back a templated outline based on the last user
   message. Used when no API key is present, so the UI flow stays alive. */
function defaultMock(opts: LLMOptions): string {
  const last = opts.messages.at(-1)?.content ?? "";
  if (last.includes("주제 후보")) {
    return JSON.stringify(
      [
        {
          title: "[MOCK] 초여름 점심으로 좋은 한그릇 메뉴 3가지",
          angle: "데모 — Anthropic 키 미연결 상태에서 생성됨",
          primaryKeyword: "초여름 점심",
          secondaryKeywords: ["직화구이 한그릇", "강남 점심"],
          rationale: "시즌성 + 검색량 안정",
          score: 75,
        },
      ],
      null,
      2
    );
  }
  return [
    "## [MOCK] AI 키 미연결 — 데모 출력",
    "",
    "Anthropic API 키가 등록되지 않아 실제 글이 생성되지 않았습니다.",
    "설정 → API 키에서 sk-ant-… 키를 등록하면 이 부분이 실제 본문으로 바뀝니다.",
    "",
    "지금은 흐름 확인용 자리표시 텍스트입니다.",
  ].join("\n");
}
