import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStoredApiKeyMasked, getStoredUnsplashKeyMasked, getStoredPexelsKeyMasked, getStoredGoogleAiKeyMasked, getStoredTelegramConfigMasked } from "./actions";
import { ApiKeyForm } from "./api-key-form";
import { ImageSourceForm } from "./image-source-form";
import { TelegramForm } from "./telegram-form";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const [dbMasked, unsplashMasked, pexelsMasked, googleAiMasked, telegramConfig] = await Promise.all([
    getStoredApiKeyMasked(),
    getStoredUnsplashKeyMasked(),
    getStoredPexelsKeyMasked(),
    getStoredGoogleAiKeyMasked(),
    getStoredTelegramConfigMasked(),
  ]);
  const envConnected = env.ANTHROPIC_API_KEY.length > 0;
  const isConnected = !!dbMasked || envConnected;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Settings
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">설정</h1>
      </header>

      <div className="space-y-3">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-base">Anthropic API 키</h2>
              {isConnected ? (
                <Badge tone="leaf">연결됨</Badge>
              ) : (
                <Badge tone="amber">미연결</Badge>
              )}
            </div>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              Claude API 키를 등록하면 실제 글이 생성됩니다. 미연결 시에는
              자리표시 텍스트로 흐름만 확인할 수 있어요.
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

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">이미지 소스</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              직접 촬영 외에 자동으로 채울 이미지 출처입니다. API 키를 등록하면
              글 생성 시 자동으로 관련 이미지를 검색합니다.
            </p>
            <ImageSourceForm
              unsplashMasked={unsplashMasked}
              pexelsMasked={pexelsMasked}
              googleAiMasked={googleAiMasked}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-base">알림 채널</h2>
              {telegramConfig.tokenMasked && telegramConfig.chatIdMasked ? (
                <Badge tone="leaf">텔레그램 연결됨</Badge>
              ) : (
                <Badge tone="neutral">미연결</Badge>
              )}
            </div>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              초안 준비됨·반려·사진 요청 발생 시 텔레그램으로 알림을 받습니다.
              Bot Token과 Chat ID를 등록하면 자동으로 활성화됩니다.
            </p>
            <TelegramForm
              tokenMasked={telegramConfig.tokenMasked}
              chatIdMasked={telegramConfig.chatIdMasked}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
