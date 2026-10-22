/**
 * 语言包检查（与 admin 线同一规则）。在 typecheck 之前跑，任何失败都中断。
 *
 * 1. 每个命名空间的各语言 key 集合必须完全一致；同一 key 在各语言里用到的 `{参数}` 也必须一致
 *    （漏一个参数，界面上就会原样露出 `{name}`）。
 * 2. 声明了 `locales` 的模块已承诺完成国际化：它的源码（控制台页面、公开路由、插槽、卡片、sitemap、
 *    feed）里不得再出现硬编码的中文字符串（注释除外）。
 * 3. 宿主自己的源码（apps/console/src，含 fork 的门户外壳与页面）同样不得硬编码中文；词条放进
 *    `console`（控制台、登录注册）或 `site`（门户）命名空间。
 * 4. 还没有声明 `locales` 的模块列为待迁移，只告警不失败 —— 迁移逐个模块推进，已迁移的不允许倒退。
 * 5. 模块的公开页客户端岛（模块源码里 `"use client"` 的文件，控制台页面 `pages/` 与只贡献给控制台插槽 `console.*`
 *    的插槽文件除外）只能用公开 key（`public.*`、`error.*`）：公开页的 HTML 只预载这部分词条（public-routes §12）。
 *
 * 测试文件（`*.test.*`、`__tests__/`、`__fixtures__/`）不检查：断言里写中文是在验证译文。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrontModuleManifest } from "@neton/application-client-contract";

type Catalog = Record<string, Record<string, string>>; // locale → key → template

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/console");
const shellRequire = createRequire(path.join(shellDir, "package.json"));
const errors: string[] = [];
const warnings: string[] = [];

function params(template: string): string {
  return [...template.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
}

function checkNamespace(namespace: string, catalog: Catalog) {
  const locales = Object.keys(catalog);
  if (locales.length === 0) return;
  const reference = locales[0]!;
  const refKeys = new Set(Object.keys(catalog[reference]!));
  for (const locale of locales.slice(1)) {
    const keys = new Set(Object.keys(catalog[locale]!));
    for (const k of refKeys) if (!keys.has(k)) errors.push(`[${namespace}] ${locale} 缺少 key "${k}"（${reference} 有）`);
    for (const k of keys) if (!refKeys.has(k)) errors.push(`[${namespace}] ${reference} 缺少 key "${k}"（${locale} 有）`);
    for (const k of refKeys) {
      if (keys.has(k) && params(catalog[reference]![k]!) !== params(catalog[locale]![k]!)) {
        errors.push(`[${namespace}] "${k}" 的参数不一致：${reference}={${params(catalog[reference]![k]!)}} ${locale}={${params(catalog[locale]![k]!)}}`);
      }
    }
  }
}

/**
 * 去掉注释后再找中文：注释写中文是允许的。行尾带 `i18n-exempt` 注释的行跳过——只给不该翻译的
 * 文字用（语言自称，如语言切换器里的「简体中文」）。
 */
function hardcodedCjk(file: string): string[] {
  const raw = readFileSync(file, "utf8");
  const exempt = new Set(raw.split("\n").flatMap((line, i) => (/\/\/\s*i18n-exempt\b/.test(line) ? [i] : [])));
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  return source.split("\n").flatMap((line, i) => (!exempt.has(i) && /[一-鿿]/.test(line) ? [`${path.relative(shellDir, file)}:${i + 1}: ${line.trim().slice(0, 80)}`] : []));
}

const TEST_DIRS = new Set(["__tests__", "__fixtures__", "__mocks__"]);

function walk(dir: string, skipDirs: ReadonlySet<string> = TEST_DIRS): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return skipDirs.has(name) ? [] : walk(full, skipDirs);
    return /\.(tsx?|mts)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) ? [full] : [];
  });
}

const PUBLIC_KEY = /^(public|error)\./;

