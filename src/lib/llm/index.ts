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

// 저장된 개인 키를 복호화할 수 없을 때(주로 ENCRYPTION_KEY가 키 저장 시점과
// 달라진 경우). 과거엔 이 실패를 삼키고 시스템 키로 폴백했는데, 그 시스템 키가
// 플레이스홀더면 결국 401이 나면서 "키가 올바르지 않습니다"라는 엉뚱한 안내가 떴다.
export class ApiKeyUndecryptableError extends Error {
  constructor(provider: "anthropic" | "openai" = "anthropic") {
    const label = provider === "openai" ? "OpenAI" : "Anthropic";
    super(
      `저장된 ${label} 키를 복호화할 수 없습니다. 설정 → 내 API 키에서 키를 다시 입력해주세요.`
    );
    this.name = "ApiKeyUndecryptableError";
  }
}

// 시스템(공용) 키가 없거나 플레이스홀더라 실제 호출이 불가능할 때 — 운영자 조치 필요.
export class SystemApiKeyMissingError extends Error {
  constructor(provider: "anthropic" | "openai" = "anthropic") {
    const label = provider === "openai" ? "OpenAI" : "Anthropic";
    super(
      `시스템 ${label} 키가 설정되지 않았습니다. 관리자에게 문의해주세요. (설정 → 시스템 키)`
    );
    this.name = "SystemApiKeyMissingError";
  }
}

// 명백한 테스트/플레이스홀더 키는 실제 API로 보내면 401만 유발하므로 "키 없음"으로 취급한다.
// 예: "sk-ant-api03-E2E-TEST-DO-NOT-USE-0000"
function isPlaceholderKey(k: string | null | undefined): boolean {
  if (!k) return true;
  if (/E2E[-_ ]?TEST|DO[-_ ]?NOT[-_ ]?USE|PLACEHOLDER|XXXX|YOUR[-_ ]?KEY/i.test(k))
    return true;
  // 정상 키 길이에 한참 못 미치면(잘린/더미) 무효 처리
  if (k.replace(/[^A-Za-z0-9_-]/g, "").length < 24) return true;
  return false;
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
  /** 추론형 모델(gpt-5.x) 추론 강도 override. 구조적 단계(주제·아웃라인)는 "low"로
   *  낮춰 속도↑(프로즈 퀄 무관), 창작 단계(본문·사람화)는 기본(high) 유지. */
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
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
    // 전역 설정이 비어있으면(전파 코드 배포 전 admin이 고른 경우 등) admin의 개인 선택으로 폴백.
    // WHY: 무조건 anthropic 폴백 시, anthropic 시스템 키가 없거나 가짜면 system 모드 유저 전체가 401.
    const admin = await db.query.users.findFirst({
      where: eq(schema.users.role, "admin"),
    });
    const ap = admin?.llmProvider;
    if (ap === "openai" || ap === "anthropic") return ap;
  } catch {
    // DB read failure → fall back to anthropic
  }
  return "anthropic";
}

// 시스템 키 모드 해소: 선택된 provider의 시스템 키가 플레이스홀더/누락이면
// 실제 키가 있는 다른 provider로 자동 전환(가동률 우선). 둘 다 없으면 명시적 에러.
async function resolveSystemProviderAndKey(): Promise<ProviderKey> {
  const primary = await getSystemProvider();
  const primaryKey = await getSystemKey(primary);
  if (!isPlaceholderKey(primaryKey)) return { provider: primary, apiKey: primaryKey };

  const alt = primary === "anthropic" ? "openai" : "anthropic";
  const altKey = await getSystemKey(alt);
  if (!isPlaceholderKey(altKey)) {
    console.warn(
      `[llm] 시스템 ${primary} 키가 플레이스홀더/누락 → 유효한 ${alt} 키로 자동 전환`
    );
    return { provider: alt, apiKey: altKey };
  }
  // 운영: 사실대로 에러를 띄운다(가짜 키를 API로 보내 401을 만들지 않는다).
  // 개발/테스트: 키 없이도 파이프라인이 돌도록 mock 경로(apiKey=null)로 떨어뜨린다.
  if (process.env.NODE_ENV === "production") {
    throw new SystemApiKeyMissingError(primary);
  }
  return { provider: primary, apiKey: null };
}

