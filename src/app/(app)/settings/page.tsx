export const dynamic = "force-dynamic";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getStoredApiKeyMasked,
  getStoredSystemOpenAIKeyMasked,
  getStoredUnsplashKeyMasked,
  getStoredPexelsKeyMasked,
  getStoredGoogleAiKeyMasked,
  getStoredTelegramTokenMasked,
  getUserApiKeyInfo,
  getImageApiKeyInfo,
  getLLMProviderInfo,
} from "./actions";
import { ImageSourceForm, UserImageSourceForm } from "./image-source-form";
import { TelegramForm } from "./telegram-form";
import { LLMProviderForm } from "./llm-provider-form";
import { SystemLLMForm } from "./system-llm-form";
import { SystemChip, PersonalChip } from "@/components/ui/key-type-chip";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default async function SettingsPage() {
  const [
    dbMasked,
    systemOpenAIMasked,
    unsplashMasked,
    pexelsMasked,
    googleAiMasked,
    userApiKeyInfo,
    imageKeyInfo,
    llmProviderInfo,
  ] = await Promise.all([
    getStoredApiKeyMasked(),
    getStoredSystemOpenAIKeyMasked(),
    getStoredUnsplashKeyMasked(),
    getStoredPexelsKeyMasked(),
    getStoredGoogleAiKeyMasked(),
    getUserApiKeyInfo(),
    getImageApiKeyInfo(),
    getLLMProviderInfo(),
  ]);
  const isAdmin = userApiKeyInfo.role === "admin";
  const telegramTokenMasked = isAdmin ? await getStoredTelegramTokenMasked() : null;
  const isUserKeyMode = userApiKeyInfo.mode === "user_key";
  // 어드민 통합 카드의 헤더 배지: 현재 선택된 provider의 시스템 키가 등록돼 있는가
  const selectedSystemKeyConnected =
    llmProviderInfo.provider === "openai" ? !!systemOpenAIMasked : !!dbMasked;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Settings
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">설정</h1>
      </header>

      <div className="space-y-3">
        {/* ── AI 글쓰기 설정 (어드민 = 시스템) ─────────────────── */}
        {isAdmin && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base">AI 글쓰기 설정</h2>
                  <SystemChip />
                </div>
                {selectedSystemKeyConnected ? (
                  <Badge tone="leaf">연결됨</Badge>
                ) : (
                  <Badge tone="amber">미연결</Badge>
                )}
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                사용할 LLM(Claude 또는 ChatGPT)을 고르고 해당 API 키를 등록하세요.
                이 키는 전체 시스템이 공유하는 키이며, 글 생성·재작성에 사용됩니다.
              </p>
              <SystemLLMForm
                initialProvider={llmProviderInfo.provider}
                initialAnthropicMasked={dbMasked}
                initialOpenAIMasked={systemOpenAIMasked}
              />
            </CardContent>
          </Card>
        )}

        {/* ── AI 사용 설정 안내 (비어드민 + 시스템 모드) ───────── */}
        {!isAdmin && userApiKeyInfo.mode === "system" && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">AI 사용 설정</h2>
                <Badge tone="leaf">시스템 키 사용 중</Badge>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">
                이 계정은 <strong>시스템 키 모드</strong>로 설정되어 있습니다.
                별도 API 키 등록 없이 AI 기능(글 생성, 재작성)을 바로 사용할 수 있습니다.
              </p>
              <p className="text-xs text-ink-500 mt-2">
                현재 LLM:{" "}
                <strong>
                  {llmProviderInfo.provider === "openai" ? "ChatGPT (OpenAI)" : "Claude (Anthropic)"}
                </strong>
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── LLM 선택 + 개인 키 (일반 사용자, 유저 키 모드) ──── */}
        {!isAdmin && isUserKeyMode && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base">AI 글쓰기 설정</h2>
                  <PersonalChip />
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone="amber">개인 키 모드</Badge>
                  <InfoTooltip label="개인 키 모드 설명">
                    <p className="font-semibold mb-0.5">API 비용은 본인 계정으로 직접 청구됩니다.</p>
                    <p className="text-ink-400">
                      등록한 API 키로 글이 생성되며, 사용량은 Anthropic·OpenAI 대시보드에서 확인할 수 있습니다.
                    </p>
                  </InfoTooltip>
                </div>
              </div>
              <p className="text-xs text-ink-500 leading-relaxed mb-3 sm:hidden">
                API 비용은 본인 계정으로 직접 청구됩니다.
              </p>
              <p className="text-sm text-ink-600 leading-relaxed mb-4 hidden sm:block">
                사용할 LLM을 선택하고 해당 API 키를 등록하세요.
                API 비용은 본인 계정으로 청구됩니다.
              </p>
              <LLMProviderForm
                initialProvider={llmProviderInfo.provider}
                initialAnthropicMasked={llmProviderInfo.anthropicMasked}
                initialOpenAIMasked={llmProviderInfo.openaiMasked}
              />
            </CardContent>
          </Card>
        )}

        {/* ── 이미지 소스 (어드민 시스템 키) ──────────────────── */}
        {isAdmin && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-bold text-base">이미지 소스</h2>
                <SystemChip />
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                전체 시스템에서 공유하는 이미지 API 키입니다. 시스템 키 모드 계정이 함께 사용합니다.
              </p>
              <ImageSourceForm
                unsplashMasked={unsplashMasked}
                pexelsMasked={pexelsMasked}
                googleAiMasked={googleAiMasked}
              />
            </CardContent>
          </Card>
        )}

        {/* ── 이미지 소스 (비어드민 시스템 모드) ──────────────── */}
        {!isAdmin && imageKeyInfo.mode === "system" && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">이미지 소스</h2>
                <Badge tone="leaf">시스템 키 사용 중</Badge>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">
                이 계정은 <strong>시스템 키 모드</strong>로 설정되어 있습니다.
                별도 API 키 없이 이미지 자동 검색·생성 기능을 사용할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── 이미지 소스 (비어드민 유저 키 모드) ─────────────── */}
        {!isAdmin && imageKeyInfo.mode === "user_key" && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">이미지 소스</h2>
                <Badge tone="amber">개인 키 모드</Badge>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                이미지 검색·생성 기능을 사용하려면 아래에 각 서비스 API 키를 등록해주세요.
                API 비용은 본인 계정으로 청구됩니다.
              </p>
              <UserImageSourceForm
                unsplashMasked={imageKeyInfo.unsplashMasked}
                pexelsMasked={imageKeyInfo.pexelsMasked}
                googleAiMasked={imageKeyInfo.googleAiMasked}
              />
            </CardContent>
          </Card>
        )}

        {/* ── 텔레그램 Bot Token (어드민) ──────────────────────── */}
        {isAdmin && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">알림 채널 (시스템 Bot Token)</h2>
                {telegramTokenMasked ? (
                  <Badge tone="leaf">Bot Token 등록됨</Badge>
                ) : (
                  <Badge tone="neutral">미등록</Badge>
                )}
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                전체 시스템이 공유하는 텔레그램 Bot Token입니다. 초안 준비됨·반려·사진 요청 알림이 이 봇으로 발송됩니다.
                알림 수신 대상은 각 계정의 <strong>내 계정 → 텔레그램 알림</strong>에서 Chat ID를 등록해 설정합니다.
              </p>
              <TelegramForm tokenMasked={telegramTokenMasked} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
