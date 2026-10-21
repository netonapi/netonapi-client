"use client";

/**
 * 批量的「我的状态」（public-routes §9.4，`ObjectStateBatcher`）。
 *
 * 一页上常有很多组件各自需要访问者的状态（评论区里每条评论的我的投票、收藏按钮……）。它们各自调用
 * `useObjectState(loader, id)`，同一个节拍里（同一次提交里挂载的组件，加上到下一个宏任务之前的请求）的 id
 * 按 loader 去重、合并成一次 `load(ids)`（超过 `maxBatch` 拆成多次），结果按 id 分发给所有订阅者。
 *
 * - **水合安全**：首帧恒为 `{ value: fallback, status: "idle" }`（与服务端 HTML 的匿名态一致），会话确定后才请求。
 * - **按会话缓存**：结果记在当前会话用户名下；登录、退出、换账号时整个 loader 的缓存清空、在途请求中止，
 *   仍在订阅的 id 按新会话重新请求。`requiresSession: false` 的 loader 与会话无关（结果对谁都一样）。
 * - 匿名（或会话还在确认中）时需要会话的 loader 不发请求，给 `fallback`，状态 `idle`。
 * - 失败不抛出：状态 `error`、值保持原样；`invalidateObjectState` 重新请求。
 * - `setObjectState` 用于乐观更新与「刚发表的评论是我的」：通知该 id 的全部订阅者；它之后才回来的旧请求结果不覆盖它。
 *
 * 不依赖 React Query：门户的公开页不带它（首屏 JS 预算，§10.6）。
 */
import * as React from "react";
import { usePublicSession, type PublicSessionState } from "./session";

export type ObjectStateStatus = "idle" | "loading" | "ready" | "error";

export interface ObjectStateSnapshot<V> {
  value: V;
  status: ObjectStateStatus;
}

export interface ObjectStateLoader<V> {
  readonly id: string;
  readonly fallback: V;
}

export interface ObjectStateLoaderSpec<V> {
  /** `<模块 id>.<名称>`，全局唯一。 */
  id: string;
  /** 后端一次能收的 id 数；更多的拆成几次调用。 */
  maxBatch: number;
  /** 加载前、匿名访问者、以及结果里没有出现的 id 的值。 */
  fallback: V;
  /** 缺省 true：匿名或会话确认中不请求，直接给 fallback。 */
  requiresSession?: boolean;
  load(ids: string[], ctx: { signal: AbortSignal }): Promise<Record<string, V>>;
}

const LOADER_ID = /^[a-z][a-z0-9-]*\.[A-Za-z0-9._-]+$/;
/** 会话还没确认时的键：不请求。 */
const SESSION_PENDING = "\u0000pending";
const SESSION_ANONYMOUS = "\u0000anonymous";
/** 与会话无关的 loader 用的固定键。 */
const SESSION_ANY = "\u0000any";

interface Entry<V> {
  snapshot: ObjectStateSnapshot<V>;
  listeners: Set<() => void>;
  /** 每次本地写入（setObjectState）或重置加一：比它旧的请求结果作废。 */
  version: number;
}

class ObjectStateStore<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly pending = new Set<string>();
  private readonly inflight = new Set<AbortController>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private session: string = SESSION_PENDING;
  readonly idle: ObjectStateSnapshot<V>;

  constructor(readonly spec: Required<Pick<ObjectStateLoaderSpec<V>, "requiresSession">> & ObjectStateLoaderSpec<V>) {
    this.idle = Object.freeze({ value: spec.fallback, status: "idle" as const });
  }

  private entry(id: string): Entry<V> {
    let e = this.entries.get(id);
    if (!e) {
      e = { snapshot: this.idle, listeners: new Set(), version: 0 };
      this.entries.set(id, e);
    }
    return e;
  }

  private publish(e: Entry<V>, snapshot: ObjectStateSnapshot<V>) {
    if (e.snapshot.value === snapshot.value && e.snapshot.status === snapshot.status) return;
    e.snapshot = snapshot;
    for (const listener of [...e.listeners]) listener();
  }

  snapshot(id: string): ObjectStateSnapshot<V> {
    return this.entries.get(id)?.snapshot ?? this.idle;
  }

  subscribe(id: string, listener: () => void): () => void {
    const e = this.entry(id);
    e.listeners.add(listener);
    return () => { e.listeners.delete(listener); };
  }

  private canLoad(): boolean {
    if (!this.spec.requiresSession) return true;
    return this.session !== SESSION_PENDING && this.session !== SESSION_ANONYMOUS;
  }

  /** 会话变化：中止在途请求、清空缓存（订阅者先回到 fallback），之后由组件按新会话重新请求。 */
  private bindSession(key: string) {
    const next = this.spec.requiresSession ? key : SESSION_ANY;
    if (next === this.session) return;
    this.session = next;
    this.reset();
  }

  private reset() {
    for (const c of this.inflight) c.abort();
    this.inflight.clear();
    this.pending.clear();
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const [id, e] of this.entries) {
      e.version += 1;
      if (e.listeners.size === 0) this.entries.delete(id);
      else this.publish(e, this.idle);
    }
  }

  request(id: string, sessionKey: string) {
    this.bindSession(sessionKey);
    if (!this.canLoad()) return;
    const e = this.entry(id);
    if (e.snapshot.status !== "idle") return;
    this.publish(e, { value: e.snapshot.value, status: "loading" });
    this.enqueue(id);
  }

  private enqueue(id: string) {
    this.pending.add(id);
    // 宏任务：同一次提交里所有组件的 effect、以及它们之后的微任务都已经排进来
    this.timer ??= setTimeout(() => this.flush(), 0);
  }

  private flush() {
    this.timer = null;
    const ids = [...this.pending];
    this.pending.clear();
    const size = Math.max(1, this.spec.maxBatch);
    for (let i = 0; i < ids.length; i += size) void this.loadChunk(ids.slice(i, i + size));
  }

  private async loadChunk(ids: string[]) {
    const controller = new AbortController();
    this.inflight.add(controller);
    const versions = new Map(ids.map((id) => [id, this.entry(id).version]));
    let result: Record<string, V> | null = null;
    let failed = false;
    try {
      result = await this.spec.load(ids, { signal: controller.signal });
    } catch {
      failed = true;
    } finally {
      this.inflight.delete(controller);
    }
    if (controller.signal.aborted) return;
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e || e.version !== versions.get(id)) continue;
      if (failed || !result) this.publish(e, { value: e.snapshot.value, status: "error" });
      else this.publish(e, { value: Object.hasOwn(result, id) ? result[id]! : this.spec.fallback, status: "ready" });
    }
  }

  set(id: string, value: V | ((prev: V) => V)) {
    const e = this.entry(id);
    e.version += 1;
    this.pending.delete(id);
    const next = typeof value === "function" ? (value as (prev: V) => V)(e.snapshot.value) : value;
    this.publish(e, { value: next, status: "ready" });
  }

  invalidate(ids?: string[]) {
    const targets = ids ?? [...this.entries.keys()];
    for (const id of targets) {
      const e = this.entries.get(id);
      if (!e) continue;
      e.version += 1;
      if (e.listeners.size === 0) { this.entries.delete(id); continue; }
      if (!this.canLoad()) { this.publish(e, this.idle); continue; }
      this.publish(e, { value: e.snapshot.value, status: "loading" });
      this.enqueue(id);
    }
  }
}

