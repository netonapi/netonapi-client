/**
 * Lighthouse 门禁的纯规则（public-routes §10.6）：取中位数、按门槛判定。脚本（scripts/lighthouse.mts）负责跑浏览器。
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
  const pick = (k: keyof Omit<LighthouseRun, "url">) => median(runs.map((r) => r[k]));
  const m = { lcp: pick("lcp"), cls: pick("cls"), tbt: pick("tbt"), fcp: pick("fcp"), performance: pick("performance"), seo: pick("seo"), accessibility: pick("accessibility") };
  const violations: string[] = [];
  if (m.lcp > thresholds.lcp) violations.push(`LCP ${Math.round(m.lcp)} ms > ${thresholds.lcp} ms`);
  if (m.cls > thresholds.cls) violations.push(`CLS ${m.cls.toFixed(3)} > ${thresholds.cls}`);
  if (m.tbt > thresholds.tbt) violations.push(`TBT ${Math.round(m.tbt)} ms > ${thresholds.tbt} ms`);
  return { url, runs: runs.length, median: m, thresholds, violations };
}
