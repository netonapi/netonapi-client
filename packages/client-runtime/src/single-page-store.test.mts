import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkspaceHostAdapter, WorkspacePage } from "@neton/application-front-workspace";
import { SinglePageWorkspaceStore } from "./single-page-store.ts";

const load = async () => ({ default: () => null });
const pages: WorkspacePage[] = [
  { key: "__home", path: "/", identity: [], title: "Home", standalone: true, load },
  { key: "account/profile", path: "/account/profile", identity: [], title: "Profile", standalone: false, load },
  { key: "user/detail", path: "/user/:id", identity: ["id"], title: "User :id", standalone: true, load },
];

function memoryHost(initial: string) {
  const bar: string[] = [initial];
  let pop: (href: string, id: string | null) => void = () => {};
  const host: WorkspaceHostAdapter = {
    read: () => bar.at(-1)!,
    readInstanceId: () => null,
    push: (href) => { bar.push(href); },
    replace: (href) => { bar[bar.length - 1] = href; },
    subscribe: (listener) => { pop = listener; return () => {}; },
    toExternal: (href) => href,
    toInternal: (href) => href,
  };
  return { host, bar, back: (href: string) => { bar.push(href); pop(href, null); } };
}

test("keeps one instance, replaces it on navigation and writes one history entry per navigation", () => {
  const { host, bar } = memoryHost("/");
  const store = new SinglePageWorkspaceStore({ pages, host, homeHref: "/" });
  store.start();
  store.open("/account/profile");
  store.open("/user/3");
  const { instances, activeId } = store.getSnapshot();
  assert.equal(instances.length, 1);
  assert.equal(instances[0]!.pageKey, "user/detail");
  assert.equal(activeId, instances[0]!.instanceId);
  assert.deepEqual(bar, ["/", "/account/profile", "/user/3"]);
  // 同一资源只更新地址，不重建
  const id = instances[0]!.instanceId;
  store.open("/user/3?tab=b");
  assert.equal(store.getSnapshot().instances[0]!.instanceId, id);
  store.stop();
});

test("asks before leaving a dirty page and stays when declined", () => {
  const { host, bar } = memoryHost("/account/profile");
  let answer = false;
  const asked: string[] = [];
  const store = new SinglePageWorkspaceStore({ pages, host, homeHref: "/", confirmLeave: (i) => { asked.push(i.pageKey); return answer; } });
  store.start();
  const first = store.getSnapshot().instances[0]!;
  store.setDirty(first.instanceId, true);
  assert.equal(store.open("/user/1"), null);
  assert.deepEqual(asked, ["account/profile"]);
  assert.equal(store.getSnapshot().instances[0]!.instanceId, first.instanceId);
  assert.equal(bar.at(-1), "/account/profile");
  // 同一页面内的视图变化不算离开
  assert.ok(store.open("/account/profile?x=1"));
  answer = true;
  assert.ok(store.open("/user/1"));
  assert.deepEqual(store.getSnapshot().instances.map((i) => i.pageKey), ["user/detail"]);
  store.stop();
});

test("back navigation reopens a replaced page, and puts the address back when leaving a dirty page is declined", () => {
  const { host, bar, back } = memoryHost("/account/profile");
  let answer = true;
  const store = new SinglePageWorkspaceStore({ pages, host, homeHref: "/", confirmLeave: () => answer });
  store.start();
  store.open("/user/1");
  back("/account/profile");
  assert.deepEqual(store.getSnapshot().instances.map((i) => i.pageKey), ["account/profile"]);

  const active = store.getSnapshot().instances[0]!;
  store.setDirty(active.instanceId, true);
  answer = false;
  back("/user/1");
  assert.equal(store.getSnapshot().instances[0]!.instanceId, active.instanceId);
  assert.equal(bar.at(-1), "/account/profile");
  store.stop();
});
