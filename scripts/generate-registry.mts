/**
 * 构建期模块注册表生成（NETON_APPLICATION_FRONT_SPEC §5 / §10）。
 * 读 apps/console/client.modules.ts → 校验 manifest → 生成
 * apps/console/src/generated/modules.generated.ts（静态 import()，Next 可分析拆包）。
 * 任何校验失败即抛错中断构建。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FrontModuleManifest } from "@neton/application-client-contract";

const SHELL_CONTRACT_MAJOR = 1;

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/console");
// 模块包必须从 shell 的依赖上下文解析（workspace 链接挂在 shell 下，不在仓库根）。
const shellRequire = createRequire(path.join(shellDir, "package.json"));

const { default: packages } = (await import(
  pathToFileURL(path.join(shellDir, "client.modules.ts")).href
)) as { default: string[] };

interface Loaded { pkg: string; manifest: FrontModuleManifest; }
const loaded: Loaded[] = [];
for (const pkg of packages) {
  const manifestPath = shellRequire.resolve(`${pkg}/manifest`);
  const mod = await import(pathToFileURL(manifestPath).href);
  const manifest: FrontModuleManifest | undefined = mod.default ?? mod.manifest;
  if (!manifest) throw new Error(`[registry] ${pkg} 未从 ./manifest 导出默认 manifest`);
  loaded.push({ pkg, manifest });
}

// ---- 校验 ----
const ids = new Map<string, string>();
const pageKeys = new Map<string, string>();
const pagePaths = new Map<string, string>();
for (const { pkg, manifest } of loaded) {
  if (ids.has(manifest.id))
    throw new Error(`[registry] 重复模块 id "${manifest.id}"：${ids.get(manifest.id)} vs ${pkg}`);
  ids.set(manifest.id, pkg);
  const major = Number(String(manifest.contractVersion).split(".")[0]);
  if (major !== SHELL_CONTRACT_MAJOR)
    throw new Error(
      `[registry] ${pkg} contractVersion=${manifest.contractVersion} 与 shell contract major=${SHELL_CONTRACT_MAJOR} 不兼容`,
    );
  for (const p of manifest.pages) {
    if (pageKeys.has(p.key))
      throw new Error(`[registry] 重复 page key "${p.key}"：${pageKeys.get(p.key)} vs ${pkg}`);
    pageKeys.set(p.key, pkg);
    if (pagePaths.has(p.path))
      throw new Error(`[registry] 重复路由 "${p.path}"：${pagePaths.get(p.path)} vs ${pkg}`);
    pagePaths.set(p.path, pkg);
  }
}
for (const { pkg, manifest } of loaded)
  for (const r of manifest.requires ?? [])
    if (!ids.has(r)) throw new Error(`[registry] ${pkg} requires "${r}" 未安装`);

// ---- 语言包：模块 id 即命名空间，`<pkg>/locales/<entry>` 必须能解析 ----
const localeEntries: string[] = [];
for (const { pkg, manifest } of loaded) {
  if (!manifest.locales?.length) continue;
  const langs = manifest.locales.map((l) => {
    const spec = `${pkg}/locales/${l.entry}`;
    try {
      shellRequire.resolve(spec);
    } catch {
      throw new Error(`[registry] ${pkg} 声明了语言包 ${l.lang} → ${spec}，但解析不到（新增文件后需在仓库根 pnpm install）`);
    }
    return `    ${JSON.stringify(l.lang)}: () => import(${JSON.stringify(spec)}),`;
  });
  localeEntries.push(`  ${JSON.stringify(manifest.id)}: {\n${langs.join("\n")}\n  },`);
}

// ---- 生成 ----
const entries = loaded.flatMap(({ pkg, manifest }) =>
  manifest.pages.map((p) => `  ${JSON.stringify(p.key)}: () => import(${JSON.stringify(`${pkg}/pages/${p.entry}`)}),`),
);
const out = `/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改。 */
import type { FrontModuleManifest } from "@neton/application-client-contract";
import type { LocaleRegistry } from "@neton/application-client-runtime/i18n";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = ${JSON.stringify(
  loaded.map((l) => l.manifest),
  null,
  2,
)};

export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
${entries.join("\n")}
};

/** 模块语言包：命名空间（模块 id）→ 语言 → loader。随模块懒加载。 */
export const localeRegistry: LocaleRegistry = {
${localeEntries.join("\n")}
};
`;
const genDir = path.join(shellDir, "src/generated");
await mkdir(genDir, { recursive: true });
await writeFile(path.join(genDir, "modules.generated.ts"), out);
console.log(
  `[registry] ok — ${loaded.length} module(s), ${pageKeys.size} page(s) → src/generated/modules.generated.ts`,
);
