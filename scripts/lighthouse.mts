/**
 * Lighthouse 门禁（public-routes §10.6）：移动端预设 + **devtools 实际节流**（真实浏览器按优先级调度，比
 * simulate 的 lantern 估算更接近真实设备；simulate 把首屏前的全部请求算进 LCP 依赖，框架 JS 在 1.6 Mbps 下
 * 就要 0.7 s，itwind C2 实测），每个地址取 N 次（缺省 3）**有效测量**各指标的中位数，按门槛判定，超出退出码 1。
 *
 * 确定性（itwind C5：偶发「FCP = LCP ≈ 2.7 s」的根因是测量撞上了阻塞渲染——刚启动、或刚被 expire 失效的页面，
 * 文档要等一次取后端 + 渲染，那一次 TTFB 测的是后端负载，不是页面）：
 * 1. 预热：每个地址先 GET 到连续两次 `x-nextjs-cache: HIT`，再跑一次不计入的 Lighthouse（Chrome 与 Next 的静态资源、路由模块都热了）；
 * 2. 每次测量前再确认页面在缓存里（是 STALE / MISS 就等后台渲染结束）；
 * 3. 测量后从 DevtoolsLog 读文档的 `x-nextjs-cache`，不是 HIT 的这次作废重测（最多 `--max-attempts` 次）；
 * 4. 宿主每核负载超过 `--max-load`（缺省 0.9）时先等它降下来（最多 2 分钟），等不到就照测并在报告里标出负载。
 *
 *   pnpm lighthouse http://localhost:3200/ http://localhost:3200/article/1
 *   pnpm lighthouse --runs 5 --lcp 2000 --cls 0.05 --tbt 200 --desktop --out lighthouse.json <url>…
 *   pnpm lighthouse --no-warmup --max-load 2 <url>          # 关掉预热 / 放宽负载等待（不建议用于门禁）
 *   NETON_LIGHTHOUSE_URLS="url1 url2" pnpm lighthouse
 *
 * Chrome：`CHROME_PATH`，否则用 Playwright 的 Chromium（`pnpm exec playwright install chromium`）。
 * 性能 / SEO / 无障碍分数一并报告（不卡分数：分数是指标的加权，门禁直接卡指标）。
 */
import { writeFile } from "node:fs/promises";
import { availableParallelism, loadavg } from "node:os";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";
import {
  cachedDocument,
  DEFAULT_LIGHTHOUSE_THRESHOLDS,
  documentCacheHeader,
  loadPerCore,
  summarize,
  type LighthouseRun,
  type LighthouseSummary,
} from "./lighthouse/gate.mts";

interface Options {
  urls: string[];
  runs: number;
  desktop: boolean;
  out?: string;
  thresholds: typeof DEFAULT_LIGHTHOUSE_THRESHOLDS;
  warmup: boolean;
  maxLoad: number;
  maxAttempts: number;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { urls: [], runs: 3, desktop: false, thresholds: { ...DEFAULT_LIGHTHOUSE_THRESHOLDS }, warmup: true, maxLoad: 0.9, maxAttempts: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    const num = () => {
      const n = Number(value());
      if (!Number.isFinite(n) || n < 0) throw new Error(`${a} needs a non-negative number`);
      return n;
    };
    if (a === "--runs") o.runs = Math.max(1, Math.floor(num()));
    else if (a === "--desktop") o.desktop = true;
    else if (a === "--out") o.out = value();
    else if (a === "--lcp") o.thresholds.lcp = num();
    else if (a === "--cls") o.thresholds.cls = num();
    else if (a === "--tbt") o.thresholds.tbt = num();
    else if (a === "--no-warmup") o.warmup = false;
    else if (a === "--max-load") o.maxLoad = num();
    else if (a === "--max-attempts") o.maxAttempts = Math.max(1, Math.floor(num()));
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.urls.push(a);
  }
  if (!o.urls.length) o.urls = (process.env.NETON_LIGHTHOUSE_URLS ?? "").split(/\s+/).filter(Boolean);
  if (!o.urls.length) throw new Error("no URLs: pass them as arguments or in NETON_LIGHTHOUSE_URLS");
  for (const u of o.urls) new URL(u);
  if (!o.maxAttempts) o.maxAttempts = o.runs * 3;
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET 一次，返回 `x-nextjs-cache`（不带 Cookie，与匿名访客一致）。 */
async function cacheStatus(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { Accept: "text/html" }, redirect: "manual" });
  await res.arrayBuffer();
  return res.headers.get("x-nextjs-cache");
}

/** 等到页面连续 [streak] 次从缓存里给出（STALE 会触发后台重渲染，等它结束再测）。 */
async function waitCached(url: string, streak = 1, attempts = 40): Promise<string | null> {
  let hits = 0;
  let last: string | null = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await cacheStatus(url);
    if (cachedDocument(last)) { hits += 1; if (hits >= streak) return last; } else hits = 0;
    await sleep(500);
  }
  return last;
}

