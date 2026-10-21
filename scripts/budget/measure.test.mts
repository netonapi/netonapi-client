import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { evaluate, measure, routeOf } from "./measure.mts";

/** 假的构建产物：块的「gzip 体积」直接按文件内容长度算，方便断言。 */
function dist(pages: Record<string, Record<string, string[]>>, chunks: Record<string, number>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "budget-"));
  writeFileSync(path.join(dir, "build-manifest.json"), JSON.stringify({ rootMainFiles: ["static/chunks/fw.js"], polyfillFiles: ["static/chunks/poly.js"] }));
  mkdirSync(path.join(dir, "static/chunks"), { recursive: true });
  for (const [name, size] of Object.entries(chunks)) writeFileSync(path.join(dir, "static/chunks", name), "x".repeat(size));
  for (const [page, entryJSFiles] of Object.entries(pages)) {
    const file = path.join(dir, "server/app", page.replace(/\/page$/, ""), "page_client-reference-manifest.js");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(page)}]=${JSON.stringify({ entryJSFiles, entryCSSFiles: {} })};`);
  }
  return dir;
}

const bySize = (file: string) => readFileSync(file).length;

test("route paths drop route groups", () => {
  assert.equal(routeOf("/(public)/(modules)/item/[id]"), "/item/[id]");
  assert.equal(routeOf("/(public)/(site)"), "/");
  assert.equal(routeOf("/(public)/(site)/~q/[_q]"), "/", "the home page only exists as its query variant");
  assert.equal(routeOf("/(public)/(modules)/hot/~q/[_q]"), "/hot");
});

test("route JS is the union of its entries minus the framework chunks", () => {
  const dir = dist(
    {
      "/(public)/(modules)/item/[id]/page": { "[project]/app/layout": ["static/chunks/fw.js", "static/chunks/root.js"], "[project]/app/(public)/(modules)/item/[id]/page": ["static/chunks/root.js", "static/chunks/item.js", "static/chunks/item.css"] },
      "/(console)/my/page": { "[project]/app/layout": ["static/chunks/root.js"], "[project]/app/(console)/my/page": ["static/chunks/console.js"] },
      "/_not-found/page": { "[project]/app/layout": ["static/chunks/root.js"] },
    },
    { "fw.js": 1024 * 100, "root.js": 1024 * 3, "item.js": 1024 * 2, "console.js": 1024 * 40, "poly.js": 1024 * 50 },
  );
  const m = measure(dir, bySize);
  assert.equal(m.shared.bytes, 1024 * 100, "polyfills (nomodule) are not counted");
  assert.deepEqual(m.routes.map((r) => [r.route, r.public, r.chunks, r.ownBytes]), [
    ["/item/[id]", true, ["static/chunks/item.js", "static/chunks/root.js"], 1024 * 5],
    ["/my", false, ["static/chunks/console.js", "static/chunks/root.js"], 1024 * 43],
  ]);

  const ok = evaluate(m, { shared: 110, public: 6 });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows.map((r) => [r.route, r.budget, r.total]), [["/item/[id]", 6, 105], ["/my", null, 143]], "console routes are reported, not budgeted, unless listed");

  const over = evaluate(m, { shared: 99, public: 4, routes: { "/my": 30, "/gone": 10 } });
  assert.equal(over.errors.length, 4);
  assert.match(over.errors.join("\n"), /框架底数 100\.0 KB 超出上限 99 KB/);
  assert.match(over.errors.join("\n"), /\/item\/\[id\] 自身 JS 5\.0 KB 超出预算 4 KB/);
  assert.match(over.errors.join("\n"), /\/my 自身 JS 43\.0 KB 超出预算 30 KB/);
  assert.match(over.errors.join("\n"), /预算里的路由 \/gone 不在构建产物里/);
});
