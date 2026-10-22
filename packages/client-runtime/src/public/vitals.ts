/**
 * 真实用户 Core Web Vitals（public-routes §10.7）：浏览器信标的上报格式、校验与 p75 门禁的纯规则。
 * 信标（public-client/vitals-beacon）、收集端点（public-server/vitals）与报告脚本（scripts/vitals-report）共用这一份。
 */

export const VITAL_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];
export const DEVICE_CLASSES = ["mobile", "tablet", "desktop"] as const;
export type { DeviceClass } from "./vitals-device";
import type { DeviceClass } from "./vitals-device";
const RATINGS = ["good", "needs-improvement", "poor"] as const;
const NAV_TYPES = ["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore", "soft-navigation"] as const;
const CONNECTIONS = ["slow-2g", "2g", "3g", "4g", "unknown"] as const;

/** 单次上报的字节上限：一页最多 5 个指标，正常 < 1 KB。 */
export const VITALS_MAX_BYTES = 4096;

/** 门禁（Google「good」的 p75）：LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1。FCP / TTFB 只报告。 */
export const VITALS_P75_THRESHOLDS: Partial<Record<VitalName, number>> = { LCP: 2500, INP: 200, CLS: 0.1 };

/** 指标值的合理上限（超出视为垃圾数据丢弃）：时间类 ≤ 10 分钟，CLS ≤ 10。 */
const MAX_VALUE: Record<VitalName, number> = { LCP: 600_000, INP: 600_000, FCP: 600_000, TTFB: 600_000, CLS: 10 };

export { deviceClassOf } from "./vitals-device";

export interface VitalsMetric { name: VitalName; value: number; rating: (typeof RATINGS)[number]; id: string }

/** 浏览器发出的一份上报：一次页面浏览的全部指标（同一指标取最后一次的值）。不含任何身份信息。 */
export interface VitalsBeaconPayload {
  v: 1;
  /** 路由 key（`content.item`）；站点 404 等没有路由的页面为 null */
  route: string | null;
  /** 路由形态（`/article/:id`），分组用 */
  pattern: string | null;
  /** 页面路径（不含查询串与锚点） */
  path: string;
  nav: (typeof NAV_TYPES)[number];
  device: DeviceClass;
  conn: (typeof CONNECTIONS)[number];
  metrics: VitalsMetric[];
}

/** 收集端点写出的一行（每个指标一行），报告脚本读这个形状。 */
export interface VitalsSample {
  type: "web-vital";
  ts: number;
  /** web-vitals 给每次页面浏览的每个指标一个 id：同一 id 后到的值替换先到的（页面再次隐藏时会重报 CLS / INP） */
  id: string;
  name: VitalName;
  value: number;
  rating: VitalsMetric["rating"];
  route: string | null;
  pattern: string | null;
  path: string;
  nav: VitalsBeaconPayload["nav"];
  device: DeviceClass;
  conn: VitalsBeaconPayload["conn"];
}

const ROUTE_KEY = /^[a-z0-9][a-z0-9._@-]{0,127}$/;
const PATTERN = /^\/[A-Za-z0-9._~:/-]{0,255}$/;
const PATH = /^\/[^\s?#]{0,511}$/;
const METRIC_ID = /^[A-Za-z0-9._-]{1,64}$/;

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** 校验一份上报，返回规范化后的样本行；不合法返回 null（整份丢弃，不部分接受）。 */
export function parseVitalsPayload(raw: string, now: number): VitalsSample[] | null {
  if (raw.length > VITALS_MAX_BYTES) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== "object") return null;
  const p = body as Record<string, unknown>;
  if (p.v !== 1) return null;
  const route = p.route === null ? null : typeof p.route === "string" && ROUTE_KEY.test(p.route) ? p.route : undefined;
  const pattern = p.pattern === null ? null : typeof p.pattern === "string" && PATTERN.test(p.pattern) ? p.pattern : undefined;
  if (route === undefined || pattern === undefined) return null;
  if (typeof p.path !== "string" || !PATH.test(p.path)) return null;
  if (!oneOf(NAV_TYPES, p.nav) || !oneOf(DEVICE_CLASSES, p.device) || !oneOf(CONNECTIONS, p.conn)) return null;
  if (!Array.isArray(p.metrics) || p.metrics.length === 0 || p.metrics.length > VITAL_NAMES.length) return null;
  const seen = new Set<string>();
  const samples: VitalsSample[] = [];
  for (const m of p.metrics as unknown[]) {
    if (!m || typeof m !== "object") return null;
    const { name, value, rating, id } = m as Record<string, unknown>;
    if (typeof id !== "string" || !METRIC_ID.test(id)) return null;
    if (!oneOf(VITAL_NAMES, name) || seen.has(name)) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_VALUE[name]) return null;
    if (!oneOf(RATINGS, rating)) return null;
    seen.add(name);
    samples.push({ type: "web-vital", ts: now, id, name, value, rating, route, pattern, path: p.path, nav: p.nav, device: p.device, conn: p.conn });
  }
  return samples;
}

