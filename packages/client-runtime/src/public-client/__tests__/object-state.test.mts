import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defineObjectStateLoader,
  invalidateObjectState,
  readObjectState,
  requestObjectState,
  sessionKeyOf,
  setObjectState,
  subscribeObjectState,
} from "../object-state";

const tick = () => new Promise((r) => setTimeout(r, 5));
const ALICE = sessionKeyOf({ status: "authenticated", user: { userId: "42", nickname: "A", avatar: "" } });
const BOB = sessionKeyOf({ status: "authenticated", user: { userId: "43", nickname: "B", avatar: "" } });
const ANON = sessionKeyOf({ status: "anonymous" });
const LOADING = sessionKeyOf({ status: "loading" });

let seq = 0;
/** 手动放行的闸：测试决定在途请求什么时候回来，不靠定时器的先后。 */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => { open = r; });
  return { opened, open };
}

function loader(options: { maxBatch?: number; requiresSession?: boolean; fail?: () => boolean; wait?: () => Promise<void> } = {}) {
  const calls: string[][] = [];
  const signals: AbortSignal[] = [];
  const l = defineObjectStateLoader<number>({
    id: `test.loader${(seq += 1)}`,
    maxBatch: options.maxBatch ?? 100,
    fallback: 0,
    requiresSession: options.requiresSession,
    async load(ids, { signal }) {
      calls.push(ids);
      signals.push(signal);
      if (options.wait) await options.wait();
      if (options.fail?.()) throw new Error("boom");
      // 偶数 id 不在结果里 → fallback
      return Object.fromEntries(ids.filter((id) => Number(id) % 2 === 1).map((id) => [id, Number(id) * 10]));
    },
  });
  return { l, calls, signals };
}

test("ids requested in the same tick are deduped into one call; absent ids get the fallback", async () => {
  const { l, calls } = loader();
  for (const id of ["1", "2", "3", "1", "3"]) requestObjectState(l, id, ALICE);
  assert.equal(readObjectState(l, "1").status, "loading");
  await tick();
  assert.deepEqual(calls, [["1", "2", "3"]]);
  assert.deepEqual(readObjectState(l, "1"), { value: 10, status: "ready" });
  assert.deepEqual(readObjectState(l, "2"), { value: 0, status: "ready" });
  requestObjectState(l, "1", ALICE);
  await tick();
  assert.equal(calls.length, 1, "cached per session");
});

test("batches larger than maxBatch are split", async () => {
  const { l, calls } = loader({ maxBatch: 2 });
  for (const id of ["1", "2", "3", "4", "5"]) requestObjectState(l, id, ALICE);
  await tick();
  assert.deepEqual(calls, [["1", "2"], ["3", "4"], ["5"]]);
});

test("anonymous and pending sessions never request; requiresSession: false does", async () => {
  const { l, calls } = loader();
  requestObjectState(l, "1", LOADING);
  requestObjectState(l, "3", ANON);
  await tick();
  assert.deepEqual(calls, []);
  assert.deepEqual(readObjectState(l, "1"), { value: 0, status: "idle" });
  const open = loader({ requiresSession: false });
  requestObjectState(open.l, "1", ANON);
  await tick();
  assert.deepEqual(open.calls, [["1"]]);
});

test("a session switch aborts in-flight requests, clears the cache and notifies subscribers", async () => {
  const g = gate();
  const { l, calls, signals } = loader({ wait: () => g.opened });
  let notified = 0;
  const off = subscribeObjectState(l, "1", () => { notified += 1; });
  requestObjectState(l, "1", ALICE);
  await tick();
  assert.equal(calls.length, 1);
  requestObjectState(l, "1", BOB);
  assert.equal(signals[0]!.aborted, true);
  await tick();
  g.open();
  await tick();
  assert.deepEqual(calls, [["1"], ["1"]]);
  assert.deepEqual(readObjectState(l, "1"), { value: 10, status: "ready" });
  assert.ok(notified >= 3, `subscribers were told (${notified})`);
  // 退出登录：回到 fallback / idle
  requestObjectState(l, "1", ANON);
  assert.deepEqual(readObjectState(l, "1"), { value: 0, status: "idle" });
  off();
});

test("optimistic set wins over a response that was already in flight", async () => {
  const g = gate();
  const { l } = loader({ wait: () => g.opened });
  requestObjectState(l, "1", ALICE);
  await tick();
  setObjectState(l, "1", (prev) => prev + 1);
  assert.deepEqual(readObjectState(l, "1"), { value: 1, status: "ready" });
  g.open();
  await tick();
  assert.deepEqual(readObjectState(l, "1"), { value: 1, status: "ready" }, "the stale response did not overwrite it");
});

test("errors set status error without throwing; invalidate retries", async () => {
  let failing = true;
  const { l, calls } = loader({ fail: () => failing });
  const off = subscribeObjectState(l, "1", () => {});
  requestObjectState(l, "1", ALICE);
  await tick();
  assert.deepEqual(readObjectState(l, "1"), { value: 0, status: "error" });
  requestObjectState(l, "1", ALICE);
  await tick();
  assert.equal(calls.length, 1, "an errored id is not retried by a plain request");
  failing = false;
  invalidateObjectState(l, ["1"]);
  await tick();
  assert.deepEqual(readObjectState(l, "1"), { value: 10, status: "ready" });
  off();
});

test("loader ids are validated and unique", () => {
  assert.throws(() => defineObjectStateLoader({ id: "nope", maxBatch: 1, fallback: 0, load: async () => ({}) }), /<module id>.<name>/);
  assert.throws(() => defineObjectStateLoader({ id: "test.zero", maxBatch: 0, fallback: 0, load: async () => ({}) }), /maxBatch/);
  defineObjectStateLoader({ id: "test.once", maxBatch: 1, fallback: 0, load: async () => ({}) });
  assert.throws(() => defineObjectStateLoader({ id: "test.once", maxBatch: 1, fallback: 0, load: async () => ({}) }), /defined twice/);
});