/** 模块客户端岛里用到的 key：只看调用了 `useT("<模块 id>")` 的 `"use client"` 文件里的字面量 `t("…")`。 */
function clientIslandKeys(file: string, namespace: string): string[] {
  const source = readFileSync(file, "utf8");
  if (!/^\s*["']use client["']/m.test(source.split("\n").slice(0, 5).join("\n"))) return [];
  if (!new RegExp(`useT\\(\\s*["']${namespace}["']`).test(source)) return [];
  return [...new Set([...source.matchAll(/\bt\(\s*["']([^"']+)["']/g)].map((m) => m[1]!))];
}

// ---- 静态词条：运行时 + 宿主（控制台 console、门户 site） ----
const load = async <T,>(file: string) => (await import(pathToFileURL(file).href)) as T;
const { runtimeCatalogs } = await load<{ runtimeCatalogs: Record<string, Catalog> }>(shellRequire.resolve("@neton/application-client-runtime/messages"));
const { consoleCatalogs } = await load<{ consoleCatalogs: Record<string, Catalog> }>(path.join(shellDir, "src/messages.ts"));
const { siteCatalogs } = await load<{ siteCatalogs: Record<string, Catalog> }>(path.join(shellDir, "src/site/messages.ts"));
for (const [ns, catalog] of Object.entries({ ...runtimeCatalogs, ...consoleCatalogs, ...siteCatalogs })) checkNamespace(ns, catalog);

// ---- 宿主源码不得硬编码中文（生成物除外） ----
for (const f of walk(path.join(shellDir, "src"))) {
  const rel = path.relative(shellDir, f);
  // 生成物与词条文件本身除外
  if (rel.startsWith("src/generated/") || rel === "src/messages.ts" || rel === "src/site/messages.ts") continue;
  if (rel.startsWith("src/app/(console)/") || rel.startsWith("src/app/(public)/(modules)/")) continue;
  for (const hit of hardcodedCjk(f)) errors.push(`[host] 硬编码文案 ${hit}`);
}

// ---- 模块语言包 ----
const modulesFile = path.resolve(shellDir, process.env.NETON_CLIENT_MODULES_FILE ?? "client.modules.ts");
const { default: packages } = await load<{ default: string[] }>(modulesFile);
for (const pkg of packages) {
  const manifestPath = shellRequire.resolve(`${pkg}/manifest`);
  const manifest = (await load<{ default: FrontModuleManifest }>(manifestPath)).default;
  const srcDir = path.dirname(manifestPath);
  // 整个模块源码（语言包与测试除外）：公开页、插槽、卡片之外，被它们 import 的视图、正文渲染、客户端岛同样不能硬编码
  const sources = walk(srcDir, new Set([...TEST_DIRS, "locales"])).filter((f) => f !== manifestPath);
  if (!manifest.locales?.length) {
    const count = sources.reduce((n, f) => n + hardcodedCjk(f).length, 0);
    warnings.push(`${manifest.id}: 尚未国际化（源码里 ${count} 行含中文）`);
    continue;
  }
  const catalog: Catalog = {};
  for (const l of manifest.locales) {
    const file = shellRequire.resolve(`${pkg}/locales/${l.entry}`);
    catalog[l.lang] = (await load<{ default: Record<string, string> }>(file)).default;
  }
  checkNamespace(manifest.id, catalog);
  for (const f of sources) for (const hit of hardcodedCjk(f)) errors.push(`[${manifest.id}] 已声明语言包，但源码仍有硬编码文案 ${hit}`);
  const consolePages = path.join(srcDir, "pages") + path.sep;
  // 只出现在控制台插槽里的插槽入口（控制台加载整份语言包）；同时贡献给门户插槽的（如「回复我的」红点）仍按公开岛检查
  const slotTargets = new Map<string, string[]>();
  for (const slot of manifest.slots ?? []) slotTargets.set(slot.entry, [...(slotTargets.get(slot.entry) ?? []), slot.target]);
  const consoleOnlySlots = new Set([...slotTargets].filter(([, targets]) => targets.every((t) => t.startsWith("console."))).map(([entry]) => entry));
  const isConsoleOnlySlot = (f: string) => {
    const rel = path.relative(path.join(srcDir, "slots"), f);
    return !rel.startsWith("..") && consoleOnlySlots.has(rel.replace(/\.tsx?$/, ""));
  };
  const reference = Object.values(catalog)[0] ?? {};
  for (const f of sources) {
    if (f.startsWith(consolePages) || isConsoleOnlySlot(f)) continue;
    for (const key of clientIslandKeys(f, manifest.id)) {
      const where = path.relative(srcDir, f);
      if (!PUBLIC_KEY.test(key)) errors.push(`[${manifest.id}] 公开页客户端岛用了非公开 key "${key}"（${where}）：改名为 public.* / error.*，公开页只预载这两类`);
      else if (!(key in reference)) errors.push(`[${manifest.id}] 客户端岛用到的 key "${key}" 不在语言包里（${where}）`);
    }
  }
}

for (const w of warnings) console.warn(`[locales] 待迁移 ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[locales] ${e}`);
  process.exit(1);
}
console.log(`[locales] ok — ${packages.length} module(s) checked`);
