"use client";

/**
 * 浏览器侧统一走 shell 的 /api/backend 代理（cookie → Bearer 由 server 补）。
 *
 * 失败一律抛 [ApiError]（与 admin 线 front-runtime 同形）：保留 HTTP 状态、数字业务码、字段错误、
 * Retry-After。后端信封的 `message` 是机器码（spec ERROR_CODE_SPEC「消息即机器码」），不是给人看的句子——
 * 页面用 `useDescribeError("<模块 id>")`（errors.ts）把错误变成当前语言的说明，不要直接显示 `error.message`。
 */
import { isConsolePath, loginHref } from "./public/next-path";
import type { Envelope } from "./types";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "validation"
  | "business"
  | "server"
  | "network"
  | "timeout"
  | "invalid_response";

/**
 * 后端错误信封里的字段级错误（spec ERROR_CODE_SPEC）：`field` 是请求里的字段路径，`code` 是机器码
 * （框架内建如 `REQUIRED`/`TOO_SHORT`，或模块码如 `INVALID_MOBILE`），`message` 与 `code` 相同，
 * `params` 是翻译模板要用的约束值（如 `{ min: 2, max: 32 }`）。界面只按 `code` 翻译。
 */
export interface ApiFieldError {
  field?: string;
  message: string;
  code?: string;
  params?: Record<string, number>;
}

const MACHINE_CODE = /^[A-Z][A-Z0-9_]{2,}$/;

export interface ApiErrorDetails {
  status?: number;
  /** 数字业务码（NetonErrorCode 或模块专属码，如 cs 的 23010）。 */
  code?: number;
  fieldErrors?: ApiFieldError[];
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly details: ApiErrorDetails;

  constructor(kind: ApiErrorKind, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.details = details;
  }

  /** 后端 message 是机器码（如 NO_ORGANIZATION）时返回它，供界面翻译与分支判断。 */
  get machineCode(): string | undefined {
    return MACHINE_CODE.test(this.message) ? this.message : undefined;
  }
}

/** 是否某个机器码的错误（页面按码分支，例如 `isApiError(e, "NO_ORGANIZATION")`）。 */
export function isApiError(error: unknown, machineCode?: string): error is ApiError {
  return error instanceof ApiError && (machineCode === undefined || error.machineCode === machineCode);
}

/**
 * 数字业务码（neton-core NetonErrorCode 段位）→ 错误类别。
 * 认证段里只有会话类（10000-10003、10005、10006、10009、10010）算「登录失效」：
 * 凭据错（10011，如修改密码时当前密码不对）与账号停用（10007）是要告诉用户原因的业务失败。
 */
function kindOfCode(code: number): ApiErrorKind {
  if (code === 10004 || code === 10008) return "forbidden";
  if (code === 10007 || code === 10011) return "business";
  if (code >= 10000 && code < 10100) return "unauthorized";
  if (code >= 10100 && code < 10200) return "validation";
  if (code >= 10300 && code < 10400) return "rate_limited";
  if (code < 0 || (code > 0 && code < 1000)) return "server";
  return "business";
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const raw = headers?.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

/**
 * 把一个失败的后端信封变成 [ApiError]。登录 / 注册这类不走 [apiFetch] 的页面拿到 `/api/auth/*` 的
 * 响应后也用它，再交给 `useDescribeError` 翻译。
 */
export function apiErrorFromEnvelope(
  body: Partial<Envelope<unknown>> | null | undefined,
  status?: number,
  headers?: Headers,
): ApiError {
  const code = typeof body?.code === "number" ? body.code : undefined;
  const kind: ApiErrorKind =
    status === 429 || code === 429 ? "rate_limited" :
    code === 401 ? "unauthorized" :
    code !== undefined && code !== 0 ? kindOfCode(code) :
    status === 403 ? "forbidden" :
    status !== undefined && status >= 500 ? "server" :
    body ? "business" : "invalid_response";
  return new ApiError(kind, body?.message || (code !== undefined ? `code ${code}` : `HTTP ${status ?? 0}`), {
    status,
    code,
    fieldErrors: body?.errors,
    retryAfterSeconds: retryAfter(headers),
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("X-Neton-Csrf", "1");
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`/api/backend${path}`, { ...init, headers });
  } catch (cause) {
    if (init?.signal?.aborted) throw cause; // 调用方主动取消，原样抛出
    throw new ApiError("network", "NETWORK_ERROR");
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (res.ok && body?.code === 0) return body.data as T;
  const error = body && typeof body.code === "number"
    ? apiErrorFromEnvelope(body, res.status, res.headers)
    : new ApiError(res.status === 401 ? "unauthorized" : res.status === 429 ? "rate_limited" : res.status >= 500 ? "server" : "invalid_response", `HTTP ${res.status}`, {
      status: res.status, retryAfterSeconds: retryAfter(res.headers),
    });
  // 只有会话失效、且在控制台里才回登录页（带上 next 跳回）；凭据错（如当前密码不对，HTTP 也是 401）留在原页提示。
  // 公开页上不跳转：由组件决定调 requireLogin 还是提示（public-routes §9.3）。
  if (error.kind === "unauthorized" && typeof window !== "undefined") {
    const base = process.env.NEXT_PUBLIC_NETON_CONSOLE_BASE_PATH ?? "/";
    const { pathname, search, hash } = window.location;
    if (isConsolePath(pathname, base)) window.location.href = loginHref(`${pathname}${search}${hash}`, base);
  }
  throw error;
}

export function apiWrite<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
  /** 额外请求头，如人机验证凭证（captcha.headers） */
  headers?: Record<string, string>,
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