/** 宿主太忙时先等（最多 [maxWaitMs]），返回开始测量时的每核负载。 */
async function waitForIdleHost(maxLoad: number, maxWaitMs = 120_000): Promise<number> {
  const cores = availableParallelism();
  const started = Date.now();
  let load = loadPerCore(loadavg()[0]!, cores);
  while (load > maxLoad && Date.now() - started < maxWaitMs) {
    await sleep(5_000);
    load = loadPerCore(loadavg()[0]!, cores);
  }
  return load;
}

type Lhr = { audits: Record<string, { numericValue?: number }>; categories: Record<string, { score: number | null }>; runtimeError?: { code: string; message: string } };

async function runOnce(url: string, port: number, desktop: boolean): Promise<LighthouseRun> {
  const flags = { port, output: "json" as const, logLevel: "error" as const, onlyCategories: ["performance", "seo", "accessibility"] };
  const config = {
    extends: "lighthouse:default",
    settings: desktop
      ? { formFactor: "desktop" as const, screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 }, throttlingMethod: "devtools" as const, emulatedUserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" }
      : { throttlingMethod: "devtools" as const },
  };
  const result = await lighthouse(url, flags, config);
  const lhr = result?.lhr as Lhr | undefined;
  const devtoolsLog = (result?.artifacts as { DevtoolsLog?: Parameters<typeof documentCacheHeader>[0] } | undefined)?.DevtoolsLog;
  if (!lhr) throw new Error(`lighthouse returned nothing for ${url}`);
  if (lhr.runtimeError) throw new Error(`${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
  const metric = (id: string) => {
    const v = lhr.audits[id]?.numericValue;
    if (typeof v !== "number") throw new Error(`${url}: audit ${id} has no value`);
    return v;
  };
  const score = (id: string) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  return {
    url, lcp: metric("largest-contentful-paint"), cls: metric("cumulative-layout-shift"), tbt: metric("total-blocking-time"), fcp: metric("first-contentful-paint"),
    performance: score("performance"), seo: score("seo"), accessibility: score("accessibility"),
    ttfb: lhr.audits["server-response-time"]?.numericValue,
    cache: documentCacheHeader(devtoolsLog),
  };
}

interface Discarded { url: string; reason: string; cache: string | null | undefined; lcp: number; ttfb?: number }

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = process.env.CHROME_PATH || chromium.executablePath();
  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  const summaries: (LighthouseSummary & { samples: LighthouseRun[]; discarded: Discarded[] })[] = [];
  let incomplete = false;
  try {
    if (options.warmup) {
      for (const url of options.urls) {
        const status = await waitCached(url, 2);
        await runOnce(url, chrome.port, options.desktop).catch(() => undefined); // 不计入：Chrome 与 Next 的静态资源、路由模块
        console.log(`  warmed ${url} (x-nextjs-cache: ${status ?? "none"})`);
      }
    }
    for (const url of options.urls) {
      const runs: LighthouseRun[] = [];
      const discarded: Discarded[] = [];
      let attempts = 0;
      while (runs.length < options.runs && attempts < options.maxAttempts) {
        attempts += 1;
        const load = await waitForIdleHost(options.maxLoad);
        if (options.warmup) await waitCached(url);
        const r = { ...(await runOnce(url, chrome.port, options.desktop)), loadPerCore: Number(load.toFixed(2)) };
        if (cachedDocument(r.cache)) runs.push(r);
        else {
          discarded.push({ url, reason: "document not served from the page cache", cache: r.cache, lcp: r.lcp, ttfb: r.ttfb });
          console.log(`    discarded a run: x-nextjs-cache ${r.cache} (LCP ${Math.round(r.lcp)} ms, TTFB ${Math.round(r.ttfb ?? 0)} ms)`);
        }
      }
      if (runs.length < options.runs) {
        incomplete = true;
        console.log(`✖ ${url}: only ${runs.length} valid run(s) in ${attempts} attempts`);
        if (!runs.length) continue;
      }
      const s = summarize(url, runs, options.thresholds);
      summaries.push({ ...s, samples: runs, discarded });
      const m = s.median;
      const busy = runs.some((r) => (r.loadPerCore ?? 0) > options.maxLoad) ? `  ⚠ host load up to ${Math.max(...runs.map((r) => r.loadPerCore ?? 0))}/core` : "";
      console.log(`${s.violations.length ? "✖" : "✔"} ${url}  LCP ${Math.round(m.lcp)} ms  CLS ${m.cls.toFixed(3)}  TBT ${Math.round(m.tbt)} ms  FCP ${Math.round(m.fcp)} ms  perf ${m.performance} / SEO ${m.seo} / a11y ${m.accessibility}  (median of ${s.runs}, ${options.desktop ? "desktop" : "mobile"}, devtools throttling${discarded.length ? `, ${discarded.length} discarded` : ""})${busy}`);
      for (const v of s.violations) console.log(`    ${v}`);
    }
  } finally {
    await chrome.kill();
  }
  const report = {
    formFactor: options.desktop ? "desktop" : "mobile",
    throttlingMethod: "devtools",
    thresholds: options.thresholds,
    warmup: options.warmup,
    maxLoadPerCore: options.maxLoad,
    results: summaries,
  };
  if (options.out) await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report));
  if (incomplete || summaries.some((s) => s.violations.length)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
