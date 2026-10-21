import { backendJson, csrfRejection, envelopeFailure, establishSession, forwardedClientHeaders, WEB_DEVICE } from "@neton/application-client-runtime/server";
import type { MemberLoginResponse } from "@neton/application-client-runtime/types";

/**
 * 短信验证码登录：`{ mobile, smsCode }` → 后端 `/app/auth/sms-login`（与 App 同一个接口；号码第一次
 * 出现时后端按注册策略直接开户）。验证码由页面经 `/api/backend` 代理调 `/app/auth/send-sms-code`（scene=1）发送。
 */
export async function POST(req: Request) {
  // 防登录 CSRF：跨站页面不能替用户登进攻击者的账号
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const input = (await req.json().catch(() => null)) as { mobile?: unknown; smsCode?: unknown } | null;
  const res = await backendJson<MemberLoginResponse>("/app/auth/sms-login", undefined, {
    method: "POST",
    headers: forwardedClientHeaders(req.headers),
    body: JSON.stringify({ mobile: input?.mobile, smsCode: input?.smsCode, device: WEB_DEVICE }),
  });
  if (res.code !== 0 || !res.data) return envelopeFailure(res, 401);
  await establishSession(res.data);
  return Response.json({ code: 0, data: { userId: res.data.userId } });
}
