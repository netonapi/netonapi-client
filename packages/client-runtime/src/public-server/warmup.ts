/**
 * 热点页面预热（public-routes §8.7，itwind C5）。
 *
 * 公开页是「按需渲染 + 整页缓存」：构建时不连后端，所以刚部署 / 刚重启的进程里一个缓存都没有；`expire` 失效
 * （撤回、删除、评论被隐藏——必须立即生效的变化）之后同理。这时来的第一个访客要等一次完整渲染（取后端数据 + 渲染，
 * 本机开发后端实测 0.3–3 秒，取决于后端负载），而 `refresh` 失效与 TTL 到期走 stale-while-revalidate，旧页面立即给出、不受影响。
 *
 * 预热让这个「第一个访客」变成服务自己：
 * - 启动时：等本进程开始接请求，按站点配置 `warmup.paths` 顺序请求一遍（缺省只有首页）；
 * - `expire` 失效之后：合并 [REWARM_DELAY_MS]（盖住 site 模块 1 秒后的 expire 回声）再请求一遍。
 *
 * 请求发给本进程自己（`NETON_SITE_SELF_URL`，缺省 `http://localhost:$PORT`），经 proxy 与正常访客走同一条路，
 * 不带 Cookie（公开页的 HTML 与会话无关）。失败只记日志：预热是优化，不影响正确性。
 * 只覆盖配置的热点地址；文章详情这类长尾页面靠 CDN（命中率高）与按需渲染。
 */

/** expire 之后合并多久再预热：site 模块的 expire 回声在投递成功 1 秒后到达（site-module §5.1）。 */
export const REWARM_DELAY_MS = 1_500;

export interface WarmerOptions {
  paths: readonly string[];
  /** 本进程的地址；缺省 `NETON_SITE_SELF_URL`，再缺省 `http://localhost:$PORT`（`next start` 开始监听后才设置 PORT）。 */
  selfUrl?: () => string | null;
  fetch?: typeof fetch;
  log?: (event: string, detail?: Record<string, unknown>) => void;
  /** 等本进程开始监听：最多尝试次数与间隔（测试注入）。 */
  readyAttempts?: number;
  readyIntervalMs?: number;
  rewarmDelayMs?: number;
  timeoutMs?: number;
}

export interface WarmResult { path: string; status: number | null; ms: number; cache: string | null }

export class Warmer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<WarmResult[]> | null = null;
  private again = false;

  constructor(private readonly options: WarmerOptions) {}

  private base(): string | null {
    const explicit = this.options.selfUrl ? this.options.selfUrl() : defaultSelfUrl();
    return explicit ? explicit.replace(/\/+$/, "") : null;
  }

  private log(event: string, detail?: Record<string, unknown>) {
    (this.options.log ?? ((e, d) => console.info(`[site] ${e}`, d ?? "")))(event, detail);
  }

  /** 顺序请求每个热点地址一次（同一时刻只跑一轮；跑的时候又被要求时，结束后再跑一轮）。 */
  async warmAll(reason: string): Promise<WarmResult[]> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run(reason);
    try {
      return await this.running;
    } finally {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.warmAll("coalesced");
      }
    }
  }

  private async run(reason: string): Promise<WarmResult[]> {
    const base = this.base();
    if (!base || !this.options.paths.length) return [];
    const doFetch = this.options.fetch ?? fetch;
    const results: WarmResult[] = [];
    for (const path of this.options.paths) {
      const started = Date.now();
      try {
        const res = await doFetch(`${base}${path}`, {
          headers: { "User-Agent": "neton-site-warmup", Accept: "text/html" },
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        });
        await res.arrayBuffer();
        results.push({ path, status: res.status, ms: Date.now() - started, cache: res.headers.get("x-nextjs-cache") });
      } catch {
        results.push({ path, status: null, ms: Date.now() - started, cache: null });
      }
    }
    const failed = results.filter((r) => r.status === null || r.status >= 500);
    this.log(failed.length ? "site.warmup.partial" : "site.warmup.done", {
      reason,
      paths: results.length,
      failed: failed.map((r) => r.path),
      slowestMs: Math.max(0, ...results.map((r) => r.ms)),
    });
    return results;
  }

  /** 等本进程开始接请求（`/robots.txt` 不访问后端），再预热一轮。 */
  async warmWhenListening(): Promise<WarmResult[]> {
    const attempts = this.options.readyAttempts ?? 120;
    const interval = this.options.readyIntervalMs ?? 500;
    const doFetch = this.options.fetch ?? fetch;
    for (let i = 0; i < attempts; i += 1) {
      const base = this.base();
      if (base) {
        try {
          const res = await doFetch(`${base}/robots.txt`, { cache: "no-store", signal: AbortSignal.timeout(2_000) });
          await res.arrayBuffer();
          if (res.status < 500) return this.warmAll("startup");
        } catch { /* 还没开始监听 */ }
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    this.log("site.warmup.skipped", { reason: "server_not_listening" });
    return [];
  }

  /** `expire` 失效之后：合并 [REWARM_DELAY_MS] 再预热一轮（期间再来的 expire 不推迟它）。 */
  scheduleRewarm(): void {
    if (this.timer || !this.options.paths.length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.warmAll("expire");
    }, this.options.rewarmDelayMs ?? REWARM_DELAY_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }
}

function defaultSelfUrl(): string | null {
  const explicit = process.env.NETON_SITE_SELF_URL?.trim();
  if (explicit) return explicit;
  const port = process.env.PORT?.trim();
  return port ? `http://localhost:${port}` : null;
}

const KEY = Symbol.for("neton.client.site.warmer");
type Holder = { [KEY]?: Warmer };

/** 进程级的预热器（instrumentation 与失效端点的 Route Handler 共用，挂在 `process` 上，见 gone.ts）。 */
export function siteWarmer(paths: readonly string[]): Warmer {
  const holder = (typeof process === "object" && process ? process : globalThis) as unknown as Holder;
  return (holder[KEY] ??= new Warmer({ paths }));
}
