/**
 * 首屏 JS 预算（public-routes §10.6）：读 `next build` 的产物清单，按 gzip 计量。
 *
 * - 框架底数：build-manifest.json 的 `rootMainFiles`——每个页面都加载（react-dom、Next 路由、React、
 *   Turbopack 运行时），与路由无关；`polyfillFiles` 是 nomodule 脚本，现代浏览器不加载，不计。
 * - 路由自身：该路由 client-reference manifest 里 `entryJSFiles` 的并集（根布局、路由组布局、页面、
 *   not-found 等边界）减去框架底数。动态 import 的懒加载块不在首屏，不计。
 *
 * 预算分开设：框架底数一个上限（防止有人把依赖塞进根布局，或框架升级把底数抬高）；路由自身一个上限
 * （公开路由缺省值 + 按路由覆盖）。总量 = 底数 + 路由自身，只报告不单独卡。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

export interface BundleBudget {
  /** 框架底数（所有页面共享的 rootMainFiles）上限，KB（1024 字节）gzip。 */
  shared: number;
  /** 公开路由（`(public)` 路由组）自身 JS 的缺省上限，KB gzip。 */
  public: number;
  /** 按路由覆盖，key 是去掉路由组后的路由（如 `/item/[id]`）；也可给控制台路由设上限。 */
  routes?: Record<string, number>;
}

export interface RouteMeasure {
  /** 去掉路由组后的路由，如 `/item/[id]`。 */
  route: string;
  /** app 目录下的原始路径，如 `/(public)/(modules)/item/[id]`。 */
  appPath: string;
  public: boolean;
  /** 路由自身的块（不含框架底数）。 */
  chunks: string[];
  ownBytes: number;
}

export interface Measurement {
  shared: { chunks: string[]; bytes: number };
  routes: RouteMeasure[];
}

export interface Verdict {
  errors: string[];
  rows: { route: string; own: number; total: number; budget: number | null; ok: boolean }[];
  shared: { bytes: number; budget: number; ok: boolean };
}

export const kb = (bytes: number) => bytes / 1024;

/** `/(public)/(modules)/item/[id]/page` → `/item/[id]`。 */
export function routeOf(appPath: string): string {
  const segments = appPath.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join("/")}`;
}

/** 解析 `page_client-reference-manifest.js`：`globalThis.__RSC_MANIFEST["<page>"] = {…}`。 */
export function parseClientReferenceManifest(source: string): { page: string; entryJSFiles: Record<string, string[]> } {
  const sandbox: { __RSC_MANIFEST?: Record<string, { entryJSFiles?: Record<string, string[]> }> } = {};
  new Function("globalThis", source)(sandbox);
  const [page, manifest] = Object.entries(sandbox.__RSC_MANIFEST ?? {})[0] ?? [];
  if (!page || !manifest) throw new Error("not a client reference manifest");
  return { page, entryJSFiles: manifest.entryJSFiles ?? {} };
}

function findPageManifests(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return findPageManifests(full);
    return name === "page_client-reference-manifest.js" ? [full] : [];
  });
}

/** 按 distDir 量出框架底数与每个页面路由自身的 gzip 体积（`_not-found`、`_global-error` 不计）。 */
export function measure(distDir: string, gzipSize: (file: string) => number = (f) => gzipSync(readFileSync(f)).length): Measurement {
  const buildManifest = JSON.parse(readFileSync(path.join(distDir, "build-manifest.json"), "utf8")) as { rootMainFiles?: string[] };
  const sharedChunks = buildManifest.rootMainFiles ?? [];
  const shared = new Set(sharedChunks);
  const sizes = new Map<string, number>();
  const size = (chunk: string) => {
    if (!sizes.has(chunk)) sizes.set(chunk, gzipSize(path.join(distDir, chunk)));
    return sizes.get(chunk)!;
  };
  const routes = findPageManifests(path.join(distDir, "server/app")).flatMap((file): RouteMeasure[] => {
    const { page, entryJSFiles } = parseClientReferenceManifest(readFileSync(file, "utf8"));
    const appPath = page.replace(/\/page$/, "") || "/";
    if (/^\/_(not-found|global-error)$/.test(appPath)) return [];
    const chunks = [...new Set(Object.values(entryJSFiles).flat())].filter((c) => c.endsWith(".js") && !shared.has(c)).sort();
    return [{ route: routeOf(appPath), appPath, public: appPath.startsWith("/(public)/"), chunks, ownBytes: chunks.reduce((n, c) => n + size(c), 0) }];
  });
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return { shared: { chunks: sharedChunks, bytes: sharedChunks.reduce((n, c) => n + size(c), 0) }, routes };
}

/** 对照预算：超出即错误；没有预算的路由（控制台、登录注册未单列时）只报告。 */
export function evaluate(m: Measurement, budget: BundleBudget): Verdict {
  const errors: string[] = [];
  const sharedOk = kb(m.shared.bytes) <= budget.shared;
  if (!sharedOk) errors.push(`框架底数 ${kb(m.shared.bytes).toFixed(1)} KB 超出上限 ${budget.shared} KB（rootMainFiles：${m.shared.chunks.join(", ")}）`);
  const measured = new Set(m.routes.map((r) => r.route));
  for (const route of Object.keys(budget.routes ?? {})) {
    if (!measured.has(route)) errors.push(`预算里的路由 ${route} 不在构建产物里（路由写法是去掉路由组后的路径，如 /item/[id]）`);
  }
  const rows = m.routes.map((r) => {
    const limit = budget.routes?.[r.route] ?? (r.public ? budget.public : null);
    const ok = limit === null || kb(r.ownBytes) <= limit;
    if (!ok) errors.push(`${r.route} 自身 JS ${kb(r.ownBytes).toFixed(1)} KB 超出预算 ${limit} KB（${r.chunks.join(", ")}）`);
    return { route: r.route, own: kb(r.ownBytes), total: kb(m.shared.bytes + r.ownBytes), budget: limit, ok };
  });
  return { errors, rows, shared: { bytes: m.shared.bytes, budget: budget.shared, ok: sharedOk } };
}

export function report(v: Verdict): string {
  const lines = [`framework (shared) ${kb(v.shared.bytes).toFixed(1)} KB / ${v.shared.budget} KB${v.shared.ok ? "" : "  ✗"}`];
  const width = Math.max(5, ...v.rows.map((r) => r.route.length));
  lines.push(`${"route".padEnd(width)}  own KB  budget  total KB`);
  for (const r of v.rows) {
    lines.push(`${r.route.padEnd(width)}  ${r.own.toFixed(1).padStart(6)}  ${(r.budget === null ? "-" : String(r.budget)).padStart(6)}  ${r.total.toFixed(1).padStart(8)}${r.ok ? "" : "  ✗"}`);
  }
  return lines.join("\n");
}