async function resolveProviderAndKey(userId?: string): Promise<ProviderKey> {
  if (userId) {
    const user = await db.query.users
      .findFirst({ where: eq(schema.users.id, userId) })
      .catch(() => null);
    if (user) {
      if (user.apiKeyMode === "user_key") {
        // 개인 키 모드: 유저 본인이 고른 provider + 본인 개인키. 실패해도 시스템 키로
        // 몰래 폴백하지 않는다(폴백 키가 플레이스홀더면 401 + 엉뚱한 안내를 유발).
        const provider = (user.llmProvider ?? "anthropic") as "anthropic" | "openai";
        const encKey =
          provider === "anthropic" ? user.anthropicApiKey : user.openaiApiKey;
        if (!encKey) throw new UserApiKeyMissingError(provider);
        let apiKey: string;
        try {
          apiKey = decryptApiKey(encKey);
        } catch {
          throw new ApiKeyUndecryptableError(provider);
        }
        if (isPlaceholderKey(apiKey)) throw new UserApiKeyMissingError(provider);
        return { provider, apiKey };
      }
      // 시스템 키 모드
      return resolveSystemProviderAndKey();
    }
  }
  // 유저 맥락 없음(cron 등): 시스템 키 해소 경로 사용
  return resolveSystemProviderAndKey();
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
      // 진짜 원인(상태코드·에러타입)을 서버 로그에 남긴다 — 진단용.
      console.error(
        `[llm] Anthropic 호출 실패 status=${err.status} type=${errType ?? "?"} model=${model} keyMask=${maskKey(apiKey)} msg=${err.message}`
      );
      if (
        err.status === 402 ||
        errType === "credit_balance_exceeded" ||
        errType === "insufficient_quota"
      ) {
        throw new CreditExhaustedError();
      }
    } else {
      console.error(`[llm] Anthropic 호출 실패(비API에러):`, err);
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

  // 신형 모델(gpt-5.x)은 max_tokens 대신 max_completion_tokens를 쓰고, reasoning에
  // 토큰을 소비하므로 넉넉히 잡아야 본문이 안 잘린다(작은 요청도 최소 1024 확보).
  const maxOut = Math.max(opts.maxTokens ?? 12000, 1024);
  // 추론형 모델(gpt-5.x / o-시리즈) 추론 강도. 실측 결과 창작 글쓰기에선 high와
  // xhigh(최고) 퀄 차이가 사실상 없고 xhigh는 ~2배 느림·비쌈 → 기본 "high"(퀄 동일,
  // 빠르고 저렴, prod 타임아웃 위험 ↓). 필요시 env OPENAI_REASONING_EFFORT=xhigh.
  const isReasoning = /^(gpt-5|o[0-9])/.test(model);
  const effort = opts.reasoningEffort ?? process.env.OPENAI_REASONING_EFFORT ?? "high";
  const reasoning = isReasoning ? { reasoning_effort: effort as "low" | "medium" | "high" | "xhigh" } : {};
  let res: OpenAI.Chat.Completions.ChatCompletion;
  try {
    res = await client.chat.completions.create({
      model,
      max_completion_tokens: maxOut,
      ...reasoning,
      messages,
    });
  } catch (err) {
    // 일부 구모델은 max_completion_tokens를 모르고 max_tokens만 받는다 → 폴백.
    if (
      err instanceof OpenAI.APIError &&
      /max_completion_tokens|max_tokens|unsupported_parameter|unknown_parameter/i.test(
        `${err.code ?? ""} ${err.message}`
      )
    ) {
      try {
        res = await client.chat.completions.create({
          model,
          max_tokens: opts.maxTokens ?? 4096,
          messages,
        });
      } catch (err2) {
        if (err2 instanceof OpenAI.APIError && (err2.status === 429 || err2.status === 402))
          throw new CreditExhaustedError();
        throw err2;
      }
    } else if (err instanceof OpenAI.APIError) {
      console.error(
        `[llm] OpenAI 호출 실패 status=${err.status} code=${err.code ?? "?"} model=${model} keyMask=${maskKey(apiKey)} msg=${err.message}`
      );
      if (err.status === 429 || err.status === 402) throw new CreditExhaustedError();
      throw err;
    } else {
      console.error(`[llm] OpenAI 호출 실패(비API에러):`, err);
      throw err;
    }
  }

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  const inT = res.usage?.prompt_tokens ?? 0;
  const outT = res.usage?.completion_tokens ?? 0;
  return { text, model, inputTokens: inT, outputTokens: outT, costCents: costFor(model, inT, outT), isMock: false };
}

// 로그에 키 원문이 새지 않도록 마스킹(앞 8자 + 길이만 노출).
function maskKey(k: string | null | undefined): string {
  if (!k) return "(none)";
  return `${k.slice(0, 8)}…len${k.length}`;
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
