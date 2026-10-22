/**
 * 端到端测试的模拟后端（e2e/run.mts 在进程内启动）。只实现夹具与底座用到的接口，数据确定、可由测试改写：
 *
 * - `/admin/system/site/public`：站点品牌（匿名）
 * - `/app/fixture/items|item/{id}|search`：夹具模块的数据；机器码 FIXTURE_NOT_FOUND / FIXTURE_UNAVAILABLE / FIXTURE_GONE
 * - `/app/infra/media/policy`、`/app/infra/media/url/{fileId}`：媒体地址策略与兜底刷新（infra-media §7.3）
 * - `/platform/site/gone`：已删除台账（site-module §6），**按共享密钥校验签名**——与网页服务的同步客户端互通
 * - `/app/auth/login-username`、`/app/member/user/get`：账密登录与会话校验
 * - `POST /app/fixture/state`：访问者状态（需要登录，奇数 id 为 true），每次调用的 id 列表记在 `stateCalls`
 * - `/media/{name}`：图片字节（PNG），供浏览器与 Lighthouse 真实加载
 *
 * 每个路径的请求数记在 `hits`，测试据此确认「缓存命中时不打后端」。`POST /__control/item/{id}`（JSON：title / status）
 * 改一条数据，供 E2E_SERVE 模式手工排查。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { deflateSync } from "node:zlib";

export interface MockItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string;
  updatedAt?: string | null;
  status: "published" | "unavailable" | "gone" | "redirect";
  redirectTo?: string;
  author?: string;
  withCover?: boolean;
}

export const USER = { username: "alice", password: "correct-horse", token: "tok-alice", id: 42 };

/** 一张纯色 PNG（宽高按需），供图片请求返回真实字节。 */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function initialItems(): Map<string, MockItem> {
  const items = new Map<string, MockItem>();
  for (let i = 1; i <= 6; i += 1) {
    items.set(String(i), {
      id: String(i),
      title: `Fixture item ${i}`,
      summary: `Summary of item ${i}`,
      body: `Body text of fixture item ${i}.`,
      publishedAt: `2026-10-0${i}T08:00:00+08:00`,
      updatedAt: i === 1 ? "2026-10-10T08:00:00+08:00" : null,
      status: "published",
      author: i === 1 ? "Author One" : undefined,
      withCover: i <= 3,
    });
  }
  items.set("7", { id: "7", title: "Withdrawn", summary: "", body: "", publishedAt: "2026-09-01T08:00:00+08:00", status: "unavailable" });
  items.set("8", { id: "8", title: "Deleted", summary: "", body: "", publishedAt: "2026-09-01T08:00:00+08:00", status: "gone" });
  items.set("9", { id: "9", title: "Deleted earlier", summary: "", body: "", publishedAt: "2026-09-01T08:00:00+08:00", status: "gone" });
  items.set("10", { id: "10", title: "Moved", summary: "", body: "", publishedAt: "2026-09-01T08:00:00+08:00", status: "redirect", redirectTo: "/item/1" });
  return items;
}

export interface MockBackend {
  url: string;
  items: Map<string, MockItem>;
  /** 已删除台账（url → goneAt） */
  ledger: Map<string, number>;
  hits: Map<string, number>;
  /** 收到的已删除台账请求的签名校验结果 */
  goneRequests: { ok: boolean; query: string }[];
  /** 媒体兜底刷新接口被调用的 fileId */
  refreshed: string[];
  /** `POST /app/fixture/state`（访问者状态，§9.4）每次调用带的 id 列表 */
  stateCalls: string[][];
  /** 收到的「失效目标就绪」信号（site-module §6.0）的签名校验结果与请求体 */
  readySignals: { ok: boolean; body: string }[];
  close(): Promise<void>;
}

function verify(header: string | undefined, payload: string, secret: string): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(`${m[1]}.${payload}`).digest();
  const actual = Buffer.from(m[2]!, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) && Math.abs(Date.now() / 1000 - Number(m[1])) <= 300;
}

