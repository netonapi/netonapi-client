import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { goneStore } from "../gone";
import { createPublicProxy, PATHNAME_HEADER } from "../proxy";
import { encodeQuerySegment } from "../../public/query";

const proxy = createPublicProxy({
  consoleBasePath: "/my",
  routes: [
    { key: "filter.channel", pattern: "/channel/:code", query: ["cursor"], goneAware: true },
    { key: "site.home", pattern: "/", query: [], goneAware: false, queryOnly: true },
    { key: "content.ranking", pattern: "/hot", query: ["period", "by"], goneAware: false, queryOnly: true },
  ],
  legacy: [{ from: "/c/:code", to: "/channel/:code" }],
  nonConsole: ["/login", "/api"],
  goneHtml: "<!DOCTYPE html><title>Gone</title>",
});

const req = (path: string, cookie?: string) => new NextRequest(`https://www.example.com${path}`, { headers: cookie ? { cookie } : {} });

test("console without a session cookie → 307 to /login?next=", async () => {
  const res = await proxy(req("/my/account/profile?tab=1"));
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "https://www.example.com/login?next=%2Fmy%2Faccount%2Fprofile%3Ftab%3D1");
});

test("console with a cookie passes the original address to the layout", async () => {
  const res = await proxy(req("/my", "neton_client_session=abc"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get(`x-middleware-request-${PATHNAME_HEADER}`), "/my");
});

test("internal segments are not reachable from outside", async () => {
  assert.equal((await proxy(req("/channel/latest/~q/abc"))).status, 404);
});

test("whitelisted query moves into the path, everything else is dropped", async () => {
  const res = await proxy(req("/channel/latest?utm_source=x&cursor=c1"));
  assert.equal(res.headers.get("x-middleware-rewrite"), `https://www.example.com/channel/latest/~q/${encodeQuerySegment("cursor=c1")}`);
  const plain = await proxy(req("/channel/latest?utm_source=x"));
  assert.equal(plain.headers.get("x-middleware-rewrite"), null);
});

test("legacy shapes 308 to the current shape", async () => {
  const res = await proxy(req("/c/latest?cursor=1"));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "https://www.example.com/channel/latest?cursor=1");
});

test("deleted URLs of goneAware routes answer 410 with the static noindex page", async () => {
  await goneStore().add(["/channel/old"]);
  const res = await proxy(req("/channel/old"));
  assert.equal(res.status, 410);
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(await res.text(), "<!DOCTYPE html><title>Gone</title>");
  assert.equal((await proxy(req("/channel/live"))).status, 200);
});

test("parameterless cacheable routes are always served from their on-demand query variant", async () => {
  assert.equal((await proxy(req("/"))).headers.get("x-middleware-rewrite"), "https://www.example.com/~q/-");
  assert.equal((await proxy(req("/?utm_source=x"))).headers.get("x-middleware-rewrite"), "https://www.example.com/~q/-");
  assert.equal((await proxy(req("/hot"))).headers.get("x-middleware-rewrite"), "https://www.example.com/hot/~q/-");
  assert.equal(
    (await proxy(req("/hot?by=comments&period=week&utm_medium=y"))).headers.get("x-middleware-rewrite"),
    `https://www.example.com/hot/~q/${encodeQuerySegment("by=comments&period=week")}`,
  );
  assert.equal((await proxy(req("/~q/-"))).status, 404, "the internal address itself stays unreachable");
});
