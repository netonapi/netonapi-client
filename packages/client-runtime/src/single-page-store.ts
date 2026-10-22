import {
  WorkspaceStore,
  resolveRoute,
  type WorkspaceHostAdapter,
  type WorkspaceInstance,
  type WorkspacePage,
  type WorkspaceStoreOptions,
} from "@neton/application-front-workspace";

export interface SinglePageStoreOptions extends Omit<WorkspaceStoreOptions, "pinHome" | "persist"> {
  /** 当前页面有未保存内容时，离开前询问；返回 false 留在原页。省略即直接离开。 */
  confirmLeave?: (instance: WorkspaceInstance) => boolean;
}

/**
 * 用户端的单页工作区：同一时刻只有一个页面实例，打开别的页面就替换它，没有页签。
 *
 * 继承共用的 [WorkspaceStore]（地址、历史、标题、未保存标记都沿用它），只改「打开」：
 * 先按需确认离开，打开后关掉其余实例。关闭非当前实例不写历史，所以每次导航仍只有一条历史记录。
 * 浏览器后退到已被替换的页面时，工作区会按地址重新打开它（页面重新加载，不保留内存状态）。
 * 不持久化页面（没有页签可恢复）。
 */
export class SinglePageWorkspaceStore extends WorkspaceStore {
  private currentPages: WorkspacePage[];
  private readonly historyHost: WorkspaceHostAdapter;
  private readonly leaveGuard?: (instance: WorkspaceInstance) => boolean;

  constructor(options: SinglePageStoreOptions) {
    const { confirmLeave, ...rest } = options;
    super({ ...rest, pinHome: false });
    this.currentPages = options.pages;
    this.historyHost = options.host;
    this.leaveGuard = confirmLeave;
  }

  override updatePages(pages: WorkspacePage[]): void {
    this.currentPages = pages;
    super.updatePages(pages);
  }

  override open(href: string, opts: { history?: "push" | "replace" | "none"; forceNew?: boolean } = {}): WorkspaceInstance | null {
    const target = resolveRoute(this.currentPages, href);
    if (!target) return null;
    const { instances, activeId } = this.getSnapshot();
    const active = instances.find((i) => i.instanceId === activeId);
    const leaving = active && (opts.forceNew || active.resourceKey !== target.resourceKey);
    if (leaving && active.dirty && this.leaveGuard && !this.leaveGuard(active)) {
      // 浏览器前进后退时地址栏已经变了：留在原页就把它的地址写回去
      if (opts.history === "none") this.historyHost.push(active.location.href, active.instanceId);
      return null;
    }
    const opened = super.open(href, opts);
    if (opened) {
      for (const other of this.getSnapshot().instances) {
        if (other.instanceId !== opened.instanceId) this.close(other.instanceId);
      }
    }
    return opened;
  }
}
