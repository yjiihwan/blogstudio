import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAccountInfo, getTelegramChatIdInfo } from "./actions";
import { PasswordForm } from "./password-form";
import { EmailForm } from "./email-form";
import { TelegramForm } from "./telegram-form";

export default async function AccountPage() {
  const [info, telegramInfo] = await Promise.all([
    getAccountInfo(),
    getTelegramChatIdInfo(),
  ]);

  const joinDate = new Date(info.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <header className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">
          Account
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">내 계정</h1>
      </header>

      <div className="space-y-3">
        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-4">계정 정보</h2>
            <dl className="space-y-0 text-sm">
              <div className="flex justify-between items-center py-2.5 border-b border-paper-200">
                <dt className="text-ink-500">이름</dt>
                <dd className="font-medium">{info.name}</dd>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-paper-200">
                <dt className="text-ink-500">이메일</dt>
                <dd className="font-medium">{info.email}</dd>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-paper-200">
                <dt className="text-ink-500">권한</dt>
                <dd>
                  <Badge tone={info.role === "admin" ? "leaf" : "neutral"}>
                    {info.role === "admin" ? "어드민" : "일반"}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-ink-500">가입일</dt>
                <dd className="font-medium">{joinDate}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">비밀번호 변경</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다. 새 비밀번호는 8자 이상이어야 합니다.
            </p>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">이메일 변경</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              로그인에 사용하는 이메일 주소를 변경합니다. 다른 계정에서 사용 중인 이메일은 사용할 수 없습니다.
            </p>
            <EmailForm currentEmail={info.email} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-bold text-base mb-1">텔레그램 알림</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              초안 생성, 게시물 발행, 계정 승인 등의 이벤트를 텔레그램으로 받습니다.
            </p>
            <TelegramForm
              chatId={telegramInfo.chatId}
              botTokenSet={telegramInfo.botTokenSet}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
