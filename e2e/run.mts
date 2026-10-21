/**
 * 底座的端到端测试（public-routes §15「底座自身的端到端覆盖」）：夹具模块 + 模拟后端 + 真实的
 * `next build && next start`。
 *
 *   pnpm e2e                 # 构建、启动、断言、清理
 *   E2E_KEEP=1 pnpm e2e      # 结束后不清理构建目录（排查用）
 *   E2E_SERVE=1 pnpm e2e     # 只构建并启动（模拟后端 + next start），不跑断言，Ctrl-C 结束
 *
 * 隔离：夹具经 NETON_CLIENT_MODULES_FILE / NETON_SITE_CONFIG_FILE / NETON_PUBLIC_ROUTES_FILE 选用，构建到独立的
 * `.next-e2e`；夹具模块在运行期间复制进 shell 的 node_modules，结束后删除，并按产品自己的配置重新生成注册表——
 * 产品（fork）的构建永远看不到夹具。端口随机；模拟后端在本进程内，测试可以直接改它的数据。
 *
 * 构建期**不连后端**（§1a）：构建时的后端地址指向一个只计数、一律 503 的「绊线」服务，断言构建期请求数为 0。
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startMockBackend, USER, type MockBackend } from "./mock-backend.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shell = path.join(root, "apps/console");
const fixtureModuleTarget = path.join(shell, "node_modules/@neton/application-client-e2e-fixture");
const DIST = ".next-e2e";
const SECRET = "e2e-revalidate-secret-0123456789abcdef";
const INDEXNOW_KEY = "e2e-indexnow-key-123";
const ORIGIN = "https://www.fixture.example";

const fixtureEnv = {
  NETON_CLIENT_MODULES_FILE: path.join(here, "fixture/client.modules.ts"),
  NETON_SITE_CONFIG_FILE: path.join(here, "fixture/site.config.ts"),
  NETON_PUBLIC_ROUTES_FILE: path.join(here, "fixture/public-routes.json"),
  NETON_NEXT_DIST_DIR: DIST,
  NEXT_TELEMETRY_DISABLED: "1",
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

function run(command: string, args: string[], env: Record<string, string>, cwd = shell): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

/** 构建期的后端：一律 503 并计数。构建若取数，计数非零（断言失败）。 */
async function tripwire(port: number) {
  const hits: string[] = [];
  const server = createHttpServer((req, res) => { hits.push(req.url ?? ""); res.writeHead(503); res.end(); });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { hits, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✔ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  ✖ ${name}\n      ${detail.split("\n").join("\n      ")}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [buildBackendPort, backendPort, webPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const BASE = `http://127.0.0.1:${webPort}`;
  let web: ChildProcess | undefined;
  let backend: MockBackend | undefined;
  // next build 会按 distDir 改写 next-env.d.ts（入库文件）：结束后原样写回
  const nextEnvFile = path.join(shell, "next-env.d.ts");
  const nextEnv = await readFile(nextEnvFile, "utf8");
  try {
    await rm(fixtureModuleTarget, { recursive: true, force: true });
    await mkdir(path.dirname(fixtureModuleTarget), { recursive: true });
    // 与 pnpm 的 `file:` 依赖一样以符号链接装入：样式扫描、转译、解析都要经得起符号链接（产品的模块都是这样装的）
    await symlink(path.join(here, "fixture-module"), fixtureModuleTarget, "dir");

    // ---- 构建：后端是绊线 ----
    console.log("[e2e] building the fixture site (backend unreachable by design)…");
    const wire = await tripwire(buildBackendPort);
    const buildBackend = `http://127.0.0.1:${buildBackendPort}`;
    try {
      await run("pnpm", ["run", "build"], { ...fixtureEnv, NETON_BACKEND_URL: buildBackend, NETON_BACKEND_INTERNAL_URL: buildBackend });
    } finally {
      await wire.close();
    }
    await check("hermetic build: next build makes no backend request", async () => {
      assert.deepEqual(wire.hits, [], `the build fetched: ${wire.hits.join(", ")}`);
    });
    // postbuild 已经卡过一次；这里再跑一遍让预算进结果清单（public-routes §10.6）
    await check("first-load JS within the bundle budget", async () => {
      await run("pnpm", ["run", "budget"], fixtureEnv, root);
    });

    await check("public routes reference no console pages (locale and page registries are separate files)", async () => {
      const manifest = path.join(shell, DIST, "server/app/(public)/(modules)/item/[id]/page_client-reference-manifest.js");
      const text = await readFile(manifest, "utf8");
      assert.doesNotMatch(text, /application-client-e2e-fixture[^"]*\/pages\//, "a console page leaked into a public route's client references");
    });

    // ---- 启动 ----
    backend = await startMockBackend({ port: backendPort, secret: SECRET });
    // 不以 IP 字面量绑定：Next 16 在 `-H 127.0.0.1` 时把 proxy 的 nextUrl 建成 localhost、路由层却按 127.0.0.1
    // 判断改写是否同源，`~q` 改写全部落空成 404（public-routes §2.3 部署约束）
    web = spawn("pnpm", ["exec", "next", "start", "-p", String(webPort), "-H", "0.0.0.0"], {
      cwd: shell,
      env: { ...process.env, ...fixtureEnv, NETON_BACKEND_URL: backend.url, NETON_BACKEND_INTERNAL_URL: backend.url, NETON_SITE_REVALIDATE_SECRET: SECRET, NETON_SITE_INDEXNOW_KEY: INDEXNOW_KEY },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const serverLog: string[] = [];
    web.stdout!.on("data", (d) => serverLog.push(String(d)));
    web.stderr!.on("data", (d) => serverLog.push(String(d)));
    for (let i = 0; i < 120; i += 1) {
      try { if ((await fetch(`${BASE}/robots.txt`)).ok) break; } catch { /* not yet */ }
      await sleep(250);
    }
    // 启动时的已删除台账同步（签名请求）完成
    for (let i = 0; i < 40 && !backend.goneRequests.length; i += 1) await sleep(250);
    await sleep(300);

    const get = (p: string, init?: RequestInit) => fetch(`${BASE}${p}`, { redirect: "manual", ...init });
    const html = async (p: string, init?: RequestInit) => { const r = await get(p, init); return { status: r.status, headers: r.headers, text: await r.text() }; };
    const backendHits = (p: string) => backend!.hits.get(p) ?? 0;

    if (process.env.E2E_SERVE) {
      // 排查用：只构建与启动，不跑断言；Ctrl-C 结束（照常清理）
      console.log(`[e2e] serving ${BASE} (backend ${backend.url}); Ctrl-C to stop`);
      web.stdout!.pipe(process.stdout);
      web.stderr!.pipe(process.stderr);
      await new Promise<void>((resolve) => process.once("SIGINT", () => resolve()));
      return;
    }
    console.log("[e2e] assertions");
    await suite({ BASE, get, html, backendHits, backend, serverLog });
  } finally {
    web?.kill("SIGTERM");
    await backend?.close();
    await rm(fixtureModuleTarget, { recursive: true, force: true });
    await writeFile(nextEnvFile, nextEnv);
    if (!process.env.E2E_KEEP) await rm(path.join(shell, DIST), { recursive: true, force: true });
    // 按产品自己的装配清单与站点配置重新生成注册表：生成物回到产品的样子
    await run("pnpm", ["run", "registry"], {}, root).catch((e) => console.error(`[e2e] restoring the registry failed: ${e}`));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[e2e] ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

interface Ctx {
  BASE: string;
  get(p: string, init?: RequestInit): Promise<Response>;
  html(p: string, init?: RequestInit): Promise<{ status: number; headers: Headers; text: string }>;
  backendHits(p: string): number;
  backend: MockBackend;
  serverLog: string[];
}

function revalidate(base: string, body: unknown, options: { secret?: string; t?: number; raw?: string } = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const t = options.t ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", options.secret ?? SECRET).update(`${t}.${raw}`).digest("hex");
  return fetch(`${base}/api/site/revalidate`, { method: "POST", headers: { "Content-Type": "application/json", "X-Neton-Signature": `t=${t},v1=${sig}` }, body: raw });
}

function jsonLdOf(text: string): Record<string, unknown>[] {
  return [...text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
}

function meta(text: string, name: string): string | null {
  const re = new RegExp(`<meta (?:name|property)="${name.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`);
  return re.exec(text)?.[1] ?? null;
}

async function suite(c: Ctx) {
  await check("route generation: the fixture's public routes are real files with ISR", async () => {
    const manifest = JSON.parse(await readFile(path.join(shell, DIST, "app-path-routes-manifest.json"), "utf8")) as Record<string, string>;
    const routes = Object.values(manifest);
    for (const r of ["/(public)/(modules)/item/[id]", "/(public)/(modules)/~q/[_q]", "/(public)/(modules)/list/~q/[_q]", "/(public)/(modules)/find"]) {
      assert.ok(Object.keys(manifest).some((k) => k.startsWith(r)), `missing ${r} in ${routes.join(", ")}`);
    }
    const baseline = JSON.parse(await readFile(path.join(here, "fixture/public-routes.json"), "utf8")) as { routes: Record<string, string> };
    assert.deepEqual(baseline.routes, { "fixture.find": "/find", "fixture.front": "/", "fixture.item": "/item/:id", "fixture.list": "/list" });
  });

  await check("home: first request is the complete page (200, SSR content, no App Shell)", async () => {
    const r = await c.html("/");
    assert.equal(r.status, 200);
    assert.match(r.text, /<h1>Fixture Site 首页<\/h1>/);
    for (let i = 6; i >= 2; i -= 1) assert.ok(r.text.includes(`Fixture item ${i}`), `card ${i} rendered on the server`);
    assert.match(r.headers.get("cache-control") ?? "", /s-maxage=30, stale-while-revalidate=3570/);
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal(r.headers.get("vary")?.toLowerCase().includes("cookie") ?? false, false);
  });

  await check("home: metadata, verification and site JSON-LD", async () => {
    const { text } = await c.html("/");
    assert.match(text, /<title>Fixture Site 首页<\/title>/);
    // Next 的元数据把根地址的尾斜杠去掉（`https://host` 与 `https://host/` 是同一个规范地址）
    assert.match(text, new RegExp(`<link rel="canonical" href="${ORIGIN}/?"`));
    assert.equal(meta(text, "google-site-verification"), "g-fixture");
    assert.equal(meta(text, "baidu-site-verification"), "b-fixture");
    assert.equal(meta(text, "msvalidate.01"), "m-fixture");
    assert.match(text, /<link rel="alternate" type="application\/rss\+xml"[^>]*href="https:\/\/www\.fixture\.example\/rss\.xml"/);
    const types = jsonLdOf(text).map((j) => j["@type"]);
    assert.deepEqual(types, ["WebSite", "Organization"]);
  });

  await check("cacheable HTML is byte-identical with and without cookies", async () => {
    for (const p of ["/", "/item/1", "/list", `/list?cursor=c4`]) {
      const anon = await c.html(p);
      const withCookie = await c.html(p, { headers: { cookie: `neton_client_session=${USER.token}; other=1` } });
      assert.equal(anon.status, 200, p);
      assert.equal(withCookie.text, anon.text, `${p} differs with a session cookie`);
      assert.equal(withCookie.headers.get("set-cookie"), null, p);
    }
  });

  await check("object page: SSR body, article metadata and JSON-LD, LCP image priority", async () => {
    const { status, text } = await c.html("/item/1");
    assert.equal(status, 200);
    assert.match(text, /<h1>Fixture item 1<\/h1>/);
    assert.match(text, /Body text of fixture item 1\./);
    assert.match(text, /<title>Fixture item 1 · Fixture Site<\/title>/);
    assert.equal(meta(text, "og:type"), "article");
    assert.equal(meta(text, "article:published_time"), "2026-10-01T08:00:00+08:00");
    assert.equal(meta(text, "article:modified_time"), "2026-10-10T08:00:00+08:00");
    assert.match(meta(text, "og:image") ?? "", /\/media\/1-og\.png/);
    assert.match(text, /<meta name="robots" content="index, follow, max-image-preview:large"/);
    const [article, crumbs] = jsonLdOf(text);
    assert.equal(article!["@type"], "NewsArticle");
    assert.equal(article!.mainEntityOfPage, `${ORIGIN}/item/1`);
    assert.equal(article!.dateModified, "2026-10-10T08:00:00+08:00");
    assert.equal(crumbs!["@type"], "BreadcrumbList");
    assert.match(text, /<link rel="preload" as="image"[^>]*fetchPriority="high"|<link rel="preload"[^>]*as="image"[^>]*fetchpriority="high"/i, "the LCP image is preloaded with high priority");
    const img = /<img [^>]*data-neton-media="file_1"[^>]*>/.exec(text)?.[0] ?? "";
    assert.match(img, /fetchPriority="high"|fetchpriority="high"/i);
    assert.match(img, /loading="eager"/);
    assert.match(img, /width="1200"/);
    assert.match(img, /height="800"/);
    assert.match(img, /srcSet="|srcset="/i);
  });

  await check("list images: one high-priority LCP image per page, the next cards eager, the rest lazy", async () => {
    const { text } = await c.html("/list?sort=old");
    const imgs = [...text.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    const high = imgs.filter((i) => /fetchpriority="high"/i.test(i));
    assert.equal(high.length, 1, "a second priority image is demoted");
    assert.match(high[0]!, /data-neton-media="file_1"/);
    assert.equal(imgs.indexOf(high[0]!), 0, "the first priority image (the hero) keeps the slot");
    // React 对不懒加载的图自己会给普通优先级的预加载提示；高优先级的预加载只能有一个
    assert.equal([...text.matchAll(/<link rel="preload"[^>]*fetchpriority="high"[^>]*>/gi)].length, 1, "only the LCP image is preloaded with high priority");
    const card = (id: string) => imgs.slice(1).find((i) => i.includes(`data-neton-media="file_${id}"`)) ?? "";
    assert.match(card("1"), /loading="eager"/, "the demoted first card stays eager");
    assert.match(card("2"), /loading="eager"/);
    assert.doesNotMatch(card("2"), /fetchpriority/i);
    assert.match(card("3"), /loading="lazy"/);
    // 列表直接挂在 h1 之下：卡片标题用列表给的 h2，不跳级；首页（缺省）是 h3
    assert.match(text, /<article data-testid="card"[^>]*>(?:<img[^>]*>)?<h2>/);
    assert.match((await c.html("/")).text, /<article data-testid="card"[^>]*>(?:<img[^>]*>)?<h3>/);
  });

  await check("status: unknown id 404, withdrawn 404 noindex, invalid param 404 without a backend call", async () => {
    const missing = await c.html("/item/999");
    assert.equal(missing.status, 404);
    assert.match(missing.text, /<meta name="robots" content="noindex/);
    const withdrawn = await c.html("/item/7");
    assert.equal(withdrawn.status, 404);
    assert.match(withdrawn.text, /<meta name="robots" content="noindex/);
    const before = c.backendHits("/app/fixture/item/abc");
    assert.equal((await c.get("/item/abc")).status, 404);
    assert.equal((await c.get("/item/0")).status, 404, "the build-time sentinel");
    assert.equal(c.backendHits("/app/fixture/item/abc"), before);
  });

  await check("410: ledger entries synced at startup answer 410 on the first visit; signed ledger requests", async () => {
    assert.ok(c.backend.goneRequests.length >= 1 && c.backend.goneRequests.every((r) => r.ok), "the gone ledger was requested with a valid signature");
    const r = await c.html("/item/9");
    assert.equal(r.status, 410);
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
    assert.match(r.text, /内容已删除/);
  });

  await check("410: a page that loads as gone answers 404 once, then 410", async () => {
    const first = await c.get("/item/8");
    assert.equal(first.status, 404);
    assert.equal((await c.get("/item/8")).status, 410);
    const gone = await (await c.get("/sitemaps/gone.txt")).text();
    assert.ok(gone.includes(`${ORIGIN}/item/8`) && gone.includes(`${ORIGIN}/item/9`), gone);
  });

  await check("redirects: data-driven 308 and legacy shapes 308 with the query kept", async () => {
    const moved = await c.get("/item/10");
    assert.equal(moved.status, 308);
    // Next 16.4 对页面里的 permanentRedirect 输出两行相同的 Location（浏览器只在取值不同时报错）；每一行都必须是目标
    for (const location of moved.headers.get("location")!.split(", ")) assert.equal(new URL(location, c.BASE).pathname, "/item/1");
    const legacy = await c.get("/old-item/3?utm_source=x");
    assert.equal(legacy.status, 308);
    assert.equal(new URL(legacy.headers.get("location")!, c.BASE).toString(), `${c.BASE}/item/3?utm_source=x`);
  });

  await check("~q normalization: order-insensitive, utm stripped, one cache entry, canonical keeps the whitelist", async () => {
    const a = await c.html("/list?sort=old&cursor=c3&utm_source=x");
    const b = await c.html("/list?cursor=c3&sort=old");
    assert.equal(a.status, 200);
    assert.equal(a.text, b.text);
    assert.match(a.text, /data-cursor="c3" data-sort="old"/);
    assert.match(a.text, new RegExp(`<link rel="canonical" href="${ORIGIN}/list\\?cursor=c3&amp;sort=old"`));
    assert.match(a.text, /<meta name="robots" content="noindex, follow"/, "paged lists are noindex");
    const first = await c.html("/list");
    assert.match(first.text, /<link rel="next" href="\/list\?cursor=c4"/);
    assert.equal((await c.get("/list?sort=bogus")).status, 404);
    assert.equal((await c.get("/list/~q/c29ydD1vbGQ")).status, 404, "the internal segment is not reachable from outside");
    assert.equal((await c.get("/~q/-")).status, 404);
  });

  await check("dynamic route: 200 + noindex, not cached", async () => {
    const r = await c.html("/find?q=item 2");
    assert.equal(r.status, 200);
    assert.match(r.text, /data-q="item 2"/);
    assert.match(r.text, /Fixture item 2/);
    assert.match(r.text, /<meta name="robots" content="noindex/);
    assert.match(r.headers.get("cache-control") ?? "", /no-store|private/);
  });

  await check("revalidate: signature, timestamp, schema, size and duplicate handling", async () => {
    const unsigned = await fetch(`${c.BASE}/api/site/revalidate`, { method: "POST", body: "{}" });
    assert.equal(unsigned.status, 401);
    assert.equal(((await unsigned.json()) as { message: string }).message, "SIGNATURE_INVALID");
    const wrongKey = await revalidate(c.BASE, { eventId: "e-wrong", items: [] }, { secret: "x".repeat(40) });
    assert.equal(wrongKey.status, 401);
    const stale = await revalidate(c.BASE, { eventId: "e-stale", items: [] }, { t: Math.floor(Date.now() / 1000) - 3600 });
    assert.equal(((await stale.json()) as { message: string }).message, "SIGNATURE_EXPIRED");
    const badTag = await revalidate(c.BASE, { eventId: "e-bad", items: [{ tag: "not a tag", mode: "refresh" }] });
    assert.equal(badTag.status, 400);
    const badBody = (await badTag.json()) as { code: number; message: string; errors: { field: string; code: string }[] };
    assert.equal(badBody.message, "REVALIDATE_INVALID");
    assert.deepEqual(badBody.errors.map((e) => e.code), ["INVALID_TAG"]);
    const tooMany = await revalidate(c.BASE, { eventId: "e-big", items: Array.from({ length: 501 }, (_, i) => ({ tag: `obj:fixture.item:${i}`, mode: "refresh" })) });
    assert.equal(((await tooMany.json()) as { message: string }).message, "REVALIDATE_TOO_LARGE");
    const reserved = await revalidate(c.BASE, { eventId: "e-res", gone: ["/api/x"] });
    assert.equal(reserved.status, 400);
    const okFirst = await revalidate(c.BASE, { eventId: "e-dup", items: [{ tag: "feed:fixture.item", mode: "refresh" }] });
    assert.deepEqual(await okFirst.json(), { code: 0, data: { applied: 1 } });
    const dup = await revalidate(c.BASE, { eventId: "e-dup", items: [{ tag: "feed:fixture.item", mode: "refresh" }] });
    assert.deepEqual(await dup.json(), { code: 0, data: { applied: 0, duplicate: true } });
  });

  await check("revalidate: expire takes a withdrawn object off its page and every list at once", async () => {
    assert.match((await c.html("/item/2")).text, /Fixture item 2/);
    assert.match((await c.html("/")).text, /Fixture item 2/);
    // 前面的 feed refresh 让首页处于「先给旧的、后台重渲染」状态：等后台重渲染落定再改数据，否则一次在改数据
    // 之前开始、在失效之后才写回的后台渲染会把旧列表重新写进缓存（SWR 的固有竞态，public-routes §8.4）
    await sleep(1500);
    c.backend.items.get("2")!.status = "unavailable";
    assert.equal((await c.get("/item/2")).status, 200, "still cached before the event");
    const r = await revalidate(c.BASE, { eventId: "e-withdraw-2", items: [{ tag: "obj:fixture.item:2", mode: "expire" }] });
    assert.equal(r.status, 200);
    assert.equal((await c.get("/item/2")).status, 404, "expire: the very next request re-renders");
    const cardIds = (text: string) => [...text.matchAll(/data-testid="card" data-id="(\d+)"/g)].map((m) => m[1]);
    const home = await c.html("/");
    assert.deepEqual(cardIds(home.text), ["6", "5", "4", "3", "1"], "lists carrying obj:fixture.item:2 were expired too");
  });

  await check("revalidate: refresh shows an edited title (stale once, then fresh)", async () => {
    assert.match((await c.html("/item/3")).text, /Fixture item 3/);
    c.backend.items.get("3")!.title = "Edited title 3";
    assert.match((await c.html("/item/3")).text, /Fixture item 3/, "still cached before the event");
    await revalidate(c.BASE, { eventId: "e-edit-3", items: [{ tag: "obj:fixture.item:3", mode: "refresh" }] });
    let fresh = false;
    for (let i = 0; i < 20 && !fresh; i += 1) {
      fresh = /Edited title 3/.test((await c.html("/item/3")).text);
      if (!fresh) await sleep(250);
    }
    assert.ok(fresh, "the edited title appears within seconds");
  });

  await check("revalidate: gone / revived paths drive the 410 set", async () => {
    await revalidate(c.BASE, { eventId: "e-gone-4", gone: ["/item/4"] });
    assert.equal((await c.get("/item/4")).status, 410);
    await revalidate(c.BASE, { eventId: "e-revive-4", revived: ["/item/4"] });
    assert.equal((await c.get("/item/4")).status, 200);
  });

  await check("cache: a second request is served from the cache without a backend call", async () => {
    await c.get("/item/5");
    const before = c.backendHits("/app/fixture/item/5");
    await c.get("/item/5");
    await c.get("/item/5");
    assert.equal(c.backendHits("/app/fixture/item/5"), before);
  });

  await check("robots.txt, sitemap index, shard, news, RSS and the IndexNow key", async () => {
    const robots = await (await c.get("/robots.txt")).text();
    for (const line of ["Disallow: /my/", "Disallow: /my$", "Disallow: /api/", "Disallow: /login", "Disallow: /find", `Sitemap: ${ORIGIN}/sitemap.xml`]) assert.ok(robots.includes(line), `robots.txt lacks ${line}`);
    const index = await c.get("/sitemap.xml");
    assert.equal(index.status, 200);
    const indexXml = await index.text();
    assert.ok(indexXml.includes(`<loc>${ORIGIN}/sitemaps/fixture.all.xml</loc>`) && indexXml.includes(`<loc>${ORIGIN}/sitemaps/news.xml</loc>`), indexXml);
    const shard = await (await c.get("/sitemaps/fixture.all.xml")).text();
    assert.ok(shard.includes(`<loc>${ORIGIN}/item/1</loc>`), shard);
    assert.ok(!shard.includes("/item/7") && !shard.includes("/item/9"), "only published items are listed");
    assert.equal((await c.get("/sitemaps/fixture.nope.xml")).status, 404);
    const news = await (await c.get("/sitemaps/news.xml")).text();
    assert.match(news, /<news:publication><news:name>Fixture Site<\/news:name><news:language>zh<\/news:language>/);
    const rss = await c.get("/rss.xml");
    assert.match(rss.headers.get("content-type") ?? "", /application\/rss\+xml/);
    const rssXml = await rss.text();
    assert.match(rssXml, new RegExp(`<atom:link href="${ORIGIN}/rss.xml" rel="self"`));
    assert.ok(rssXml.includes(`<link>${ORIGIN}/item/1</link>`));
    assert.match(await (await c.get("/list/rss.xml")).text(), new RegExp(`<atom:link href="${ORIGIN}/list/rss.xml"`));
    assert.match(await (await c.get("/item/1/rss.xml")).text(), new RegExp(`<atom:link href="${ORIGIN}/item/1/rss.xml"`));
    assert.equal((await c.get("/item/abc/rss.xml")).status, 404, "feed parameters are validated");
    assert.equal(await (await c.get("/indexnow-key.txt")).text(), INDEXNOW_KEY);
  });

  await check("site-level 404 and the console guard", async () => {
    const unknown = await c.html("/no/such/page");
    assert.equal(unknown.status, 404);
    assert.match(unknown.text, /<meta name="robots" content="noindex/);
    const guarded = await c.get("/my/account/profile?tab=2");
    assert.equal(guarded.status, 307);
    assert.equal(new URL(guarded.headers.get("location")!, c.BASE).toString(), `${c.BASE}/login?next=%2Fmy%2Faccount%2Fprofile%3Ftab%3D2`);
  });

  await check("public CSS: the portal loads one small stylesheet, never the console's", async () => {
    const { text } = await c.html("/item/1");
    const sheets = [...text.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]!);
    assert.equal(sheets.length, 1, `stylesheets: ${sheets.join(", ")}`);
    const css = await (await c.get(sheets[0]!)).text();
    assert.ok(css.length < 40_000, `portal CSS is ${css.length} bytes`);
    assert.ok(!css.includes("admin-filter-grid") && !css.includes("front-page-enter"), "console rules leaked into the portal stylesheet");
    assert.ok(css.includes("--fixture-public-view"), "a module's public component outside public/cards/slots lost its utility classes");
    assert.ok(!css.includes("--fixture-console-page"), "a module's console page leaked utility classes into the portal stylesheet");
    assert.doesNotMatch(text, /fonts\.googleapis|\.woff2?/, "no web fonts");
    const login = await c.html("/login");
    const loginSheets = [...login.text.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]!);
    const loginCss = (await Promise.all(loginSheets.map(async (s) => (await c.get(s)).text()))).join("");
    assert.ok(loginCss.includes("admin-filter-grid"), "the console stylesheet still serves the auth pages");
  });

  // ---- 浏览器：登录跳回与图片兜底 ----
  const browser = await chromium.launch();
  try {
    const login = async (next: string) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${c.BASE}/login?next=${next}`);
      await page.fill("#username", USER.username);
      await page.fill("#password", USER.password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 }), page.click('button[type="submit"]')]);
      const url = new URL(page.url());
      await context.close();
      return `${url.pathname}${url.search}${url.hash}`;
    };
    await check("login: next goes back to the portal page", async () => {
      assert.equal(await login(encodeURIComponent("/item/1#comments")), "/item/1#comments");
    });
    await check("login: open-redirect attempts fall back to the console home", async () => {
      for (const evil of ["//evil.example/x", "/\\evil.example", "%2F%2Fevil.example", encodeURIComponent("/%2F/evil.example"), "https://evil.example", "/api/session"]) {
        assert.equal(await login(encodeURIComponent(evil)), "/my", `next=${evil}`);
      }
    });
    await check("media refresh: an expired image is re-fetched once through the refresh endpoint", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      // 让第 1 条的图片「过期」：浏览器拿到 403，兜底脚本换取新地址
      await page.route("**/media/1-*", (route) => route.fulfill({ status: 403, body: "" }));
      await page.goto(`${c.BASE}/item/1`);
      await page.waitForFunction(() => {
        const img = document.querySelector('img[data-neton-media="file_1"]') as HTMLImageElement | null;
        return Boolean(img && img.src.includes("1-fresh.png") && !img.hasAttribute("srcset"));
      }, undefined, { timeout: 10_000 });
      assert.deepEqual(c.backend.refreshed.filter((f) => f === "file_1").length, 1);
      await context.close();
    });
  } finally {
    await browser.close();
  }

  await check("no server errors were logged", async () => {
    const errors = c.serverLog.join("").split("\n").filter((l) => /\b(Error|TypeError|unhandled)\b/.test(l) && !l.includes("site.media.policy"));
    assert.deepEqual(errors, []);
  });
}

await main();
