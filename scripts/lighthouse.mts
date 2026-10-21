/**
 * Lighthouse 门禁（public-routes §10.6）：移动端预设 + **devtools 实际节流**（真实浏览器按优先级调度，比
 * simulate 的 lantern 估算更接近真实设备；simulate 把首屏前的全部请求算进 LCP 依赖，框架 JS 在 1.6 Mbps 下
 * 就要 0.7 s，itwind C2 实测），每个地址跑 N 次（缺省 3）取各指标中位数，按门槛判定，超出退出码 1。
 *
 *   pnpm lighthouse http://localhost:3200/ http://localhost:3200/article/1
 *   pnpm lighthouse --runs 5 --lcp 2000 --cls 0.05 --tbt 200 --desktop --out lighthouse.json <url>…
 *   NETON_LIGHTHOUSE_URLS="url1 url2" pnpm lighthouse
 *
 * Chrome：`CHROME_PATH`，否则用 Playwright 的 Chromium（`pnpm exec playwright install chromium`）。
 * 性能 / SEO / 无障碍分数一并报告（不卡分数：分数是指标的加权，门禁直接卡指标）。
 */
import { writeFile } from "node:fs/promises";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";
import { DEFAULT_LIGHTHOUSE_THRESHOLDS, summarize, type LighthouseRun, type LighthouseSummary } from "./lighthouse/gate.mts";

interface Options { urls: string[]; runs: number; desktop: boolean; out?: string; thresholds: typeof DEFAULT_LIGHTHOUSE_THRESHOLDS }

function parseArgs(argv: string[]): Options {
  const o: Options = { urls: [], runs: 3, desktop: false, thresholds: { ...DEFAULT_LIGHTHOUSE_THRESHOLDS } };
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
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.urls.push(a);
  }
  if (!o.urls.length) o.urls = (process.env.NETON_LIGHTHOUSE_URLS ?? "").split(/\s+/).filter(Boolean);
  if (!o.urls.length) throw new Error("no URLs: pass them as arguments or in NETON_LIGHTHOUSE_URLS");
  for (const u of o.urls) new URL(u);
  return o;
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
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = process.env.CHROME_PATH || chromium.executablePath();
  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  const summaries: LighthouseSummary[] = [];
  try {
    for (const url of options.urls) {
      const runs: LighthouseRun[] = [];
      for (let i = 0; i < options.runs; i += 1) runs.push(await runOnce(url, chrome.port, options.desktop));
      const s = summarize(url, runs, options.thresholds);
      summaries.push(s);
      const m = s.median;
      console.log(`${s.violations.length ? "✖" : "✔"} ${url}  LCP ${Math.round(m.lcp)} ms  CLS ${m.cls.toFixed(3)}  TBT ${Math.round(m.tbt)} ms  FCP ${Math.round(m.fcp)} ms  perf ${m.performance} / SEO ${m.seo} / a11y ${m.accessibility}  (median of ${s.runs}, ${options.desktop ? "desktop" : "mobile"}, devtools throttling)`);
      for (const v of s.violations) console.log(`    ${v}`);
    }
  } finally {
    await chrome.kill();
  }
  const report = { formFactor: options.desktop ? "desktop" : "mobile", throttlingMethod: "devtools", thresholds: options.thresholds, results: summaries };
  if (options.out) await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report));
  if (summaries.some((s) => s.violations.length)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