// ---------------------------------------------------------------------------- 报告与门禁

/** p75：最近秩法（与 CrUX 的「第 75 百分位」口径一致：不插值，取实际出现过的值）。 */
export function percentile(values: readonly number[], p = 0.75): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

export interface VitalsRow { group: string; device: DeviceClass | "all"; name: VitalName; count: number; p75: number | null; threshold: number | null; gated: boolean; ok: boolean }

export interface VitalsReport { rows: VitalsRow[]; errors: string[]; insufficient: string[] }

/**
 * 按「全站 × 设备档」与「路由形态 × 设备档」算 p75。门禁：样本数 ≥ `minSamples` 的组里，带阈值的指标必须达标；
 * 全站的手机与桌面两档样本不足时记为 insufficient（数据不够下结论，调用方决定是否失败）。
 */
export function vitalsReport(all: readonly VitalsSample[], options: { minSamples?: number; thresholds?: Partial<Record<VitalName, number>> } = {}): VitalsReport {
  // 同一次浏览的同一指标（同一 id）只算最后一次
  const latest = new Map<string, VitalsSample>();
  for (const s of all) latest.set(`${s.id}\u0000${s.name}`, s);
  const samples = [...latest.values()];
  const minSamples = options.minSamples ?? 50;
  const thresholds = { ...VITALS_P75_THRESHOLDS, ...options.thresholds };
  const groups = new Map<string, { group: string; device: DeviceClass | "all"; name: VitalName; values: number[] }>();
  const add = (group: string, device: DeviceClass | "all", s: VitalsSample) => {
    const key = `${group}\u0000${device}\u0000${s.name}`;
    let g = groups.get(key);
    if (!g) { g = { group, device, name: s.name, values: [] }; groups.set(key, g); }
    g.values.push(s.value);
  };
  for (const s of samples) {
    add("(site)", s.device, s);
    add("(site)", "all", s);
    add(s.pattern ?? "(no route)", s.device, s);
  }
  const rows: VitalsRow[] = [...groups.values()].map((g) => {
    const threshold = thresholds[g.name] ?? null;
    const p75 = percentile(g.values);
    const gated = threshold !== null && g.values.length >= minSamples;
    return { group: g.group, device: g.device, name: g.name, count: g.values.length, p75, threshold, gated, ok: !gated || (p75 !== null && p75 <= threshold!) };
  });
  rows.sort((a, b) => (a.group === "(site)" ? -1 : 0) - (b.group === "(site)" ? -1 : 0) || a.group.localeCompare(b.group) || a.device.localeCompare(b.device) || VITAL_NAMES.indexOf(a.name) - VITAL_NAMES.indexOf(b.name));
  const errors = rows.filter((r) => !r.ok).map((r) => `${r.group} ${r.device} ${r.name} p75 ${formatVital(r.name, r.p75)} > ${formatVital(r.name, r.threshold)} (${r.count} samples)`);
  const insufficient: string[] = [];
  for (const device of ["mobile", "desktop"] as const) {
    for (const name of Object.keys(thresholds) as VitalName[]) {
      const row = rows.find((r) => r.group === "(site)" && r.device === device && r.name === name);
      if (!row || row.count < minSamples) insufficient.push(`(site) ${device} ${name}: ${row?.count ?? 0} < ${minSamples} samples`);
    }
  }
  return { rows, errors, insufficient };
}

export function formatVital(name: VitalName, value: number | null): string {
  if (value === null) return "-";
  return name === "CLS" ? value.toFixed(3) : `${Math.round(value)} ms`;
}

/**
 * 从日志里挑出样本行：一行一个 JSON；允许前面有日志前缀（取第一个 `{` 起的部分），其余行忽略。
 * 时间窗 `[since, until)`（epoch 毫秒，按样本的 `ts`）：上线后一周的现场验收按窗口取样本。
 */
export function parseVitalsLog(text: string, options: { since?: number; until?: number } = {}): VitalsSample[] {
  const out: VitalsSample[] = [];
  for (const line of text.split("\n")) {
    const start = line.indexOf("{\"type\":\"web-vital\"");
    if (start < 0) continue;
    try {
      const s = JSON.parse(line.slice(start)) as VitalsSample;
      if (s.type !== "web-vital" || !oneOf(VITAL_NAMES, s.name) || typeof s.value !== "number" || !oneOf(DEVICE_CLASSES, s.device)) continue;
      if (options.since && s.ts < options.since) continue;
      if (options.until && s.ts >= options.until) continue;
      out.push(s);
    } catch { /* 不是样本行 */ }
  }
  return out;
}
