/**
 * 已删除 URL 集合（public-routes §7.2）。
 *
 * App Router 的页面只能产出 404，不能产出 410：goneAware 路由的 410 由 proxy 先查这个集合返回。
 * 集合的来源是服务端 site 模块的已删除台账——失效端点收到 `gone` / `revived` 时增删；启动时与
 * 每 10 分钟从后端增量同步（gone-sync.ts）。
 *
 * 缺省实现在进程内（单实例部署）。proxy 与 Route Handler 是不同的打包入口、各有一份模块实例；而且
 * proxy 跑在自己的上下文里——它能读到主上下文 `globalThis` 上已有的属性，自己写上去的属性主上下文却
 * 看不到（实测：proxy 先访问时各建了一份，集合就分裂了）。所以集合挂在两边共享的同一个对象
 * `process` 上。多实例部署用 [setGoneStore] 换成共享存储（如 Redis），与 Next 的共享缓存处理器放在同一处。
 */

export interface GoneStore {
  has(path: string): Promise<boolean> | boolean;
  add(paths: readonly string[]): Promise<void> | void;
  delete(paths: readonly string[]): Promise<void> | void;
  size(): Promise<number> | number;
  /** 全部地址（死链文件 /sitemaps/gone.txt 用）。 */
  list(): Promise<string[]> | string[];
}

const KEY = Symbol.for("neton.client.site.gone-store");

export class MemoryGoneStore implements GoneStore {
  private readonly paths = new Set<string>();
  has(path: string): boolean { return this.paths.has(path); }
  add(paths: readonly string[]): void { for (const p of paths) this.paths.add(p); }
  delete(paths: readonly string[]): void { for (const p of paths) this.paths.delete(p); }
  size(): number { return this.paths.size; }
  list(): string[] { return [...this.paths].sort(); }
}

type Holder = { [KEY]?: GoneStore };

/** 进程级的共享对象：Node 下是 `process`（proxy 与 Route Handler 拿到的是同一个），没有时退回 globalThis。 */
function holder(): Holder {
  return (typeof process === "object" && process ? process : globalThis) as unknown as Holder;
}

export function goneStore(): GoneStore {
  const h = holder();
  return (h[KEY] ??= new MemoryGoneStore());
}

export function setGoneStore(store: GoneStore): void {
  holder()[KEY] = store;
}
