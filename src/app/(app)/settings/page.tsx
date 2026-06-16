export const dynamic = "force-dynamic";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStoredApiKeyMasked, getStoredUnsplashKeyMasked, getStoredPexelsKeyMasked, getStoredGoogleAiKeyMasked, getStoredTelegramTokenMasked, getUserApiKeyInfo, getImageApiKeyInfo } from "./actions";
import { ApiKeyForm } from "./api-key-form";
import { ImageSourceForm, UserImageSourceForm } from "./image-source-form";
import { TelegramForm } from "./telegram-form";
import { OpenAiKeyForm } from "./openai-key-form";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const [dbMasked, unsplashMasked, pexelsMasked, googleAiMasked, userApiKeyInfo, imageKeyInfo] = await Promise.all([
    getStoredApiKeyMasked(),
    getStoredUnsplashKeyMasked(),
    getStoredPexelsKeyMasked(),
    getStoredGoogleAiKeyMasked(),
    getUserApiKeyInfo(),
    getImageApiKeyInfo(),
  ]);
  const envConnected = env.ANTHROPIC_API_KEY.length > 0;
  const isConnected = !!dbMasked || envConnected;
  const isAdmin = userApiKeyInfo.role === "admin";
  // Bot Token은 시스템 자원 — 어드민만 조회/관리. Chat ID는 "내 계정" 페이지에서 계정별 등록.
  const telegramTokenMasked = isAdmin ? await getStoredTelegramTokenMasked() : null;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Settings
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">설정</h1>
      </header>

      <div className="space-y-3">
        {isAdmin && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">Anthropic API 키 (시스템)</h2>
                {isConnected ? (
                  <Badge tone="leaf">연결됨</Badge>
                ) : (
                  <Badge tone="amber">미연결</Badge>
                )}
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                전체 시스템에서 사용하는 Claude API 키입니다. 시스템 키 모드로 설정된 계정이 공유합니다.
              </p>
              {envConnected && !dbMasked && (
                <p className="text-xs text-ink-500 mb-3 bg-paper-200 rounded-lg px-3 py-2">
                  현재 <code className="text-[11px]">.env.local</code>의 키로 연결 중입니다.
                  아래에 직접 입력하면 DB에 저장되어 우선 적용됩니다.
                </p>
              )}
              <ApiKeyForm initialMasked={dbMasked} />
            </CardContent>
          </Card>
        )}

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
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardContent>
              <h2 className="font-bold text-base mb-1">이미지 소스 (시스템 키)</h2>
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

        {userApiKeyInfo.mode === "user_key" && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-base">내 API 키</h2>
                {userApiKeyInfo.masked ? (
                  <Badge tone="leaf">등록됨</Badge>
                ) : (
                  <Badge tone="amber">미등록 — AI 기능 사용 불가</Badge>
                )}
              </div>
              <p className="text-sm text-ink-600 leading-relaxed mb-4">
                이 계정은 <strong>유저 키 모드</strong>로 설정되어 있습니다.
                Anthropic API 키를 직접 등록해야 AI 기능(글 생성, 재작성)을 사용할 수 있습니다.
                API 비용은 본인 계정으로 청구됩니다.
              </p>
              <OpenAiKeyForm initialMasked={userApiKeyInfo.masked} />
            </CardContent>
          </Card>
        )}

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
