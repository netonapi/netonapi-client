/**
 * 构建期注册表的「规划」：输入已加载的模块 manifest、解析后的站点配置、fork 页面清单与上次的路由清单，
 * 输出要写的全部文件与校验错误。纯函数，不碰文件系统——规则都在这里，可单测（plan.test.mts）。
 *
 * 校验（public-routes §14）：
 *  1. 路由 key 全局唯一、以模块 id 为前缀；实例 key 不重名，`of` 必须 instantiable
 *  2. 覆盖后的形态两两不冲突、不占保留前缀
 *  3. override 只改形态：参数名集合不变
 *  4. 有公开路由时 consoleBasePath ≠ "/"
 *  5. 入口都能解析（由调用方提供 resolvable）；插槽 target 已声明
 *  6. 禁止 import 扫描（scan.mts，调用方执行）
 *  7. URL 形态回归：上次构建有、这次形态变了或没了，必须有 legacy 声明（或 disable）
 *  8. contract 版本：major 相同且 minor ≤ 底座 minor；用了 1.1 字段必须声明 ≥ 1.1
 */
import {
  BASE_SLOT_TARGETS,
  type FrontModuleManifest,
  type PublicParamRule,
  type PublicRouteManifest,
} from "@neton/application-client-contract";
import {
  patternParamNames,
  patternsConflict,
  patternUnderPrefix,
  parsePattern,
  sentinelParam,
} from "@neton/application-client-runtime/public";
import { goneHtml, QUERY_SEGMENT, reservedPrefixes, robotsDisallow, type ResolvedSite } from "@neton/application-client-runtime/public";

export const SHELL_CONTRACT = { major: 1, minor: 1 } as const;
/** 查询变体路由里装编码查询串的参数名（与 runtime public-server/route.tsx 的 QUERY_PARAM 一致）。 */
export const QUERY_PARAM = "_q";

export interface LoadedModule { pkg: string; manifest: FrontModuleManifest }

export interface PlanInput {
  modules: LoadedModule[];
  site: ResolvedSite;
  /** fork 页面入口（`src/site/pages/<entry>.tsx` 存在的 entry 名） */
  sitePageEntries: string[];
  /** 上次构建的路由清单（public-routes.json），没有则 null */
  previousRoutes: Record<string, string> | null;
  /** 入口能否解析（`<pkg>/public/x`）；fork 页面入口用 sitePageEntries 判断 */
  resolvable: (specifier: string) => boolean;
  /** 站点语言下的 410 页文案（宿主 `site` 命名空间的 status.gone.* 与 status.home） */
  goneTexts: { title: string; body: string; home: string };
}

export interface PlannedRoute {
  key: string;
  /** 模块路由 key（实例的 of；fork 页面即自身） */
  of: string;
  namespace: string;
  /** 路由入口的 import 说明符 */
  importFrom: string;
  pattern: string;
  params: Record<string, PublicParamRule>;
  query: string[];
  cache: PublicRouteManifest["cache"];
  indexable: boolean;
  goneAware: boolean;
  fixed: Record<string, string>;
  /** 落在哪个路由组：模块 → (modules)，fork 页面 → (site) */
  group: "(modules)" | "(site)";
}

export interface PlanOutput {
  errors: string[];
  /** 相对 apps/console 的路径 → 内容 */
  files: Record<string, string>;
  routes: PlannedRoute[];
  /** 新的路由清单（写回 public-routes.json） */
  routesJson: Record<string, string>;
}

const PARAM_RULE_NAMES = new Set(["id", "int", "slug", "code"]);
const QUERY_NAME = /^[a-z][A-Za-z0-9_]{0,31}$/;
const KEY_NAME = /^[a-z][a-z0-9-]*\.[a-z][A-Za-z0-9-]*$/;
const INSTANCE_KEY = /^[a-z][a-z0-9-]*\.[a-z][A-Za-z0-9-]*@[a-z][a-z0-9-]*$/;
const SLOT_TARGET = /^[a-z][a-z0-9-]*(\.[a-z][A-Za-z0-9-]*)+$/;
const SITEMAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function usesV11(m: FrontModuleManifest): boolean {
  return Boolean(m.publicRoutes?.length || m.slots?.length || m.cardRenderers?.length || m.sitemaps?.length || m.feeds?.length || m.slotTargets?.length);
}

