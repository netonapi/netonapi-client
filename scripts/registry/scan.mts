/**
 * 可缓存的公开渲染代码不得碰请求身份（public-routes §5「构建期检查」）。
 *
 * 从每个服务端入口（模块的 public / cards / sitemaps / feeds 与 rendering = "server" 的插槽，
 * fork 的 src/site/pages）出发，沿相对 import 与 `@/` 别名递归扫描源码；遇到 `"use client"` 文件
 * 停下——客户端岛在浏览器里跑，读不到服务端的 Cookie 与请求头，它们按自己的方式取个性化数据。
 *
 * 出现以下任何一项即构建失败：
 * - `next/headers`（cookies() / headers() / draftMode()）
 * - `@neton/application-client-runtime/server`（会话与带 Cookie 的后端调用）
 * - `apiFetch` / `apiWrite`（浏览器侧带会话的代理调用）
 * - `connection()`（把整页变成逐请求渲染）
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface ForbiddenUse { file: string; line: number; rule: string; text: string }

const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: "next/headers (cookies, headers, draftMode)", pattern: /from\s+["']next\/headers["']|import\(\s*["']next\/headers["']\s*\)|require\(\s*["']next\/headers["']\s*\)/ },
  { rule: "@neton/application-client-runtime/server (session)", pattern: /["']@neton\/application-client-runtime\/server["']/ },
  { rule: "apiFetch / apiWrite (session-bound browser proxy)", pattern: /\bapi(Fetch|Write|WriteResult)\s*[(<]/ },
  { rule: "connection() (per-request rendering)", pattern: /\bconnection\s*\(\s*\)/ },
];

const EXTENSIONS = [".tsx", ".ts", ".mts", ".jsx", ".js", ".mjs"];
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
}

function isClientModule(source: string): boolean {
  const head = source.replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*/g, "").trimStart();
  return head.startsWith('"use client"') || head.startsWith("'use client'");
}

/** 去掉注释与字符串字面量里的内容，避免文档注释里提到 `cookies()` 被误报。保留行号。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
}

export function scanForbiddenImports(entries: readonly string[], options: { aliasRoot?: string } = {}): ForbiddenUse[] {
  const found: ForbiddenUse[] = [];
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    if (isClientModule(source)) continue;
    const code = stripComments(source);
    code.split("\n").forEach((line, i) => {
      for (const { rule, pattern } of RULES) {
        if (pattern.test(line)) found.push({ file, line: i + 1, rule, text: line.trim() });
      }
    });
    for (const match of code.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2];
      if (!spec) continue;
      let target: string | null = null;
      if (spec.startsWith("./") || spec.startsWith("../")) target = resolveFile(path.resolve(path.dirname(file), spec));
      else if (spec.startsWith("@/") && options.aliasRoot) target = resolveFile(path.join(options.aliasRoot, spec.slice(2)));
      if (target && !target.includes(`${path.sep}node_modules${path.sep}`)) queue.push(target);
    }
  }
  return found;
}