const stores = new Map<string, ObjectStateStore<unknown>>();
const storeOf = new WeakMap<ObjectStateLoader<unknown>, ObjectStateStore<unknown>>();

export function defineObjectStateLoader<V>(spec: ObjectStateLoaderSpec<V>): ObjectStateLoader<V> {
  if (!LOADER_ID.test(spec.id)) throw new Error(`object state loader id must be "<module id>.<name>": ${spec.id}`);
  if (!Number.isInteger(spec.maxBatch) || spec.maxBatch < 1) throw new Error(`object state loader ${spec.id}: maxBatch must be a positive integer`);
  // 开发环境的热更新会重新执行定义它的模块：替换而不是报错
  if (stores.has(spec.id) && process.env.NODE_ENV !== "development") throw new Error(`object state loader ${spec.id} is defined twice`);
  const store = new ObjectStateStore<V>({ ...spec, requiresSession: spec.requiresSession ?? true });
  const loader: ObjectStateLoader<V> = Object.freeze({ id: spec.id, fallback: spec.fallback });
  stores.set(spec.id, store as ObjectStateStore<unknown>);
  storeOf.set(loader as ObjectStateLoader<unknown>, store as ObjectStateStore<unknown>);
  return loader;
}

function storeFor<V>(loader: ObjectStateLoader<V>): ObjectStateStore<V> {
  const store = storeOf.get(loader as ObjectStateLoader<unknown>);
  if (!store) throw new Error(`object state loader ${loader.id} was not created by defineObjectStateLoader`);
  return store as ObjectStateStore<V>;
}

export function sessionKeyOf(state: PublicSessionState): string {
  if (state.status === "loading") return SESSION_PENDING;
  if (state.status === "anonymous") return SESSION_ANONYMOUS;
  return `user:${state.user.userId}`;
}

/** 测试与非 React 调用方：按会话键请求一个 id（组件用 `useObjectState`）。 */
export function requestObjectState<V>(loader: ObjectStateLoader<V>, id: string, sessionKey: string): void {
  storeFor(loader).request(id, sessionKey);
}

export function readObjectState<V>(loader: ObjectStateLoader<V>, id: string): ObjectStateSnapshot<V> {
  return storeFor(loader).snapshot(id);
}

export function subscribeObjectState<V>(loader: ObjectStateLoader<V>, id: string, listener: () => void): () => void {
  return storeFor(loader).subscribe(id, listener);
}

export function useObjectState<V>(loader: ObjectStateLoader<V>, id: string | null | undefined): ObjectStateSnapshot<V> {
  const store = storeFor(loader);
  const sessionKey = sessionKeyOf(usePublicSession().state);
  const subscribe = React.useCallback((listener: () => void) => (id ? store.subscribe(id, listener) : () => {}), [store, id]);
  const snapshot = React.useSyncExternalStore(subscribe, () => (id ? store.snapshot(id) : store.idle), () => store.idle);
  React.useEffect(() => { if (id) store.request(id, sessionKey); }, [store, id, sessionKey]);
  return snapshot;
}

export function setObjectState<V>(loader: ObjectStateLoader<V>, id: string, value: V | ((prev: V) => V)): void {
  storeFor(loader).set(id, value);
}

export function invalidateObjectState<V>(loader: ObjectStateLoader<V>, ids?: string[]): void {
  storeFor(loader).invalidate(ids);
}
