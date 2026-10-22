/**
 * Lighthouse 门禁的纯规则（public-routes §10.6）：取中位数、按门槛判定、判断一次测量是否有效。
 * 脚本（scripts/lighthouse.mts）负责跑浏览器。
 */
export interface LighthouseRun {
  url: string;
  lcp: number;
  cls: number;
  tbt: number;
  fcp: number;
  performance: number;
  seo: number;
  accessibility: number;
  /** 文档请求的服务端响应时间（Lighthouse `server-response-time`，ms）。 */
  ttfb?: number;
  /** 文档响应头 `x-nextjs-cache`（HIT / STALE / MISS；没有该头为 null）。 */
  cache?: string | null;
  /** 开始测量时宿主每核的 1 分钟负载。 */
  loadPerCore?: number;
}

export interface LighthouseThresholds { lcp: number; cls: number; tbt: number }

/** 门槛（移动端、devtools 实际节流）：LCP ≤ 2.0 s、CLS ≤ 0.05、TBT ≤ 200 ms。 */
export const DEFAULT_LIGHTHOUSE_THRESHOLDS: LighthouseThresholds = { lcp: 2000, cls: 0.05, tbt: 200 };

export function median(values: readonly number[]): number {
  if (!values.length) throw new Error("median of nothing");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface LighthouseSummary {
  url: string;
  runs: number;
  median: Omit<LighthouseRun, "url">;
  thresholds: LighthouseThresholds;
  violations: string[];
}

/** 每个指标各自取中位数（不是挑「中位那一次」）：三次里一次偶发的慢不决定结果。 */
export function summarize(url: string, runs: readonly LighthouseRun[], thresholds: LighthouseThresholds = DEFAULT_LIGHTHOUSE_THRESHOLDS): LighthouseSummary {
  const pick = (k: "lcp" | "cls" | "tbt" | "fcp" | "performance" | "seo" | "accessibility") => median(runs.map((r) => r[k]));
  const m = { lcp: pick("lcp"), cls: pick("cls"), tbt: pick("tbt"), fcp: pick("fcp"), performance: pick("performance"), seo: pick("seo"), accessibility: pick("accessibility") };
  const violations: string[] = [];
  if (m.lcp > thresholds.lcp) violations.push(`LCP ${Math.round(m.lcp)} ms > ${thresholds.lcp} ms`);
  if (m.cls > thresholds.cls) violations.push(`CLS ${m.cls.toFixed(3)} > ${thresholds.cls}`);
  if (m.tbt > thresholds.tbt) violations.push(`TBT ${Math.round(m.tbt)} ms > ${thresholds.tbt} ms`);
  return { url, runs: runs.length, median: m, thresholds, violations };
}

/**
 * 一次测量的文档是不是从页面缓存里给出的（public-routes §10.6「确定性」）。
 *
 * 门户页面是「按需渲染 + 整页缓存」：刚启动、刚被 `expire` 失效、或缓存被挤出时，文档要等一次完整渲染（取后端数据），
 * 那一次的 TTFB 叠在 FCP / LCP 上（本机实测 +0.3–3 s，取决于后端负载）——它测的是后端，不是页面。
 * `STALE`（先给旧的、后台重渲染）同样不算：后台渲染与浏览器抢 CPU。只认 `HIT`；没有该头（非缓存页面）照常有效。
 */
export function cachedDocument(cache: string | null | undefined): boolean {
  return cache === null || cache === undefined || cache.toUpperCase() === "HIT";
}

interface DevtoolsEvent { method: string; params?: { type?: string; response?: { url?: string; headers?: Record<string, string> } } }

/** 从 Lighthouse 的 DevtoolsLog 里取主文档响应的 `x-nextjs-cache`（第一条 Document 类型的响应）。 */
export function documentCacheHeader(devtoolsLog: readonly DevtoolsEvent[] | undefined): string | null {
  const doc = devtoolsLog?.find((e) => e.method === "Network.responseReceived" && e.params?.type === "Document");
  const headers = doc?.params?.response?.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === "x-nextjs-cache");
  return key ? headers[key]! : null;
}

/** 宿主负载（每核）：门禁要在空闲的机器上跑，太忙时先等一会儿，等不到就在报告里标出来。 */
export function loadPerCore(loadavg1: number, cores: number): number {
  return cores > 0 ? loadavg1 / cores : loadavg1;
}
