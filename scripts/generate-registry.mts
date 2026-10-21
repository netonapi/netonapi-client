/**
 * 构建期注册表生成（NETON_APPLICATION_FRONT_SPEC §5 / §10；公开路由 public-routes §4、§14）。
 *
 * 读 apps/console/client.modules.ts（装配清单）与 apps/console/site.config.ts（站点配置）→ 校验 →
 * 生成：
 * - src/generated/*：模块注册表、站点配置、proxy 数据、公开路由注册表（不入库）
 * - src/generated/public-routes.json：公开路由的 URL 形态清单（**入库**，URL 形态回归检查的基线）
 * - src/app/(console)/<consoleBasePath>/…：控制台路由文件（不入库）
 * - src/app/(public)/(modules)/…、(site)/…：公开路由与 fork 页面的真实路由文件（不入库）
 * 任何校验失败即以非零码退出，构建中断。
 *
 * - src/generated/next.generated.json：next.config 读的构建参数（要转译的模块包）——next.config 不再自己
 *   import 装配清单，换一份清单（夹具）时两边天然一致
 * - src/generated/public-sources.css：门户样式表要扫描的模块源码目录（src/site/public.css 导入）。按模块包的
 *   **真实路径**写：pnpm 的 `file:` 依赖在 node_modules 里是符号链接，Tailwind 的 `@source` glob 不跟随
 *   符号链接，写成 `node_modules/@neton/*\/src` 会静默漏掉模块的全部工具类
 *
 * 环境变量：NETON_SITE_ORIGIN 覆盖 origin；NETON_CLIENT_MODULES_FILE / NETON_SITE_CONFIG_FILE /
 * NETON_PUBLIC_ROUTES_FILE 换一份装配清单 / 站点配置 / URL 形态基线（底座的端到端测试用夹具，e2e/run.mts；
 * 夹具有自己的基线，不碰产品入库的 src/generated/public-routes.json）。
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrontModuleManifest, SiteConfig } from "@neton/application-client-contract";
import { resolveSite } from "@neton/application-client-runtime/public";
import { plan, type LoadedModule } from "./registry/plan.mts";
import { scanForbiddenImports } from "./registry/scan.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/console");
// 模块包必须从 shell 的依赖上下文解析（workspace 链接挂在 shell 下，不在仓库根）。
const shellRequire = createRequire(path.join(shellDir, "package.json"));

function die(messages: string[]): never {
  for (const m of messages) console.error(m);
  console.error(`[registry] failed with ${messages.length} error(s)`);
  process.exit(1);
}

const modulesFile = path.resolve(shellDir, process.env.NETON_CLIENT_MODULES_FILE ?? "client.modules.ts");
const siteFile = path.resolve(shellDir, process.env.NETON_SITE_CONFIG_FILE ?? "site.config.ts");

const { default: packages } = (await import(pathToFileURL(modulesFile).href)) as { default: string[] };
const { default: siteConfig } = (await import(pathToFileURL(siteFile).href)) as { default: SiteConfig };

let site;
try {
  site = resolveSite(siteConfig, process.env);
} catch (e) {
  die([(e as Error).message]);
}

const modules: LoadedModule[] = [];
/** 模块源码目录（manifest 所在目录，真实路径），给门户样式表的 `@source` 用。 */
const moduleSourceDirs: string[] = [];
for (const pkg of packages) {
  const manifestPath = shellRequire.resolve(`${pkg}/manifest`);
  moduleSourceDirs.push(path.dirname(realpathSync(manifestPath)));
  const mod = await import(pathToFileURL(manifestPath).href);
  const manifest: FrontModuleManifest | undefined = mod.default ?? mod.manifest;
  if (!manifest) die([`[registry] ${pkg} does not export a default manifest from ./manifest`]);
  modules.push({ pkg, manifest });
}

const resolved = new Map<string, string | null>();
function resolveSpecifier(specifier: string): string | null {
  if (!resolved.has(specifier)) {
    try { resolved.set(specifier, shellRequire.resolve(specifier)); } catch { resolved.set(specifier, null); }
  }
  return resolved.get(specifier)!;
}

const sitePagesDir = path.join(shellDir, "src/site/pages");
const sitePageEntries = existsSync(sitePagesDir)
  ? readdirSync(sitePagesDir).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""))
  : [];

