import { cookies } from "next/headers";
import { backendJson, forwardedClientHeaders, SESSION_COOKIE } from "@neton/application-client-runtime/server";
import type { MemberLoginResponse } from "@neton/application-client-runtime/types";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await backendJson<MemberLoginResponse>("/app/auth/login-username", undefined, {
    method: "POST",
    headers: forwardedClientHeaders(req.headers),
    body,
  });
  if (res.code !== 0 || !res.data) {
    // 原样透传后端的机器码与字段错误，页面经 useDescribeError 翻译。
    return Response.json({ code: res.code || 4, message: res.message || "INVALID_RESPONSE", errors: res.errors }, { status: 401 });
  }
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
