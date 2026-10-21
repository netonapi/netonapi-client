/**
 * 首屏 JS 预算检查（public-routes §10.6）。在 `next build` 之后跑（console 的 postbuild），超出即非零退出。
 *
 * 读 apps/console/bundle-budget.ts（产品 fork 可改）与构建产物目录（NETON_NEXT_DIST_DIR，缺省 .next）。
 * 环境变量 NETON_BUNDLE_BUDGET_FILE 换一份预算。
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluate, measure, report, type BundleBudget } from "./budget/measure.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const shellDir = path.resolve(here, "../apps/console");
const budgetFile = path.resolve(shellDir, process.env.NETON_BUNDLE_BUDGET_FILE ?? "bundle-budget.ts");
const distDir = path.resolve(shellDir, process.env.NETON_NEXT_DIST_DIR || ".next");

const { default: budget } = (await import(pathToFileURL(budgetFile).href)) as { default: BundleBudget };
const verdict = evaluate(measure(distDir), budget);
console.log(`[budget] first-load JS, gzip (${path.relative(shellDir, distDir)})\n${report(verdict)}`);
if (verdict.errors.length) {
  for (const e of verdict.errors) console.error(`[budget] ${e}`);
  process.exit(1);
}
console.log("[budget] ok");
