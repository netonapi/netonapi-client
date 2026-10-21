import { backendJson, csrfRejection, envelopeFailure, establishSession, forwardedClientHeaders, WEB_DEVICE } from "@neton/application-client-runtime/server";
import type { MemberLoginResponse } from "@neton/application-client-runtime/types";

/** 账密登录：`{ username, password }` → 后端 `/app/auth/login-username`，成功后建立会话 Cookie。 */
export async function POST(req: Request) {
  // 防登录 CSRF：跨站页面不能替用户登进攻击者的账号
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const input = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const res = await backendJson<MemberLoginResponse>("/app/auth/login-username", undefined, {
    method: "POST",
    headers: forwardedClientHeaders(req.headers),
    body: JSON.stringify({ username: input?.username, password: input?.password, device: WEB_DEVICE }),
  });
  if (res.code !== 0 || !res.data) return envelopeFailure(res, 401);
  await establishSession(res.data);
  return Response.json({ code: 0, data: { userId: res.data.userId } });
}
