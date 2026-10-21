/**
 * 公开页面的服务端取数（public-routes §5）。
 *
 * - 地址：`NETON_BACKEND_INTERNAL_URL`（内网直连，不经 CDN），缺省回落 `NETON_BACKEND_URL`；
 * - **没有身份**：不带 Cookie、Authorization，也不带客户端 IP——渲染结果会缓存后发给所有人，
 *   触发渲染的是谁无关紧要。只有 `dynamic` 档的路由（不缓存，如搜索）由底座构造时带上客户端的
 *   转发头（`headers` 选项），让后端按真实客户端 IP 限流；模块代码拿不到请求头；
 * - 信封与控制台同一套：`code === 0` 取 `data`，否则抛 [PublicBackendError]（机器码原样），
 *   由路由的 `load` 决定映射成 not_found / unavailable / gone 还是继续抛出（→ 500，不缓存）；
 * - 超时与连不上一律抛出，不吞成空数据（空数据会被当成正常结果缓存下来）。
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 3000;
export const DEFAULT_LOAD_BUDGET_MS = 5000;

export class PublicBackendError extends Error {
  readonly code: number;
  readonly status: number;
  constructor(code: number, message: string, status: number) {
    super(message);
    this.name = "PublicBackendError";
    this.code = code;
    this.status = status;
  }

  /** 后端 message 是机器码时返回它（如 CHANNEL_NOT_FOUND）。 */
  get machineCode(): string | undefined {
    return /^[A-Z][A-Z0-9_]{2,}$/.test(this.message) ? this.message : undefined;
  }
}

export function isPublicBackendError(error: unknown, machineCode?: string): error is PublicBackendError {
  return error instanceof PublicBackendError && (machineCode === undefined || error.machineCode === machineCode);
}

export type QueryValue = string | number | boolean | null | undefined;

export interface PublicBackend {
  /** GET 后端 `/app/*` 的匿名接口，返回信封里的 data。同一个取数上下文内同一 URL 只请求一次。 */
  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T>;
}

export interface PublicBackendOptions {
  baseUrl?: string;
  requestTimeoutMs?: number;
  budgetMs?: number;
  fetch?: typeof fetch;
  /**
   * 额外请求头。只有 `dynamic` 档路由才传客户端的转发头（X-Forwarded-For 等）；Next 服务的出口地址
   * 必须在后端 `ratelimit.trusted_proxies` 里，后端才会信它（按来源地址认证，框架现有机制）。
   */
  headers?: Record<string, string>;
}

export function publicBackendUrl(): string {
  return (process.env.NETON_BACKEND_INTERNAL_URL || process.env.NETON_BACKEND_URL || "http://localhost:8080").replace(/\/+$/, "");
}

function buildUrl(base: string, path: string, query?: Record<string, QueryValue>): string {
  if (!path.startsWith("/app/")) throw new Error(`[public-backend] only anonymous /app/* reads are allowed: ${path}`);
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function createPublicBackend(options: PublicBackendOptions = {}): PublicBackend {
  const base = (options.baseUrl ?? publicBackendUrl()).replace(/\/+$/, "");
  const timeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const doFetch = options.fetch ?? fetch;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_LOAD_BUDGET_MS);
  const inflight = new Map<string, Promise<unknown>>();

  async function request<T>(url: string): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PublicBackendError(0, "LOAD_BUDGET_EXCEEDED", 504);
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { Accept: "application/json", ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(Math.min(timeout, remaining)),
        cache: "no-store",
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new PublicBackendError(0, timedOut ? "BACKEND_TIMEOUT" : "BACKEND_UNREACHABLE", timedOut ? 504 : 502);
    }
    type Body = { code?: unknown; message?: unknown; data?: unknown };
    const body = (await res.json().catch(() => null)) as Body | null;
    if (!body || typeof body.code !== "number") throw new PublicBackendError(0, "INVALID_RESPONSE", res.status);
    if (body.code !== 0) throw new PublicBackendError(body.code, typeof body.message === "string" ? body.message : `code ${body.code}`, res.status);
    return body.data as T;
  }

  const backend: PublicBackend = {
    get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
      const url = buildUrl(base, path, query);
      let pending = inflight.get(url) as Promise<T> | undefined;
      if (!pending) {
        pending = request<T>(url);
        inflight.set(url, pending);
      }
      return pending;
    },
  };
  return backend;
}
