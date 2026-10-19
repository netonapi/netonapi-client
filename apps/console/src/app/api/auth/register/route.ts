import { cookies } from "next/headers";
import { backendJson, forwardedClientHeaders, SESSION_COOKIE } from "@neton/application-client-runtime/server";
import type { MemberLoginResponse } from "@neton/application-client-runtime/types";

interface RegisterInput {
  username?: string;
  password?: string;
  nickname?: string;
  inviteCode?: string;
}

export async function POST(req: Request) {
  const input = (await req.json().catch(() => null)) as RegisterInput | null;
  const username = input?.username?.trim() ?? "";
  const password = input?.password ?? "";
  if (!username || !password) {
    return Response.json({
      code: 10100,
      message: "VALIDATION_FAILED",
      errors: [
        ...(username ? [] : [{ field: "username", code: "REQUIRED", message: "REQUIRED" }]),
        ...(password ? [] : [{ field: "password", code: "REQUIRED", message: "REQUIRED" }]),
      ],
    }, { status: 400 });
  }
  // 后端 v1 只接受 USERNAME_PASSWORD；手机验证码注册走 sms-login，不在本入口。
  const payload: Record<string, string> = { mode: "USERNAME_PASSWORD", username, password };
  const nickname = input?.nickname?.trim();
  if (nickname) payload.nickname = nickname;
  const inviteCode = input?.inviteCode?.trim();
  if (inviteCode) payload.inviteCode = inviteCode;

  const res = await backendJson<MemberLoginResponse>("/app/auth/register", undefined, {
    method: "POST",
    headers: forwardedClientHeaders(req.headers),
    body: JSON.stringify(payload),
  });
  if (res.code !== 0 || !res.data) {
    return Response.json({ code: res.code || 4, message: res.message || "INVALID_RESPONSE", errors: res.errors }, { status: 400 });
  }
  // 注册成功即登录：与 login route 同一套会话 cookie，用户不必再登一次。
  const maxAge = Math.max(60, Math.floor(res.data.expiresIn) || 8 * 3600);
  (await cookies()).set(SESSION_COOKIE, res.data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return Response.json({ code: 0, data: { userId: res.data.userId } });
}
