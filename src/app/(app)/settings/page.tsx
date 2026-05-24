import { Card, CardContent } from "@/components/ui/card";
import { hasAnthropic } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
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
              {hasAnthropic() ? (
                <Badge tone="leaf">연결됨</Badge>
              ) : (
                <Badge tone="amber">미연결</Badge>
              )}
            </div>
            <p className="text-sm text-ink-600 leading-relaxed mb-3">
              Claude API 키를 등록하면 실제 글이 생성됩니다. 미연결 시에는
              자리표시 텍스트로 흐름만 확인할 수 있어요.
            </p>
            <ol className="text-sm text-ink-700 space-y-1 list-decimal list-inside">
              <li>
                <a
                  className="text-accent-600 underline underline-offset-4"
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener"
                >
                  console.anthropic.com
                </a>
                에서 키 발급
              </li>
              <li>
                프로젝트 루트의 <code className="text-xs">.env.local</code> 파일에
                다음을 추가
                <pre className="mt-2 rounded-lg bg-ink-900 text-paper-100 px-3 py-2 text-[12px] font-mono">
                  ANTHROPIC_API_KEY=sk-ant-...
                </pre>
              </li>
              <li>
                <code className="text-xs">npm run dev</code> 재시작
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">이미지 소스</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-2">
              직접 촬영 외에 자동으로 채울 이미지 출처입니다.
            </p>
            <ul className="text-sm text-ink-700 space-y-1.5">
              <li>
                <strong>Unsplash</strong> · UNSPLASH_ACCESS_KEY 등록 필요 · 무료
                고품질 스톡
              </li>
              <li>
                <strong>Pexels</strong> · PEXELS_API_KEY 등록 필요 · 무료 스톡
              </li>
              <li>
                <strong>Adobe Firefly</strong> · 별도 가입 · 텍스트→이미지 생성
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">알림 채널</h2>
            <p className="text-sm text-ink-600 leading-relaxed">
              초안 준비됨·반려·사진 요청 발생 시 외부 알림 (텔레그램/슬랙/이메일)을
              보낼 수 있습니다. 키 등록 후 활성화됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
