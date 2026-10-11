"use client";

import * as React from "react";
import {
  WorkspaceHost,
  WorkspaceLink,
  instanceTitle,
  useCloseGuard,
  useWorkspace,
  useWorkspaceLinkDelegation,
  useWorkspaceStore,
  WorkspaceStore,
  type WorkspaceInstance,
  type WorkspacePage,
  type WorkspaceUiAdapter,
} from "@neton/application-front-workspace";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Command,
  ContactRound,
  CreditCard,
  Database,
  FileText,
  Home,
  IdCard,
  LogIn,
  LogOut,
  List,
  Mail,
  Maximize2,
  Menu,
  MessageCircle,
  Minimize2,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
  UsersRound,
  Wrench,
  X,
  KeyRound,
} from "lucide-react";
import type { NavItem } from "@neton/application-client-runtime/menu";
import type { PermissionInfo } from "@neton/application-client-runtime/types";
import { FrontClientProvider, useQueryClient } from "@neton/application-client-runtime/client-context";
import { cn } from "@neton/application-client-kit";
import { memberInitial } from "@neton/application-client-runtime/types";
import { BrandMark } from "./brand-mark";
import { useSiteBrand } from "./site-brand";

type FrontUser = PermissionInfo["user"];

interface FlatNavItem {
  name: string;
  path: string;
  icon?: string | null;
  trail: string[];
}

const iconMap: Record<string, LucideIcon> = {
  setting: Settings,
  tool: Wrench,
  user: UserRound,
  lock: KeyRound,
  team: UsersRound,
  menu: Menu,
  apartment: Network,
  idcard: IdCard,
  book: BookOpen,
  notification: Bell,
  "file-text": FileText,
  login: LogIn,
  message: MessageCircle,
  mobile: Smartphone,
  mail: Mail,
  "share-alt": Share2,
  "pay-circle": CreditCard,
  appstore: Boxes,
  database: Database,
};

function resolveIcon(value?: string | null): LucideIcon {
  const raw = value?.split(":").pop()?.replace(/-outlined$/, "") ?? "";
  return iconMap[raw] ?? CircleDot;
}

function flattenNav(items: NavItem[], parents: string[] = []): FlatNavItem[] {
  const flat: FlatNavItem[] = [];
  for (const item of items) {
    const trail = [...parents, item.name];
    if (item.children?.length) flat.push(...flattenNav(item.children, trail));
    else flat.push({ name: item.name, path: item.path, icon: item.icon, trail });
  }
  return flat;
}

/**
 * 当前激活页签的 pathname。
 *
 * 🔴 shell 一律用它，不用 `usePathname()`。实测（gate1）：宿主路由器的 hook 在我们
 * pushState 时**不更新**，只在浏览器后退时突变 —— 挂在它上面的高亮、面包屑、
 * 尤其是 `key={pathname}`，会在后退那一刻突然变化并炸掉子树。
 */
function useActivePath(): string {
  const { instances, activeId } = useWorkspace();
  return instances.find((i) => i.instanceId === activeId)?.location.pathname ?? "/";
}

/** 按 `group` 把连续同组的条目聚成段；相邻同名视为同一段，顺序完全由调用方决定。 */
function groupNav(items: NavItem[]): Array<{ label: string | null; items: NavItem[] }> {
  const sections: Array<{ label: string | null; items: NavItem[] }> = [];
  for (const item of items) {
    const label = item.group ?? null;
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.items.push(item);
    else sections.push({ label, items: [item] });
  }
  return sections;
}

function NavBranch({
  item,
  depth,
  collapsed,
  onNavigate,
  onExpand,
}: {
  item: NavItem;
  depth: number;
  collapsed: boolean;
  onNavigate(): void;
  onExpand(): void;
}) {
  const pathname = useActivePath();
  const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
  const hasChildren = Boolean(item.children?.length);
  const [open, setOpen] = React.useState(active);
  const Icon = resolveIcon(item.icon);

  React.useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (collapsed && depth === 0) {
    return (
      <button
        type="button"
        title={item.name}
        onClick={onExpand}
        className={cn(
          "mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-[var(--sidebar-active)] text-[var(--primary)]"
            : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]",
        )}
      >
        <Icon size={18} strokeWidth={1.8} />
      </button>
    );
  }

  if (hasChildren) {
    return (
      <div className={depth === 0 ? "mb-0.5" : "mt-0.5"}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]",
          depth > 0 && "py-1.5",
          active
              ? "bg-[var(--sidebar-accent)]/55 text-[var(--sidebar-foreground)] group-has-[a:hover]/nav:bg-transparent"
              : "text-[var(--muted-foreground)]",
          )}
        >
          <Icon size={17} strokeWidth={1.8} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className={cn("mt-1 space-y-0.5", depth === 0 ? "ml-5 border-l border-[var(--sidebar-border)] pl-2" : "pl-2")}>
            {item.children!.map((child) => (
              <NavBranch
                key={child.path}
                item={child}
                depth={depth + 1}
                collapsed={false}
                onNavigate={onNavigate}
                onExpand={onExpand}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <WorkspaceLink
      to={item.path}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
        pathname === item.path
          ? "bg-[var(--sidebar-active)] font-medium text-[var(--foreground)] group-has-[a:hover]/nav:[&:not(:hover)]:bg-transparent before:absolute before:-left-[9px] before:h-4 before:w-[2px] before:rounded-full before:bg-[var(--foreground)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]",
      )}
    >
      <Icon size={depth > 0 ? 15 : 16} strokeWidth={1.8} className="shrink-0" />
      <span className="truncate">{item.name}</span>
    </WorkspaceLink>
  );
}

