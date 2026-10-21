/** 仅限 server 侧（RSC / Route Handler）使用。 */
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Envelope, MemberLoginResponse, MemberProfile } from "./types";

export { forwardedClientHeaders } from "./forwarded";

export const SESSION_COOKIE = "neton_client_session";

/** 浏览器发起的写请求必须带这个头（与后台 RealmAuthenticator 同一规则）。 */
export const CSRF_HEADER = "X-Neton-Csrf";

/**
 * 代理层的 CSRF 检查（评审 R09）。会话 Cookie 由浏览器自动附带，所以凭 Cookie 的写请求必须：
 * - 带自定义头 [CSRF_HEADER]（跨站页面加不上自定义头，除非过了 CORS 预检，而本站不放行跨源）；
 * - 若浏览器给出了 Origin，必须与本站同源。
 * 读请求不检查。返回 null 表示通过，否则是该直接返回的 403。
 */
export function csrfRejection(req: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const sameOrigin = !origin || (host !== null && new URL(origin).host === host);
  if (req.headers.get(CSRF_HEADER) === "1" && sameOrigin) return null;
  return Response.json({ code: 10004, message: "CSRF_CHECK_FAILED" }, { status: 403 });
}

export function backendUrl(): string {
  return process.env.NETON_BACKEND_URL ?? "http://localhost:8080";
}

/**
 * 调后端 app API（envelope {code,message,data,errors}）。
 * 401 及其它状态**先解析后端 envelope**：像 INVALID_CREDENTIALS(10011) 这种带机器码的认证失败要原样透给前端翻译；
 * 只有解不出 JSON envelope 时才折叠成通用机器码（网络不通 → `BACKEND_UNREACHABLE`，401 → `AUTH_REQUIRED`，
 * 其余 → `INVALID_RESPONSE`）。会话校验的调用方一律按 `code !== 0` 判失败，语义不变。排障细节只进日志。
 */
export async function backendJson<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    // Next 的控制流错误（预渲染结束时挂起的请求被取消、动态用法中断）原样抛回框架，不当成后端不可达
    unstable_rethrow(e);
    console.error(`[backend] ${path} unreachable: ${String(e)}`);
    return { code: 3, message: "BACKEND_UNREACHABLE" };
  }
  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }
  if (envelope && typeof envelope.code === "number") return envelope;
  if (res.status === 401) return { code: 10000, message: "AUTH_REQUIRED" };
  console.error(`[backend] ${path} bad response (${res.status})`);
  return { code: 4, message: "INVALID_RESPONSE" };
}

/** 每请求去重：当前登录会员资料（layout 与 catch-all 各取一次只打一次后端）。 */
export const getMemberProfile = cache(async (token: string) =>
  backendJson<MemberProfile>("/app/member/user/get", token),
);

/** 网页端登录请求带的设备信息（后端按它绑定 token 的 device claim）。 */
export const WEB_DEVICE = { platform: "web" } as const;

/**
 * 登录 / 注册成功后建立会话：HttpOnly、SameSite=Lax、path=/ 的会话 Cookie，门户与控制台共用
 * （public-routes §9.1）。有效期取后端 token 的 expiresIn（至少 60 秒，缺省 8 小时）。
 */
export async function establishSession(login: MemberLoginResponse): Promise<void> {
  const maxAge = Math.max(60, Math.floor(login.expiresIn) || 8 * 3600);
  (await cookies()).set(SESSION_COOKIE, login.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

/** 后端失败信封原样透传给浏览器（机器码 + 字段错误），页面经 useDescribeError 翻译。 */
export function envelopeFailure(res: Envelope<unknown>, status: number): Response {
  return Response.json({ code: res.code || 4, message: res.message || "INVALID_RESPONSE", errors: res.errors }, { status });
}