const routesJsonPath = path.resolve(shellDir, process.env.NETON_PUBLIC_ROUTES_FILE ?? "src/generated/public-routes.json");
const previousRoutes = existsSync(routesJsonPath)
  ? (JSON.parse(await readFile(routesJsonPath, "utf8")) as { routes: Record<string, string> }).routes
  : null;

// 410 页的文案取宿主 `site` 命名空间（站点语言，缺失回退 zh-CN）
const { siteCatalogs } = (await import(pathToFileURL(path.join(shellDir, "src/site/messages.ts")).href)) as { siteCatalogs: Record<string, Record<string, Record<string, string>>> };
const siteMessages = { ...siteCatalogs.site?.["zh-CN"], ...siteCatalogs.site?.[site.locale] };
const goneTexts = { title: siteMessages["status.gone.title"] ?? "410", body: siteMessages["status.gone.body"] ?? "", home: siteMessages["status.home"] ?? "/" };

const result = plan({ modules, site, sitePageEntries, previousRoutes, goneTexts, resolvable: (s) => resolveSpecifier(s) !== null });
if (result.errors.length) die(result.errors);

// ---- 禁止 import 扫描（§5）：服务端入口及其相对 import ----
const serverEntries: string[] = [];
for (const route of result.routes) {
  if (route.group === "(site)") {
    const file = path.join(sitePagesDir, `${route.importFrom.replace("@/site/pages/", "")}.tsx`);
    serverEntries.push(file);
  } else {
    serverEntries.push(resolveSpecifier(route.importFrom)!);
  }
}
for (const { pkg, manifest } of modules) {
  for (const slot of manifest.slots ?? []) if (slot.rendering === "server") serverEntries.push(resolveSpecifier(`${pkg}/slots/${slot.entry}`)!);
  for (const card of manifest.cardRenderers ?? []) serverEntries.push(resolveSpecifier(`${pkg}/cards/${card.entry}`)!);
  for (const s of manifest.sitemaps ?? []) serverEntries.push(resolveSpecifier(`${pkg}/sitemaps/${s.entry}`)!);
  for (const f of manifest.feeds ?? []) serverEntries.push(resolveSpecifier(`${pkg}/feeds/${f.entry}`)!);
}
// fork 的门户外壳也渲染在每个公开页里：同样不能碰请求身份
for (const file of ["src/site/portal-shell.tsx"]) if (existsSync(path.join(shellDir, file))) serverEntries.push(path.join(shellDir, file));
const forbidden = scanForbiddenImports(serverEntries, { aliasRoot: path.join(shellDir, "src") });
if (forbidden.length) {
  die(forbidden.map((f) => `[registry] cacheable public code must not use ${f.rule}: ${path.relative(shellDir, f.file)}:${f.line}  ${f.text}`));
}

// ---- 写文件：先清掉上次生成的路由目录（形态变了旧文件不能留着） ----
const generatedRouteRoots = ["src/app/(console)", "src/app/(public)/(modules)", "src/app/(public)/(site)"];
for (const dir of generatedRouteRoots) await rm(path.join(shellDir, dir), { recursive: true, force: true });
for (const [file, content] of Object.entries(result.files)) {
  const target = path.join(shellDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
await mkdir(path.dirname(routesJsonPath), { recursive: true });
await writeFile(routesJsonPath, `${JSON.stringify({ version: 1, routes: result.routesJson }, null, 2)}\n`);
await writeFile(path.join(shellDir, "src/generated/next.generated.json"), `${JSON.stringify({ transpilePackages: packages }, null, 2)}\n`);

const pageCount = modules.reduce((n, m) => n + m.manifest.pages.length, 0);
console.log(
  `[registry] ok — ${modules.length} module(s), ${pageCount} console page(s) under ${site.consoleBasePath || "/"}, ${result.routes.length} public route(s)`,
);

// 门户样式表扫描的模块源码：整个 src，除了控制台页面（src/pages，只在控制台出现）、测试与语言包
const generatedDir = path.join(shellDir, "src/generated");
const sourceLines = moduleSourceDirs.flatMap((dir) => {
  const rel = path.relative(generatedDir, dir).split(path.sep).join("/");
  return [`@source "${rel}";`, `@source not "${rel}/pages";`, `@source not "${rel}/__tests__";`, `@source not "${rel}/**/*.test.*";`, `@source not "${rel}/locales";`];
});
await writeFile(
  path.join(generatedDir, "public-sources.css"),
  `/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改，不入库。门户样式表扫描的模块源码目录（真实路径）。 */\n${sourceLines.join("\n")}\n`,
);
