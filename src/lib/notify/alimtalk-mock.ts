import "server-only";
import { blogEnv } from "@/lib/publish/mode";

/* 솔라피·알리고 «모의 응답» — 업체 실계정이 없는 테스트서버에서 마법사를 끝까지 눌러 보기 위한 것.
   켜는 조건: 환경변수 ALIMTALK_MOCK=1 이고 BLOG_STUDIO_ENV 가 prod 가 아닐 때만(lib/publish/mode.ts 와 같은 판별). 실서버에선 절대 켜지지 않는다.
   API Key 값으로 시나리오를 고른다(비개발자도 보고서의 표대로 입력하면 됨):
     mock-ok        연결 성공(잔액 12,340원 · 발신프로필 «블로그 스튜디오» = 키 mock-pf-*) · 발송 성공
     mock-badkey    키 틀림            mock-ip       서버 IP 미등록
     mock-timeout   응답 없음          mock-sendfail 연결은 되지만 발송은 실패(실패 누적 배너 확인용)
   발신프로필 키: mock-pf- 로 시작하면 «찾음» · 템플릿 코드: TPL-OK 승인 · TPL-PENDING 심사 중 · TPL-REJ 반려 · 그 외 없음
   받는 번호 끝 4자리가 0009 면 발송 실패 */

export const MOCK_PROFILE_PREFIX = "mock-pf-";
export const MOCK_PROFILE_NAME = "블로그 스튜디오";

export function mockEnabled(): boolean {
  return process.env.ALIMTALK_MOCK === "1" && blogEnv() !== "prod";
}

export function isMockKey(apiKey: string): boolean {
  return mockEnabled() && apiKey.toLowerCase().startsWith("mock-");
}

export type MockHttp = { status: number; text: string } | { throw: Error };

function timeoutErr(): Error {
  return Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
}

export function mockVerify(vendor: "solapi" | "aligo", apiKey: string, senderKey: string): { connection: MockHttp; profiles: MockHttp } {
  const k = apiKey.toLowerCase();
  if (k === "mock-timeout") return { connection: { throw: timeoutErr() }, profiles: { throw: timeoutErr() } };
  if (k === "mock-badkey")
    return vendor === "solapi"
      ? { connection: { status: 401, text: JSON.stringify({ errorCode: "InvalidAPIKey", errorMessage: "API Key 가 유효하지 않습니다(모의)" }) }, profiles: { status: 401, text: "" } }
      : { connection: { status: 200, text: JSON.stringify({ code: -101, message: "인증오류입니다. (apikey, userid 확인)(모의)" }) }, profiles: { status: 200, text: "" } };
  if (k === "mock-ip")
    return vendor === "solapi"
      ? { connection: { status: 403, text: JSON.stringify({ errorCode: "AccessDenied", errorMessage: "허용되지 않은 IP 입니다(모의)" }) }, profiles: { status: 403, text: "" } }
      : { connection: { status: 200, text: JSON.stringify({ code: -102, message: "IP 인증 오류 — 허용 IP 를 등록하세요(모의)" }) }, profiles: { status: 200, text: "" } };
  /* 연결 성공. 발신프로필은 입력한 키가 mock-pf- 로 시작할 때만 목록에 있는 것으로 */
  const found = senderKey.toLowerCase().startsWith(MOCK_PROFILE_PREFIX);
  const profiles = found ? [{ pfId: senderKey, senderKey, name: MOCK_PROFILE_NAME, channelId: "@blogstudio" }] : [{ pfId: "mock-pf-other", senderKey: "mock-pf-other", name: "다른 채널(모의)", channelId: "@other" }];
  if (vendor === "solapi")
    return {
      connection: { status: 200, text: JSON.stringify({ balance: 12340, point: 0, mock: true }) },
      profiles: { status: 200, text: JSON.stringify({ list: profiles, mock: true }) },
    };
  return {
    connection: { status: 200, text: JSON.stringify({ result_code: 1, message: "success(모의)", SMS_CNT: 1234, LMS_CNT: 411, MMS_CNT: 123 }) },
    profiles: { status: 200, text: JSON.stringify({ code: 0, message: "성공(모의)", list: profiles }) },
  };
}

export function mockTemplate(vendor: "solapi" | "aligo", code: string): MockHttp {
  const c = code.toUpperCase();
  const row = (state: string, name: string) =>
    vendor === "solapi" ? { templateId: code, name, status: state, mock: true } : { templCode: code, templName: name, inspStatus: state, status: "A", mock: true };
  const name = "블로그 스튜디오 알림(모의)";
  if (c === "TPL-OK") return { status: 200, text: JSON.stringify(vendor === "solapi" ? row("APPROVED", name) : { code: 0, list: [row("APR", name)] }) };
  if (c === "TPL-PENDING") return { status: 200, text: JSON.stringify(vendor === "solapi" ? row("INSPECTING", name) : { code: 0, list: [row("REQ", name)] }) };
  if (c === "TPL-REJ") return { status: 200, text: JSON.stringify(vendor === "solapi" ? row("REJECTED", name) : { code: 0, list: [row("REJ", name)] }) };
  return vendor === "solapi"
    ? { status: 404, text: JSON.stringify({ errorCode: "TemplateNotFound", errorMessage: "템플릿을 찾을 수 없습니다(모의)" }) }
    : { status: 200, text: JSON.stringify({ code: 0, list: [] }) };
}

export function mockSend(vendor: "solapi" | "aligo", apiKey: string, toDigits: string): MockHttp {
  const failing = apiKey.toLowerCase() === "mock-sendfail" || toDigits.endsWith("0009");
  if (vendor === "solapi")
    return failing
      ? { status: 200, text: JSON.stringify({ groupInfo: { groupId: "G-mock" }, failedMessageList: [{ to: toDigits, statusMessage: "수신자가 카카오톡 미가입(모의)" }], mock: true }) }
      : { status: 200, text: JSON.stringify({ groupInfo: { groupId: `G-mock-${Date.now()}` }, failedMessageList: [], mock: true }) };
  return failing
    ? { status: 200, text: JSON.stringify({ code: -301, message: "수신자가 카카오톡 미가입(모의)" }) }
    : { status: 200, text: JSON.stringify({ code: 0, message: "성공(모의)", info: { type: "AT", mid: `mock-${Date.now()}`, scnt: 1, fcnt: 0 } }) };
}

export function mockTokenResponse(apiKey: string): MockHttp {
  const k = apiKey.toLowerCase();
  if (k === "mock-timeout") return { throw: timeoutErr() };
  if (k === "mock-badkey") return { status: 200, text: JSON.stringify({ code: -101, message: "인증오류입니다. (apikey, userid 확인)(모의)" }) };
  if (k === "mock-ip") return { status: 200, text: JSON.stringify({ code: -102, message: "IP 인증 오류 — 허용 IP 를 등록하세요(모의)" }) };
  return { status: 200, text: JSON.stringify({ code: 0, message: "", token: "mock-token" }) };
}
