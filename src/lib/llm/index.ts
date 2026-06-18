/**
 * LLM facade — provider-agnostic interface used by the rest of the app.
 * Routes to Anthropic or OpenAI based on the calling user's llmProvider setting.
 * Falls back to mock when no key is available (keeps pipeline testable without keys).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto";

export class CreditExhaustedError extends Error {
  constructor() {
    super("API 크레딧이 소진되었습니다. 관리자에게 문의해주세요.");
    this.name = "CreditExhaustedError";
  }
}

export class UserApiKeyMissingError extends Error {
  constructor(provider: "anthropic" | "openai" = "anthropic") {
    const label = provider === "openai" ? "OpenAI" : "Anthropic";
    super(
      `API 키를 먼저 입력해주세요. 설정 → 내 API 키에서 ${label} 키를 등록하면 글 생성이 가능합니다.`
    );
    this.name = "UserApiKeyMissingError";
  }
}

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
  /** If provided, resolves the API key and provider from this user's settings. */
  callerUserId?: string;
};

export type LLMResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  isMock: boolean;
};

/* Prices in USD per 1M tokens */
const PRICES_USD_PER_M: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
  "gpt-4o": { in: 5, out: 15 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};
const USD_KRW = 1380;

function costFor(model: string, inT: number, outT: number) {
  const p = PRICES_USD_PER_M[model] ?? PRICES_USD_PER_M["claude-sonnet-4-6"];
  const usd = (inT * p.in + outT * p.out) / 1_000_000;
  return Math.round(usd * USD_KRW * 100);
}

type ProviderKey = { provider: "anthropic" | "openai"; apiKey: string | null };

async function getSystemKey(provider: "anthropic" | "openai"): Promise<string | null> {
  const settingsKey = provider === "anthropic" ? "anthropic_api_key" : "openai_api_key";
  try {
    const row = await db.query.settings.findFirst({
      where: eq(schema.settings.key, settingsKey),
    });
    if (row) {
      const k = JSON.parse(row.valueJson) as string;
      if (k) return k;
    }
  } catch {
    // DB read failure → fall through to env
  }
  return provider === "anthropic"
    ? env.ANTHROPIC_API_KEY || null
    : env.OPENAI_API_KEY || null;
}

async function getSystemProvider(): Promise<"anthropic" | "openai"> {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(schema.settings.key, "system_llm_provider"),
    });
    if (row) {
      const p = JSON.parse(row.valueJson) as string;
      if (p === "openai" || p === "anthropic") return p;
    }
  } catch {
    // DB read failure → fall back to anthropic
  }
  return "anthropic";
}

async function resolveProviderAndKey(userId?: string): Promise<ProviderKey> {
  if (userId) {
    try {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });
      if (user) {
        if (user.apiKeyMode === "user_key") {
          // 개인 키 모드: 유저 본인이 form에서 고른 provider + 본인 개인키 그대로.
          const provider = (user.llmProvider ?? "anthropic") as "anthropic" | "openai";
          const encKey =
            provider === "anthropic" ? user.anthropicApiKey : user.openaiApiKey;
          if (!encKey) throw new UserApiKeyMissingError(provider);
          return { provider, apiKey: decryptApiKey(encKey) };
        }
        // 시스템 키 모드: 어드민이 정한 전역 provider를 따른다(개별 user.llmProvider 무시).
        const provider = await getSystemProvider();
        const apiKey = await getSystemKey(provider);
        return { provider, apiKey };
      }
    } catch (err) {
      if (err instanceof UserApiKeyMissingError) throw err;
      // DB/decrypt error → fall through to system Anthropic key
    }
  }
  // No user or lookup failed: Anthropic system key
  const apiKey = await getSystemKey("anthropic");
  return { provider: "anthropic", apiKey };
}

export async function llm(opts: LLMOptions): Promise<LLMResult> {
  const { provider, apiKey } = opts.forceMock
    ? { provider: "anthropic" as const, apiKey: null }
    : await resolveProviderAndKey(opts.callerUserId);

  if (!apiKey || opts.forceMock) {
    const text = opts.mockResponder
      ? opts.mockResponder(opts.messages)
      : defaultMock(opts);
    const inT = roughTokenCount(
      [opts.system ?? "", ...opts.messages.map((m) => m.content)].join("\n")
    );
    const outT = roughTokenCount(text);
    return { text, model: "mock", inputTokens: inT, outputTokens: outT, costCents: 0, isMock: true };
  }

  if (provider === "openai") {
    return callOpenAI(opts, apiKey);
  }
  return callAnthropic(opts, apiKey);
}

async function callAnthropic(opts: LLMOptions, apiKey: string): Promise<LLMResult> {
  const model = opts.model ?? env.ANTHROPIC_MODEL_DRAFT;
  const client = new Anthropic({ apiKey });

  let res: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: opts.messages,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const errType = (err.error as { type?: string } | null)?.type;
      if (
        err.status === 402 ||
        errType === "credit_balance_exceeded" ||
        errType === "insufficient_quota"
      ) {
        throw new CreditExhaustedError();
      }
    }
    throw err;
  }

  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("\n").trim();
  const inT = res.usage?.input_tokens ?? 0;
  const outT = res.usage?.output_tokens ?? 0;
  return { text, model, inputTokens: inT, outputTokens: outT, costCents: costFor(model, inT, outT), isMock: false };
}

async function callOpenAI(opts: LLMOptions, apiKey: string): Promise<LLMResult> {
  const model = opts.model ?? env.OPENAI_MODEL_DRAFT;
  const client = new OpenAI({ apiKey });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  let res: OpenAI.Chat.Completions.ChatCompletion;
  try {
    res = await client.chat.completions.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429 || err.status === 402) throw new CreditExhaustedError();
    }
    throw err;
  }

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  const inT = res.usage?.prompt_tokens ?? 0;
  const outT = res.usage?.completion_tokens ?? 0;
  return { text, model, inputTokens: inT, outputTokens: outT, costCents: costFor(model, inT, outT), isMock: false };
}

export function roughTokenCount(s: string) {
  let count = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    count += code >= 0xac00 && code <= 0xd7a3 ? 1 : 0.3;
  }
  return Math.round(count);
}

function defaultMock(opts: LLMOptions): string {
  const last = opts.messages.at(-1)?.content ?? "";
  if (last.includes("주제 후보")) {
    return JSON.stringify(
      [{ title: "[MOCK] 초여름 점심으로 좋은 한그릇 메뉴 3가지", angle: "데모 — LLM 키 미연결 상태에서 생성됨", primaryKeyword: "초여름 점심", secondaryKeywords: ["직화구이 한그릇", "강남 점심"], rationale: "시즌성 + 검색량 안정", score: 75 }],
      null,
      2
    );
  }
  return [
    "## [MOCK] AI 키 미연결 — 데모 출력",
    "",
    "API 키가 등록되지 않아 실제 글이 생성되지 않았습니다.",
    "설정 → 내 API 키에서 키를 등록하면 이 부분이 실제 본문으로 바뀝니다.",
    "",
    "지금은 흐름 확인용 자리표시 텍스트입니다.",
  ].join("\n");
}