export async function startMockBackend(options: { port: number; secret: string }): Promise<MockBackend> {
  const items = initialItems();
  const ledger = new Map<string, number>([["/item/9", Date.parse("2026-09-02T00:00:00Z")]]);
  const hits = new Map<string, number>();
  const goneRequests: MockBackend["goneRequests"] = [];
  const refreshed: string[] = [];
  const stateCalls: string[][] = [];
  const readySignals: MockBackend["readySignals"] = [];
  const base = `http://127.0.0.1:${options.port}`;
  const images = new Map<string, Buffer>();

  const media = (id: string) => {
    const variants = Object.fromEntries([180, 360, 720, 1080, 1440].map((w) => [`w${w}`, `${base}/media/${id}-w${w}.png?bucket=1`]));
    return { fileId: `file_${id}`, url: `${base}/media/${id}.png?bucket=1`, mimeType: "image/png", width: 1200, height: 800, variants: { ...variants, og: `${base}/media/${id}-og.png?bucket=1` } };
  };
  const published = () => [...items.values()].filter((i) => i.status === "published").sort((a, b) => Number(b.id) - Number(a.id));
  const card = (i: MockItem) => ({
    ref: { type: "fixture.item", id: i.id },
    summary: { ref: { type: "fixture.item", id: i.id }, exists: true, visible: true, title: i.title, summary: i.summary, link: { web: `https://www.fixture.example/item/${i.id}` } },
    view: { id: i.id, title: i.title, summary: i.summary, publishedAt: i.publishedAt, cover: i.withCover ? media(i.id) : null },
  });

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  const ok = (res: ServerResponse, data: unknown) => send(res, 200, { code: 0, message: "ok", data });
  const fail = (res: ServerResponse, status: number, code: number, message: string) => send(res, status, { code, message });

  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { return {}; }
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", base);
    const path = url.pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);

    const control = /^\/__control\/item\/(\d+)$/.exec(path);
    if (control && req.method === "POST") {
      const item = items.get(control[1]!);
      if (!item) return fail(res, 404, 404, "FIXTURE_NOT_FOUND");
      Object.assign(item, await body(req));
      return ok(res, item);
    }
    if (path === "/admin/system/site/public") return ok(res, { name: "Fixture Site", tagline: "Fixture tagline" });
    if (path === "/app/infra/media/policy") return ok(res, { strategy: "hmac", validitySeconds: 3600, bucketSeconds: 1800, imageParams: "none" });
    if (path.startsWith("/app/infra/media/url/")) {
      const fileId = decodeURIComponent(path.slice("/app/infra/media/url/".length));
      refreshed.push(fileId);
      const m = /^file_(\d+)$/.exec(fileId);
      if (!m) return fail(res, 404, 404, "FILE_NOT_FOUND");
      return ok(res, { url: `${base}/media/${m[1]}-fresh.png?bucket=2`, expiresAt: null });
    }
    if (path.startsWith("/media/")) {
      // `expired` 模拟签名过期（CDN 403），供图片兜底刷新的测试
      if (url.searchParams.get("expired") === "1") { res.writeHead(403); res.end(); return; }
      const key = path.includes("-og") ? "og" : "std";
      const bytes = images.get(key) ?? png(key === "og" ? 240 : 180, key === "og" ? 135 : 120);
      images.set(key, bytes);
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
      res.end(bytes);
      return;
    }

    if (path === "/app/fixture/items") {
      const sorted = url.searchParams.get("sort") === "old" ? published().reverse() : published();
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const cursor = url.searchParams.get("cursor");
      const start = cursor ? sorted.findIndex((i) => `c${i.id}` === cursor) + 1 : 0;
      if (cursor && start === 0) return fail(res, 400, 400, "INVALID_CURSOR");
      const slice = sorted.slice(start, start + limit);
      const more = start + limit < sorted.length;
      return ok(res, { list: slice.map(card), nextCursor: more ? `c${slice.at(-1)!.id}` : null });
    }
    if (path === "/app/fixture/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return ok(res, { list: published().filter((i) => i.title.toLowerCase().includes(q)).map(card), nextCursor: null });
    }
    const itemMatch = /^\/app\/fixture\/item\/(\d+)$/.exec(path);
    if (itemMatch) {
      const item = items.get(itemMatch[1]!);
      if (!item) return fail(res, 404, 404, "FIXTURE_NOT_FOUND");
      if (item.status === "unavailable") return fail(res, 404, 404, "FIXTURE_UNAVAILABLE");
      if (item.status === "gone") return fail(res, 410, 410, "FIXTURE_GONE");
      return ok(res, {
        id: item.id, title: item.title, summary: item.summary, body: item.body, publishedAt: item.publishedAt, updatedAt: item.updatedAt ?? null,
        author: item.author ?? null, cover: item.withCover ? media(item.id) : null, redirectTo: item.status === "redirect" ? item.redirectTo : null,
      });
    }

    if (path === "/platform/site/gone") {
      const pathAndQuery = `${path}${url.search}`;
      const valid = verify(req.headers["x-neton-signature"] as string | undefined, pathAndQuery, options.secret);
      goneRequests.push({ ok: valid, query: url.search });
      if (!valid) return fail(res, 401, 10001, "SIGNATURE_INVALID");
      const since = Number(url.searchParams.get("since") ?? "0");
      const list = [...ledger].filter(([, at]) => at > since).map(([u, goneAt]) => ({ url: u, goneAt }));
      return ok(res, { list, nextCursor: null, now: Date.now() });
    }

    if (path === "/platform/site/target/ready" && req.method === "POST") {
      const raw = await new Promise<string>((resolve) => { let data = ""; req.on("data", (c) => { data += c; }); req.on("end", () => resolve(data)); });
      const valid = verify(req.headers["x-neton-signature"] as string | undefined, raw, options.secret);
      readySignals.push({ ok: valid, body: raw });
      if (!valid) return fail(res, 401, 10001, "SIGNATURE_INVALID");
      return ok(res, { targets: ["portal"], rescheduled: 0 });
    }

    if (path === "/app/fixture/state" && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${USER.token}`) return fail(res, 401, 10000, "AUTH_REQUIRED");
      const ids = ((await body(req)).ids as string[] | undefined) ?? [];
      stateCalls.push(ids);
      return ok(res, { starred: ids.filter((id) => Number(id) % 2 === 1) });
    }

    if (path === "/app/auth/login-username" && req.method === "POST") {
      const input = await body(req);
      if (input.username !== USER.username || input.password !== USER.password) return fail(res, 401, 10011, "INVALID_CREDENTIALS");
      return ok(res, { userId: USER.id, accessToken: USER.token, refreshToken: "r", tokenType: "Bearer", expiresIn: 3600, refreshExpiresIn: 7200, scope: [] });
    }
    if (path === "/app/member/user/get") {
      if (req.headers.authorization !== `Bearer ${USER.token}`) return fail(res, 401, 10000, "AUTH_REQUIRED");
      return ok(res, { id: USER.id, username: USER.username, nickname: "Alice", avatar: null });
    }

    return fail(res, 404, 404, "ROUTE_NOT_FOUND");
  });

  await new Promise<void>((resolve) => server.listen(options.port, "127.0.0.1", resolve));
  return {
    url: base,
    items,
    ledger,
    hits,
    goneRequests,
    refreshed,
    stateCalls,
    readySignals,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