/**
 * 页签栏。
 *
 * 完全由工作区状态驱动：页签就是实例，激活即 `store.activate()` —— 它会把地址栏
 * 同步成该实例的完整 URL（含 query），而实例本身不重建。
 *
 * 旧实现把页签 key 定成 `usePathname()`，因此丢掉 query（`?groupId=1` 与
 * `?groupId=2` 塌成同一个页签，点开还打不开），并且靠菜单树反推名字（同一菜单
 * 下的两个详情页会重名，菜单外的页面直接叫「页面」）。这三个症状同源，
 * 换成 instanceId + resourceKey + 注册表标题后一并消失。
 */
function PageTabs() {
  const store = useWorkspaceStore();
  const { instances, activeId } = useWorkspace();
  const closeTab = useCloseGuard();
  const [tabMenuOpen, setTabMenuOpen] = React.useState(false);
  const [scrollState, setScrollState] = React.useState({ left: false, right: false });
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const updateScrollState = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollState({
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    });
  }, []);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [instances, updateScrollState]);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!activeId) return;
    const active = element?.querySelector<HTMLElement>(`[data-tab-instance="${CSS.escape(activeId)}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    window.setTimeout(updateScrollState, 180);
  }, [activeId, instances, updateScrollState]);

  function scrollTabs(direction: -1 | 1) {
    scrollRef.current?.scrollBy({ left: direction * Math.max(220, scrollRef.current.clientWidth * 0.55), behavior: "smooth" });
    window.setTimeout(updateScrollState, 260);
  }

  function renderTab(instance: WorkspaceInstance, inMenu = false) {
    const active = instance.instanceId === activeId;
    const title = instanceTitle(instance);
    return (
      <div
        key={instance.instanceId}
        data-tab-instance={inMenu ? undefined : instance.instanceId}
        data-tab-href={instance.location.href}
        title={instance.location.href}
        className={cn(
          inMenu
            ? "group relative flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-xs transition hover:bg-[var(--muted)]"
            : "group relative flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all",
          !inMenu && (active
            ? "border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-xs)]"
            : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"),
          inMenu && active && "bg-[var(--primary-soft)] font-medium text-[var(--primary)]",
        )}
      >
        {/* 仍然渲染真 <a href>：中键/新窗口/复制链接必须照常可用，只接管普通左键 */}
        <WorkspaceLink
          to={instance.location.href}
          aria-label={`打开${title}`}
          onClick={(event) => {
            event.preventDefault();
            setTabMenuOpen(false);
            store.activate(instance.instanceId);
          }}
          className="absolute inset-[-1px] z-0 rounded-lg"
        />
        <span className="pointer-events-none relative z-[1] flex items-center gap-2">
          {instance.pinned && <Home size={13} />}
          <span className="max-w-[13rem] truncate">{title}</span>
          {instance.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" aria-label="有未保存内容" />}
        </span>
        {!instance.pinned && (
          <button
            type="button"
            aria-label={`关闭${title}`}
            onClick={() => closeTab(instance.instanceId)}
            className="relative z-10 rounded p-0.5 text-[var(--muted-foreground)] opacity-60 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        )}
        {!inMenu && active && <span className="pointer-events-none absolute left-3 top-0 h-[2px] w-5 rounded-full bg-[var(--primary)]" />}
      </div>
    );
  }

  return (
    <div className="relative z-30 flex h-10 min-w-0 items-center border-b border-[var(--border)] bg-[var(--background)] px-2">
      <button type="button" aria-label="向左滚动页签" disabled={!scrollState.left} onClick={() => scrollTabs(-1)} className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)] disabled:opacity-25">
        <ChevronLeft size={15} />
      </button>
      <div ref={scrollRef} onScroll={updateScrollState} className="front-scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5">
        {instances.map((instance) => renderTab(instance))}
      </div>
      <button type="button" aria-label="向右滚动页签" disabled={!scrollState.right} onClick={() => scrollTabs(1)} className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)] disabled:opacity-25">
        <ChevronRight size={15} />
      </button>
      <div className="relative ml-1 border-l border-[var(--border)] pl-1">
        <button type="button" aria-label="查看全部页签" aria-expanded={tabMenuOpen} onClick={() => setTabMenuOpen((value) => !value)} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]">
          <List size={15} />
        </button>
        {tabMenuOpen && <><button type="button" aria-label="关闭页签列表" className="fixed inset-0 z-[80] cursor-default" onClick={() => setTabMenuOpen(false)} /><div className="absolute right-0 top-9 z-[90] w-64 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--popover)] p-1.5 shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between px-2 py-2"><span className="text-[10px] font-semibold tracking-[0.12em] text-[var(--muted-foreground)]">OPEN WORKSPACES</span><span className="text-[10px] text-[var(--muted-foreground)]">{instances.length}</span></div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">{instances.map((instance) => renderTab(instance, true))}</div>
        </div></>}
      </div>
    </div>
  );
}

/**
 * 刷新：只让数据缓存失效，不动页面实例。
 *
 * 旧实现调 `router.refresh()` —— 那是宿主路由级刷新，会把整棵页面子树重建，
 * 正是本次要消灭的行为。管理后台里「刷新」的语义本来就是重新取数。
 */
function RefreshButton() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  return (
    <button
      type="button"
      title="刷新数据"
      onClick={() => {
        setRefreshing(true);
        void queryClient.invalidateQueries();
        window.setTimeout(() => setRefreshing(false), 650);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
    >
      <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
    </button>
  );
}

function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: FlatNavItem[];
  onClose(): void;
}) {
  const store = useWorkspaceStore();
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const results = items.filter((item) => `${item.name} ${item.trail.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  React.useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#09090b]/35 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="菜单搜索"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <Search size={18} className="text-[var(--primary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder="搜索菜单、页面或功能…"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-0"
          />
          <kbd className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs text-[#77837d]">ESC</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {results.length ? results.map((item) => {
            const Icon = resolveIcon(item.icon);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  store.open(item.path);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--primary-soft)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--foreground)]">{item.name}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">{item.trail.join(" / ")}</span>
                </span>
                <ChevronRight size={15} className="text-[var(--muted-foreground)]" />
              </button>
            );
          }) : (
            <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">没有找到匹配的页面</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  items,
  user,
  roles,
  permissions,
  pages,
  ui,
}: {
  items: NavItem[];
  user: FrontUser;
  roles: string[];
  permissions: string[];
  /** 已安装页面表；实例由工作区宿主渲染，shell 不再有单一 children 插槽。 */
  pages: WorkspacePage[];
  /** 本发行版使用的 UI 套件适配（弹层宿主 + 导航）。 */
  ui: WorkspaceUiAdapter;
}) {
  const pathname = useActivePath();
  const store = useWorkspaceStore();
  const { instances, activeId } = useWorkspace();
  const flatItems = React.useMemo(() => flattenNav(items), [items]);
  // 迁移垫片：接管尚未换成 WorkspaceLink 的原生 <a href>（业务模块里还有）。
  useWorkspaceLinkDelegation(pages);
  const current = flatItems.find((item) => item.path === pathname)
    ?? [...flatItems].sort((a, b) => b.path.length - a.path.length).find((item) => pathname.startsWith(`${item.path}/`));
  const brand = useSiteBrand();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const profileRef = React.useRef<HTMLDivElement>(null);
  // 个人中心入口只在对应页面已装配时出现：发行版可以不装 client-account，菜单不能指向不存在的页面
  const accountLinks = [
    { to: "/account/profile", label: "个人资料", Icon: UserRound },
    { to: "/account/password", label: "修改密码", Icon: KeyRound },
  ].filter((link) => pages.some((page) => page.path === link.to));
  // 点弹层外任意处关闭（按下时判定：等到 click 才关，拖选文字松手在外面也会误关）
  React.useEffect(() => {
    if (!profileOpen && !noticeOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (profileOpen && !profileRef.current?.contains(target)) setProfileOpen(false);
      if (noticeOpen && !noticeRef.current?.contains(target)) setNoticeOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [profileOpen, noticeOpen]);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem("neton-client-sidebar") === "collapsed");
    setDarkMode(document.documentElement.classList.contains("dark"));
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setProfileOpen(false);
        setNoticeOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem("neton-client-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  async function logout() {
    // C 端仍走 Node 代理清 Cookie（保留 SSR 形态，见受保护布局的注释）。
    WorkspaceStore.clearPersisted();
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { "X-Neton-Csrf": "1" } }).catch(() => null);
    // 退出失败时不跳走：会话仍然有效，不能让人以为已经退出（评审 R04）。
    if (!res?.ok) { window.alert("退出失败，请检查网络后重试。会话仍然有效。"); return; }
    window.location.href = "/login";
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.style.colorScheme = next ? "dark" : "light";
      localStorage.setItem("neton-client-theme", next ? "dark" : "light");
      return next;
    });
  }

  // 展示名可能是打码手机号（短信注册没有昵称），取不到字母 / 汉字就显示用户图标
  const initials = memberInitial(user) || <UserRound size={15} />;
  const activeInstance = instances.find((i) => i.instanceId === activeId);
  const activeTitle = activeInstance ? instanceTitle(activeInstance) : "页面";
  const trails = current?.trail
    ? [...current.trail, ...(pathname === current.path ? [] : [activeTitle])]
    : (pathname === "/" ? ["工作台"] : [activeTitle]);
  const sidebarCompact = collapsed && !mobileOpen;

  return (
    <FrontClientProvider permissions={permissions} roles={roles} user={user}>
      <div className="flex h-screen overflow-hidden bg-[var(--front-canvas)]">
      {mobileOpen && <button aria-label="关闭导航" className="fixed inset-0 z-30 bg-[#09090b]/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-[8px_0_30px_rgba(16,24,40,.025)] transition-[width,transform] duration-200 lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCompact ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-[var(--sidebar-border)]", sidebarCompact ? "justify-center px-2" : "gap-3 px-3.5")}>
          <BrandMark className="h-8 w-8" />
          {!sidebarCompact && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.02em]">{brand.name}</div>
              {brand.tagline && (
                <div className="mt-0.5 truncate text-[10px] font-medium tracking-[0.14em] text-[var(--muted-foreground)]">{brand.tagline}</div>
              )}
            </div>
          )}
          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-[var(--muted-foreground)] transition hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <nav className={cn("group/nav min-h-0 flex-1 overflow-y-auto py-4", sidebarCompact ? "space-y-1 px-2" : "px-2.5")}>
          <WorkspaceLink
            to="/"
            onClick={() => setMobileOpen(false)}
            title="工作台"
            className={cn(
              "mb-3 flex items-center rounded-lg transition-colors",
              sidebarCompact ? "mx-auto h-10 w-10 justify-center" : "gap-3 px-3 py-2 text-[13px] font-medium",
              pathname === "/"
                ? "bg-[var(--sidebar-active)] text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]",
            )}
          >
            <Home size={18} strokeWidth={1.8} />
            {!sidebarCompact && <span>工作台</span>}
          </WorkspaceLink>
          <div className="space-y-0.5">
            {groupNav(items).map((section, index) => (
              <div key={section.label ?? `g${index}`} className={index > 0 ? "pt-4" : undefined}>
                {/* 收起时不显示组名：16px 宽度放不下，留着只会变成噪音 */}
                {section.label && !sidebarCompact && (
                  <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => (
                  <NavBranch
                    key={item.path}
                    item={item}
                    depth={0}
                    collapsed={sidebarCompact}
                    onNavigate={() => setMobileOpen(false)}
                    onExpand={() => setCollapsed(false)}
                  />
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--sidebar-border)] p-3">
          <div className={cn(sidebarCompact ? "flex h-9 items-center justify-center" : "flex items-center gap-3 px-2 py-1.5")}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--online)] opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--online)]" />
            </span>
            {!sidebarCompact && (
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-[var(--sidebar-foreground)]">服务连接正常</span>
                <span className="block text-[10px] text-[var(--muted-foreground)]">Backend verified</span>
              </span>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-50 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/92 px-3.5 backdrop-blur-xl md:px-4">
          <button
            type="button"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] lg:flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            title={collapsed ? "展开侧栏" : "收起侧栏"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="打开导航">
            <Menu size={19} />
          </button>
          <div className="hidden min-w-0 items-center gap-2 text-xs md:flex">
            <span className="font-semibold text-[var(--foreground)]">Control Plane</span>
            {trails.map((trail) => (
              <React.Fragment key={trail}>
                <ChevronRight size={13} className="text-[var(--muted-foreground)]" />
                <span className="truncate text-[var(--muted-foreground)]">{trail}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label="搜索菜单和页面"
              onClick={() => setSearchOpen(true)}
              className="mr-1 flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs text-[var(--muted-foreground)] shadow-[inset_0_1px_1px_rgba(16,24,40,.025)] transition hover:border-[var(--input)] hover:bg-[var(--card)] md:min-w-[220px]"
            >
              <Search size={15} />
              <span className="hidden md:block">搜索菜单和页面</span>
              <span className="ml-auto hidden items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-xs font-semibold text-[var(--muted-foreground)] md:flex">
                <Command size={9} />K
              </span>
            </button>
            <RefreshButton />
            <button type="button" title={fullscreen ? "退出全屏" : "全屏"} onClick={toggleFullscreen} className="hidden h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:flex">
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              type="button"
              title={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
              aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div ref={noticeRef} className="relative">
              <button
                type="button"
                title="通知"
                onClick={() => {
                  setNoticeOpen((value) => !value);
                  setProfileOpen(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Bell size={17} />
                <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-[#ef8354]" />
              </button>
              {noticeOpen && (
                <div className="absolute right-0 top-12 z-[80] w-72 rounded-xl border border-[var(--border)] bg-[var(--popover)] p-3 text-[var(--popover-foreground)] shadow-2xl">
                  <div className="px-2 pb-2 text-xs font-bold text-[var(--foreground)]">系统通知</div>
                  <div className="flex gap-3 rounded-xl bg-[var(--primary-soft)] p-3">
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><ShieldCheck size={16} /></span>
                    <span><span className="block text-xs font-semibold text-[var(--foreground)]">服务连接正常</span><span className="mt-1 block text-xs leading-4 text-[var(--muted-foreground)]">认证会话与后端菜单已成功加载。</span></span>
                  </div>
                </div>
              )}
            </div>
            <div ref={profileRef} className="relative ml-1 border-l border-[var(--border)] pl-3">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((value) => !value);
                  setNoticeOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-[var(--muted)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--foreground)] text-xs font-semibold text-[var(--background)] shadow-[var(--shadow-xs)]">{initials}</span>
                <span className="hidden min-w-0 text-left md:block">
                  <span className="block max-w-28 truncate text-xs font-semibold text-[var(--foreground)]">{user.nickname || user.username}</span>
                  <span className="block max-w-28 truncate text-[9px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{roles[0] || "会员"}</span>
                </span>
                <ChevronDown size={13} className="hidden text-[var(--muted-foreground)] md:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-[80] w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-md)]">
                  <div className="flex items-center gap-3 p-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--foreground)] text-sm font-semibold text-[var(--background)]">{initials}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--foreground)]">{user.nickname || user.username}</span>{user.username ? <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">@{user.username}</span> : null}</span>
                    <span className="rounded-md bg-[var(--primary-soft)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--primary)]">{roles[0] || "会员"}</span>
                  </div>
                  <div className="mx-3 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5">
                    <ShieldCheck size={15} className="text-[var(--primary)]" />
                    <span><span className="block text-[11px] font-medium text-[var(--foreground)]">安全会话已验证</span><span className="block text-[10px] text-[var(--muted-foreground)]">HttpOnly · Backend verified</span></span>
                  </div>
                  {accountLinks.length > 0 && (
                    <div className="mt-3 border-t border-[var(--border)] p-2">
                      {accountLinks.map(({ to, label, Icon }) => (
                        <WorkspaceLink key={to} to={to} onClick={() => setProfileOpen(false)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]"><Icon size={15} />{label}</WorkspaceLink>
                      ))}
                    </div>
                  )}
                  <div className={cn("border-t border-[var(--border)] p-2", accountLinks.length === 0 && "mt-3")}>
                    <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-500/10"><LogOut size={15} />退出当前会话</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <PageTabs />

        {/*
          持久实例宿主取代原来的单一 outlet。
          原来这里是 `<div key={pathname}>{children}</div>` —— 两个致命点：
            1. 单 outlet：路由一变旧页面就被卸载，页签切换必然丢状态；
            2. `key={pathname}`：宿主 hook 只在浏览器后退时突变，于是「后退」会静默
               炸掉整棵子树，比每次切换都重建更难发现。
          现在滚动容器下沉到每个实例内部（见 WorkspaceHost），所以这里不再 overflow-auto。
        */}
        <main className="front-shell-main relative min-h-0 flex-1 overflow-hidden">
          <WorkspaceHost pages={pages} ui={ui} />
        </main>
      </div>

      <CommandPalette open={searchOpen} items={flatItems} onClose={() => setSearchOpen(false)} />
      </div>
    </FrontClientProvider>
  );
}