function versionOf(v: string): { major: number; minor: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

function validRule(rule: unknown): rule is PublicParamRule {
  if (typeof rule === "string") return PARAM_RULE_NAMES.has(rule);
  return Boolean(rule && typeof rule === "object" && Array.isArray((rule as { enum?: unknown }).enum) && (rule as { enum: unknown[] }).enum.length && (rule as { enum: unknown[] }).enum.every((v) => typeof v === "string" && v.length && !v.includes("/")));
}

/** `/channel/:code` → `channel/[code]`；`/` → ``。 */
export function routeDir(pattern: string): string {
  return parsePattern(pattern).map((s) => (s.kind === "param" ? `[${s.name}]` : s.value)).join("/");
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

/** 只生成查询变体的路由：没有路径参数、且可缓存（dynamic 档每次渲染，不涉及构建期预渲染）。 */
export function isQueryOnly(route: Pick<PlannedRoute, "pattern" | "cache">): boolean {
  return route.cache !== "dynamic" && patternParamNames(route.pattern).length === 0;
}

const HEADER = "/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改，不入库。 */\n";

function routeFile(route: PlannedRoute, variant: "plain" | "query"): string {
  const meta = {
    key: route.key, namespace: route.namespace, pattern: route.pattern, params: route.params, query: route.query,
    cache: route.cache, indexable: route.indexable, goneAware: route.goneAware, fixed: route.fixed,
  };
  const names = patternParamNames(route.pattern);
  const sentinel: Record<string, string> = Object.fromEntries(names.map((n) => [n, sentinelParam(route.params[n]!)]));
  if (variant === "query") sentinel[QUERY_PARAM] = "_";
  const head = `${HEADER}import route from ${JSON.stringify(route.importFrom)};
import type { PublicRouteMeta } from "@neton/application-client-runtime/public";
import { publicRuntime } from "@/site/public-runtime";

const META: PublicRouteMeta = ${JSON.stringify(meta)};
`;
  if (route.cache === "dynamic") {
    // 不缓存：每次渲染、只能是 200（流式输出后状态码不可改），所以 manifest 校验要求 indexable = false
    return `${head}
export const instant = false;

const page = publicRuntime.createPage(route, META, null);
export const generateMetadata = page.generateMetadata;
export default page.Page;
`;
  }
  const staticParams = Object.keys(sentinel).length
    ? `
/** 一组必然不合法的参数：构建期只预渲染出一个 404（Cache Components 要求至少一组），不连后端。 */
export function generateStaticParams() {
  return [${JSON.stringify(sentinel)}];
}
`
    : "";
  return `${head}
async function load(params: Record<string, string>, query: Record<string, string>) {
  "use cache";
  return publicRuntime.runLoad(route, META, params, query);
}

/** 未预渲染的 URL 第一次请求也等完整页面再输出：状态码（404 / 308）必须在第一个字节之前确定。 */
export const ensureStatic = "navigation";
${staticParams}
const page = publicRuntime.createPage(route, META, load);
export const generateMetadata = page.generateMetadata;
export default page.Page;
`;
}

function feedRouteFile(pkg: string, entry: string, meta: { id: string; namespace: string; pattern: string; params: Record<string, PublicParamRule> }): string {
  return `${HEADER}import feed from ${JSON.stringify(`${pkg}/feeds/${entry}`)};
import { connection } from "next/server";
import { feedResponse, renderFeed, type FeedRouteMeta } from "@/site/feeds";

const META: FeedRouteMeta = ${JSON.stringify(meta)};

async function body(params: Record<string, string>) {
  "use cache";
  return renderFeed(feed, META, params);
}

/** 按请求生成（内容是上面的缓存单元）：构建期不预渲染、不连后端（public-routes §1a）。 */
export async function GET(_request: Request, context: { params?: Promise<Record<string, string> | undefined> }) {
  await connection();
  return feedResponse((await context.params) ?? {}, body);
}
`;
}

function consoleFiles(base: string): Record<string, string> {
  const dir = join("src/app/(console)", base.replace(/^\//, ""));
  return {
    [join(dir, "layout.tsx")]: `${HEADER}export { default } from "@/console/layout";

/** 受保护布局在服务端读会话 Cookie：允许阻塞，不做静态外壳校验。 */
export const instant = false;
`,
    [join(dir, "page.tsx")]: `${HEADER}export { default } from "@/console/page";\n`,
    [join(dir, "[...slug]/page.tsx")]: `${HEADER}export { default } from "@/console/page";\n`,
  };
}

export function plan(input: PlanInput): PlanOutput {
  const errors: string[] = [];
  const { site, modules } = input;
  const fail = (message: string) => errors.push(`[registry] ${message}`);

  // ---- 模块 id、版本、页面（1.0 的规则照旧） ----
  const ids = new Map<string, string>();
  const pageKeys = new Map<string, string>();
  const pagePaths = new Map<string, string>();
  for (const { pkg, manifest } of modules) {
    if (ids.has(manifest.id)) fail(`duplicate module id "${manifest.id}": ${ids.get(manifest.id)} vs ${pkg}`);
    ids.set(manifest.id, pkg);
    const v = versionOf(String(manifest.contractVersion));
    if (!v || v.major !== SHELL_CONTRACT.major || v.minor > SHELL_CONTRACT.minor) {
      fail(`${pkg} contractVersion=${manifest.contractVersion} is not compatible with the shell contract ${SHELL_CONTRACT.major}.${SHELL_CONTRACT.minor}`);
    } else if (usesV11(manifest) && v.minor < 1) {
      fail(`${pkg} uses contract 1.1 fields (publicRoutes / slots / cardRenderers / sitemaps / feeds) but declares contractVersion=${manifest.contractVersion}`);
    }
    for (const p of manifest.pages) {
      if (pageKeys.has(p.key)) fail(`duplicate page key "${p.key}": ${pageKeys.get(p.key)} vs ${pkg}`);
      pageKeys.set(p.key, pkg);
      if (pagePaths.has(p.path)) fail(`duplicate console path "${p.path}": ${pagePaths.get(p.path)} vs ${pkg}`);
      pagePaths.set(p.path, pkg);
    }
  }
  for (const { pkg, manifest } of modules) {
    for (const r of manifest.requires ?? []) if (!ids.has(r)) fail(`${pkg} requires "${r}", which is not installed`);
  }

  // ---- 公开路由：模块 → 覆盖 / 禁用 → 实例 → fork 页面 ----
  const reserved = reservedPrefixes(site);
  const declared = new Map<string, { pkg: string; moduleId: string; route: PublicRouteManifest }>();
  for (const { pkg, manifest } of modules) {
    for (const route of manifest.publicRoutes ?? []) {
      if (!KEY_NAME.test(route.key) || !route.key.startsWith(`${manifest.id}.`)) fail(`${pkg} public route key "${route.key}" must be "<module id>.<name>" (${manifest.id}.…)`);
      if (declared.has(route.key)) fail(`duplicate public route key "${route.key}": ${declared.get(route.key)!.pkg} vs ${pkg}`);
      declared.set(route.key, { pkg, moduleId: manifest.id, route });
    }
  }
  const disabled = new Set(site.routes.disable);
  for (const key of disabled) {
    if (!declared.has(key) && !(input.previousRoutes && key in input.previousRoutes)) fail(`routes.disable lists unknown route "${key}"`);
  }
  for (const key of Object.keys(site.routes.override)) {
    if (!declared.has(key)) fail(`routes.override targets unknown route "${key}"`);
  }

  const routes: PlannedRoute[] = [];
  const validateRouteShape = (owner: string, key: string, pattern: string, params: Record<string, PublicParamRule> | undefined, query: string[] | undefined, cache: string, indexable: boolean, goneAware: boolean) => {
    let names: string[] = [];
    try { names = patternParamNames(pattern); } catch (e) { fail(`${owner} ${key}: ${(e as Error).message}`); return false; }
    for (const n of names) if (!params?.[n]) fail(`${owner} ${key}: parameter ":${n}" has no rule in params`);
    for (const [n, rule] of Object.entries(params ?? {})) {
      if (!names.includes(n)) fail(`${owner} ${key}: params.${n} is not in the pattern ${pattern}`);
      if (!validRule(rule)) fail(`${owner} ${key}: params.${n} has an invalid rule ${JSON.stringify(rule)}`);
    }
    const q = query ?? [];
    if (new Set(q).size !== q.length) fail(`${owner} ${key}: duplicate query names`);
    for (const n of q) if (!QUERY_NAME.test(n) || n === QUERY_PARAM) fail(`${owner} ${key}: invalid query name "${n}"`);
    if (!["object", "list", "static", "dynamic"].includes(cache)) fail(`${owner} ${key}: invalid cache "${cache}"`);
    if (cache === "dynamic" && indexable) fail(`${owner} ${key}: dynamic routes render with status 200 only and must not be indexable`);
    if (cache === "dynamic" && goneAware) fail(`${owner} ${key}: dynamic routes cannot be goneAware`);
    for (const prefix of reserved) if (patternUnderPrefix(pattern, prefix)) fail(`${owner} ${key}: pattern ${pattern} is under the reserved prefix ${prefix}`);
    return true;
  };

  for (const [key, { pkg, moduleId, route }] of declared) {
    if (disabled.has(key)) continue;
    const pattern = site.routes.override[key] ?? route.pattern;
    if (!validateRouteShape(pkg, key, route.pattern, route.params, route.query, route.cache, route.indexable, Boolean(route.goneAware))) continue;
    if (pattern !== route.pattern) {
      try {
        const a = [...patternParamNames(route.pattern)].sort().join(",");
        const b = [...patternParamNames(pattern)].sort().join(",");
        if (a !== b) fail(`routes.override["${key}"] = ${pattern} must keep the parameter names of ${route.pattern}`);
      } catch (e) { fail(`routes.override["${key}"]: ${(e as Error).message}`); continue; }
      validateRouteShape("routes.override", key, pattern, route.params, route.query, route.cache, route.indexable, Boolean(route.goneAware));
    }
    const importFrom = `${pkg}/public/${route.entry}`;
    if (!input.resolvable(importFrom)) fail(`${pkg} public route ${key}: entry ${importFrom} does not resolve (add the file, then pnpm install at the host root)`);
    routes.push({ key, of: key, namespace: moduleId, importFrom, pattern, params: route.params ?? {}, query: route.query ?? [], cache: route.cache, indexable: route.indexable, goneAware: Boolean(route.goneAware), fixed: {}, group: "(modules)" });
  }

  for (const instance of site.routes.instances) {
    const source = declared.get(instance.of);
    if (!INSTANCE_KEY.test(instance.key) || !instance.key.startsWith(`${instance.of}@`)) fail(`routes.instances: key "${instance.key}" must be "${instance.of}@<name>"`);
    if (!source) { fail(`routes.instances: "${instance.key}" reuses unknown route "${instance.of}"`); continue; }
    if (!source.route.instantiable) { fail(`routes.instances: "${instance.of}" is not instantiable`); continue; }
    if (disabled.has(instance.of)) fail(`routes.instances: "${instance.key}" reuses the disabled route "${instance.of}"`);
    let names: string[];
    try { names = patternParamNames(instance.pattern); } catch (e) { fail(`routes.instances ${instance.key}: ${(e as Error).message}`); continue; }
    const params = Object.fromEntries(Object.entries(source.route.params ?? {}).filter(([n]) => names.includes(n)));
    for (const n of names) if (!source.route.params?.[n]) fail(`routes.instances ${instance.key}: ":${n}" is not a parameter of ${instance.of}`);
    for (const n of Object.keys(instance.fixed)) {
      if (names.includes(n)) fail(`routes.instances ${instance.key}: fixed "${n}" is also a URL parameter`);
    }
    for (const prefix of reserved) if (patternUnderPrefix(instance.pattern, prefix)) fail(`routes.instances ${instance.key}: pattern ${instance.pattern} is under the reserved prefix ${prefix}`);
    routes.push({
      key: instance.key, of: instance.of, namespace: source.moduleId, importFrom: `${source.pkg}/public/${source.route.entry}`,
      pattern: instance.pattern, params, query: source.route.query ?? [], cache: source.route.cache, indexable: source.route.indexable,
      goneAware: Boolean(source.route.goneAware), fixed: { ...instance.fixed }, group: "(modules)",
    });
  }

  const seenPages = new Set<string>();
  for (const page of site.pages) {
    if (!/^site\.[a-z][A-Za-z0-9-]*$/.test(page.key)) fail(`pages: key "${page.key}" must be "site.<name>"`);
    if (seenPages.has(page.key)) fail(`pages: duplicate key "${page.key}"`);
    seenPages.add(page.key);
    if (!input.sitePageEntries.includes(page.entry)) fail(`pages ${page.key}: src/site/pages/${page.entry}.tsx does not exist`);
    if (!validateRouteShape("pages", page.key, page.pattern, page.params, page.query, page.cache, page.indexable, Boolean(page.goneAware))) continue;
    routes.push({ key: page.key, of: page.key, namespace: "site", importFrom: `@/site/pages/${page.entry}`, pattern: page.pattern, params: page.params ?? {}, query: page.query ?? [], cache: page.cache, indexable: page.indexable, goneAware: Boolean(page.goneAware), fixed: {}, group: "(site)" });
  }

  if (routes.length && !site.consoleBasePath) fail(`public routes are installed (${routes.map((r) => r.key).join(", ")}), so consoleBasePath must not be "/" (set it in site.config.ts, e.g. "/my")`);

  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i]!;
      const b = routes[j]!;
      try {
        if (patternsConflict(a.pattern, b.pattern)) fail(`public routes ${a.key} (${a.pattern}) and ${b.key} (${b.pattern}) match the same URLs`);
      } catch { /* 形态错误已报 */ }
    }
  }

  // ---- legacy（§13）：模块 legacyPatterns + 站点 routes.legacy ----
  const legacy: { from: string; to: string; key: string }[] = [];
  for (const route of routes) {
    const sources = [
      ...(route.of === route.key ? declared.get(route.key)?.route.legacyPatterns ?? [] : []),
      ...(site.routes.legacy[route.key] ?? []),
    ];
    for (const from of sources) {
      try {
        const a = [...patternParamNames(from)].sort().join(",");
        const b = [...patternParamNames(route.pattern)].sort().join(",");
        if (a !== b) { fail(`legacy pattern ${from} of ${route.key} must have the same parameters as ${route.pattern}`); continue; }
      } catch (e) { fail(`legacy pattern of ${route.key}: ${(e as Error).message}`); continue; }
      if (from === route.pattern) continue;
      const clash = routes.find((r) => patternsConflict(r.pattern, from));
      if (clash) { fail(`legacy pattern ${from} of ${route.key} collides with the live route ${clash.key} (${clash.pattern})`); continue; }
      legacy.push({ from, to: route.pattern, key: route.key });
    }
  }
  for (const key of Object.keys(site.routes.legacy)) {
    if (!routes.some((r) => r.key === key)) fail(`routes.legacy targets unknown route "${key}"`);
  }

  // ---- URL 形态回归 ----
  const routesJson = Object.fromEntries(routes.map((r) => [r.key, r.pattern]).sort(([a], [b]) => (a! < b! ? -1 : 1)));
  for (const [key, oldPattern] of Object.entries(input.previousRoutes ?? {})) {
    if (disabled.has(key)) continue;
    const now = routesJson[key];
    if (now === oldPattern) continue;
    const covered = legacy.some((l) => l.key === key && l.from === oldPattern);
    if (!covered) {
      fail(now
        ? `public route ${key} moved from ${oldPattern} to ${now}: declare the old shape in legacyPatterns (module) or routes.legacy["${key}"] (site) so old URLs 308, or the change loses indexed URLs`
        : `public route ${key} (${oldPattern}) disappeared: list it in routes.disable to acknowledge that its URLs now 404, or keep it installed`);
    }
  }

  // ---- 插槽、卡片、sitemap、feed ----
  const targets = new Set<string>(BASE_SLOT_TARGETS);
  for (const { pkg, manifest } of modules) {
    for (const t of manifest.slotTargets ?? []) {
      if (!SLOT_TARGET.test(t) || !t.startsWith(`${manifest.id}.`)) fail(`${pkg} slotTargets entry "${t}" must start with "${manifest.id}."`);
      targets.add(t);
    }
  }
  const slotIds = new Set<string>();
  const slotEntries: { pkg: string; id: string; target: string; specifier: string; rendering: "server" | "client" }[] = [];
  for (const { pkg, manifest } of modules) {
    for (const slot of manifest.slots ?? []) {
      if (!slot.id.startsWith(`${manifest.id}.`)) fail(`${pkg} slot id "${slot.id}" must start with "${manifest.id}."`);
      if (!targets.has(slot.target)) fail(`${pkg} slot ${slot.id} targets undeclared slot "${slot.target}"`);
      if (slot.rendering !== "server" && slot.rendering !== "client") fail(`${pkg} slot ${slot.id}: rendering must be "server" or "client"`);
      const uid = `${slot.target}#${slot.id}`;
      if (slotIds.has(uid)) fail(`duplicate slot contribution ${slot.id} in ${slot.target}`);
      slotIds.add(uid);
      const specifier = `${pkg}/slots/${slot.entry}`;
      if (!input.resolvable(specifier)) fail(`${pkg} slot ${slot.id}: entry ${specifier} does not resolve`);
      slotEntries.push({ pkg, id: slot.id, target: slot.target, specifier, rendering: slot.rendering });
    }
  }
  const cardTypes = new Map<string, string>();
  for (const { pkg, manifest } of modules) {
    for (const card of manifest.cardRenderers ?? []) {
      if (cardTypes.has(card.objectType)) fail(`object type ${card.objectType} has two card renderers: ${cardTypes.get(card.objectType)} and ${pkg}`);
      cardTypes.set(card.objectType, `${pkg}/cards/${card.entry}`);
      if (!input.resolvable(`${pkg}/cards/${card.entry}`)) fail(`${pkg} card renderer ${card.objectType}: entry ${pkg}/cards/${card.entry} does not resolve`);
    }
  }
  const sitemapIds = new Map<string, string>();
  const sitemaps: { id: string; specifier: string; news: boolean; namespace: string }[] = [];
  for (const { pkg, manifest } of modules) {
    for (const s of manifest.sitemaps ?? []) {
      if (!SITEMAP_ID.test(s.id) || s.id === "news" || s.id === "gone") fail(`${pkg} sitemap id "${s.id}" must match ${SITEMAP_ID} and not be "news" / "gone"`);
      if (sitemapIds.has(s.id)) fail(`duplicate sitemap id "${s.id}": ${sitemapIds.get(s.id)} vs ${pkg}`);
      sitemapIds.set(s.id, pkg);
      const specifier = `${pkg}/sitemaps/${s.entry}`;
      if (!input.resolvable(specifier)) fail(`${pkg} sitemap ${s.id}: entry ${specifier} does not resolve`);
      sitemaps.push({ id: s.id, specifier, news: Boolean(s.news), namespace: manifest.id });
    }
  }
  const feedIds = new Set<string>();
  const siteFeeds: { id: string; specifier: string; namespace: string }[] = [];
  const files: Record<string, string> = {};
  for (const { pkg, manifest } of modules) {
    for (const feed of manifest.feeds ?? []) {
      if (feedIds.has(feed.id)) fail(`duplicate feed id "${feed.id}"`);
      feedIds.add(feed.id);
      const specifier = `${pkg}/feeds/${feed.entry}`;
      if (!input.resolvable(specifier)) fail(`${pkg} feed ${feed.id}: entry ${specifier} does not resolve`);
      if (feed.site) siteFeeds.push({ id: feed.id, specifier, namespace: manifest.id });
      if (!feed.pattern) continue;
      if (feed.pattern === "/rss.xml") { if (!feed.site) fail(`${pkg} feed ${feed.id}: /rss.xml is the site feed; declare site: true instead of the pattern`); continue; }
      if (!feed.pattern.endsWith(".xml")) fail(`${pkg} feed ${feed.id}: pattern must end with .xml`);
      let feedParams: string[] = [];
      try { feedParams = patternParamNames(feed.pattern); } catch (e) { fail(`${pkg} feed ${feed.id}: ${(e as Error).message}`); continue; }
      for (const n of feedParams) if (!feed.params?.[n]) fail(`${pkg} feed ${feed.id}: ":${n}" has no rule in params`);
      const clash = routes.find((r) => patternsConflict(r.pattern, feed.pattern!));
      if (clash) fail(`${pkg} feed ${feed.id} (${feed.pattern}) collides with public route ${clash.key}`);
      for (const prefix of reserved) if (patternUnderPrefix(feed.pattern, prefix)) fail(`${pkg} feed ${feed.id}: pattern is under the reserved prefix ${prefix}`);
      const dir = feed.pattern.slice(1).split("/").map((s) => (s.startsWith(":") ? `[${s.slice(1)}]` : s)).join("/");
      files[join("src/app/(public)/(modules)", dir, "route.ts")] = feedRouteFile(pkg, feed.entry, { id: feed.id, namespace: manifest.id, pattern: feed.pattern, params: feed.params ?? {} });
    }
  }
  if (siteFeeds.length && !site.feeds.site?.title) fail(`site feed contributions exist (${siteFeeds.map((f) => f.id).join(", ")}) but site.config feeds.site.title is not set`);

  // ---- 生成物 ----
  // 没有路径参数的可缓存路由（首页、`/hot`）只生成查询变体：proxy 把裸地址改写到 `~q/-`。这样它们与带参数的
  // 路由同形——按需渲染 + ensureStatic，构建期只预渲染哨兵（404），不连后端（public-routes §1a）。
  for (const route of routes) {
    const dir = join(`src/app/(public)/${route.group}`, routeDir(route.pattern));
    const queryVariant = join(dir, QUERY_SEGMENT, `[${QUERY_PARAM}]`, "page.tsx");
    if (isQueryOnly(route)) {
      files[queryVariant] = routeFile(route, "query");
      continue;
    }
    files[join(dir, "page.tsx")] = routeFile(route, "plain");
    if (route.query.length) files[queryVariant] = routeFile(route, "query");
  }
  Object.assign(files, consoleFiles(site.consoleBasePath));

  const localeEntries: string[] = [];
  for (const { pkg, manifest } of modules) {
    if (!manifest.locales?.length) continue;
    const langs = manifest.locales.map((l) => {
      const spec = `${pkg}/locales/${l.entry}`;
      if (!input.resolvable(spec)) fail(`${pkg} declares locale ${l.lang} → ${spec}, which does not resolve (after adding files run pnpm install at the host root)`);
      return `    ${JSON.stringify(l.lang)}: () => import(${JSON.stringify(spec)}),`;
    });
    localeEntries.push(`  ${JSON.stringify(manifest.id)}: {\n${langs.join("\n")}\n  },`);
  }
  const pageEntries = modules.flatMap(({ pkg, manifest }) =>
    manifest.pages.map((p) => `  ${JSON.stringify(p.key)}: () => import(${JSON.stringify(`${pkg}/pages/${p.entry}`)}),`));
  files["src/generated/modules.generated.ts"] = `${HEADER}import type { FrontModuleManifest } from "@neton/application-client-contract";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = ${JSON.stringify(modules.map((m) => m.manifest), null, 2)};

/** 控制台页面：只给控制台用。公开页的服务端代码不得 import 本文件（页面入口会成为公开路由的客户端引用）。 */
export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
${pageEntries.join("\n")}
};

export { localeRegistry } from "./locales.generated";
`;

  // 语言包单独成文件：公开页的服务端翻译只 import 它，不把控制台页面拖进公开路由的客户端引用清单（首屏 JS 预算，public-routes §10.6）
  files["src/generated/locales.generated.ts"] = `${HEADER}import type { LocaleRegistry } from "@neton/application-client-runtime/i18n";

/** 模块语言包：命名空间（模块 id）→ 语言 → loader。随模块懒加载。 */
export const localeRegistry: LocaleRegistry = {
${localeEntries.join("\n")}
};
`;

  files["src/generated/site.generated.ts"] = `${HEADER}import type { ResolvedSite } from "@neton/application-client-runtime/public";

/** 解析后的站点配置（site.config.ts + 构建期环境变量）。 */
export const site: ResolvedSite = ${JSON.stringify(site, null, 2)};
`;

  const proxyRoutes = routes.map((r) => ({ key: r.key, pattern: r.pattern, query: r.query, goneAware: r.goneAware, ...(isQueryOnly(r) ? { queryOnly: true } : {}) }));
  files["src/generated/public-proxy.generated.ts"] = `${HEADER}import type { PublicProxyConfig } from "@neton/application-client-runtime/public-proxy";

/** proxy 只拿数据：不 import 任何模块代码，proxy 的打包入口保持很小。 */
export const proxyConfig: PublicProxyConfig = ${JSON.stringify({
    consoleBasePath: site.consoleBasePath,
    routes: proxyRoutes,
    legacy: legacy.map(({ from, to }) => ({ from, to })),
    nonConsole: ["/login", "/register", "/forgot-password", "/api", "/robots.txt", "/sitemap.xml", "/sitemaps", "/rss.xml", "/indexnow-key.txt", "/favicon.ico", "/.well-known"],
    goneHtml: goneHtml({ locale: site.locale, siteName: site.brand.name, ...input.goneTexts }),
  }, null, 2)};
`;

  const imports: string[] = [];
  const slotLines: string[] = [];
  slotEntries.forEach((s, i) => {
    imports.push(`import Slot${i} from ${JSON.stringify(s.specifier)};`);
    const contribution = modules.flatMap((m) => m.manifest.slots ?? []).find((c) => c.id === s.id && c.target === s.target)!;
    slotLines.push(`  { contribution: ${JSON.stringify(contribution)}, Component: Slot${i} },`);
  });
  const cardLines: string[] = [];
  [...cardTypes].forEach(([type, specifier], i) => {
    imports.push(`import Card${i} from ${JSON.stringify(specifier)};`);
    cardLines.push(`  ${JSON.stringify(type)}: Card${i},`);
  });
  const sitemapLines: string[] = [];
  sitemaps.forEach((s, i) => {
    imports.push(`import Sitemap${i} from ${JSON.stringify(s.specifier)};`);
    sitemapLines.push(`  { id: ${JSON.stringify(s.id)}, news: ${s.news}, namespace: ${JSON.stringify(s.namespace)}, definition: Sitemap${i} },`);
  });
  const feedLines: string[] = [];
  siteFeeds.forEach((f, i) => {
    imports.push(`import Feed${i} from ${JSON.stringify(f.specifier)};`);
    feedLines.push(`  { id: ${JSON.stringify(f.id)}, namespace: ${JSON.stringify(f.namespace)}, definition: Feed${i} },`);
  });
  const publicNamespaces = [...new Set(modules.filter((m) => usesV11(m.manifest) && m.manifest.locales?.length).map((m) => m.manifest.id))];
  files["src/generated/public.generated.tsx"] = `${HEADER}import type { SlotContribution } from "@neton/application-client-contract";
import type { FeedDefinition, SitemapDefinition } from "@neton/application-client-runtime/public";
import type * as React from "react";
${imports.join("\n")}

export interface SlotEntry { contribution: SlotContribution; Component: React.ComponentType<any> }

/** 插槽贡献（服务端组件与客户端岛都在这里，按 manifest 的 rendering 区分）。 */
export const slotRegistry: SlotEntry[] = [
${slotLines.join("\n")}
];

/** 对象类型 → 卡片渲染器（服务端组件）。没有登记的类型用底座的通用卡片。 */
export const cardRegistry: Record<string, React.ComponentType<any>> = {
${cardLines.join("\n")}
};

export const sitemapRegistry: { id: string; news: boolean; namespace: string; definition: SitemapDefinition }[] = [
${sitemapLines.join("\n")}
];

/** 聚合进站点 feed（/rss.xml）的贡献。 */
export const siteFeedRegistry: { id: string; namespace: string; definition: FeedDefinition }[] = [
${feedLines.join("\n")}
];

/** 已装配的公开路由：key → 形态（ctx.href 用）。 */
export const routePatterns: Record<string, string> = ${JSON.stringify(routesJson, null, 2)};

/** 公开页客户端岛要用到的模块词条命名空间（公开布局一次性交给客户端，首帧就有译文）。 */
export const publicNamespaces: string[] = ${JSON.stringify(publicNamespaces)};

/** robots.txt 的 Disallow（底座固定项 + 站点配置）。 */
export const robotsDisallowPaths: string[] = ${JSON.stringify(robotsDisallow(site))};

/** 是否有搜索类（dynamic）路由：首页 WebSite JSON-LD 的 SearchAction 指向它。 */
export const searchRoute: { key: string; pattern: string; queryName: string } | null = ${JSON.stringify(
    (() => {
      const r = routes.find((x) => x.cache === "dynamic" && x.query.includes("q"));
      return r ? { key: r.key, pattern: r.pattern, queryName: "q" } : null;
    })(),
  )};
`;

  return { errors, files, routes, routesJson };
}
