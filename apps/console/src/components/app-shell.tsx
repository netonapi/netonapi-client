"use client";

import * as React from "react";
import {
  WorkspaceHost,
  WorkspaceLink,
  instanceTitle,
  useWorkspace,
  useWorkspaceLinkDelegation,
  useWorkspaceStore,
  WorkspaceStore,
  type WorkspacePage,
  type WorkspaceUiAdapter,
} from "@neton/application-front-workspace";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Boxes,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  CreditCard,
  Database,
  FileText,
  History,
  Home,
  IdCard,
  KeyRound,
  Languages,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  Network,
  Search,
  Settings,
  Share2,
  Smartphone,
  Star,
  Sun,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { NavItem } from "@neton/application-client-runtime/menu";
import type { PermissionInfo } from "@neton/application-client-runtime/types";
import { FrontClientProvider } from "@neton/application-client-runtime/client-context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  TooltipProvider,
  useSidebar,
} from "@neton/application-client-kit";
import { memberInitial } from "@neton/application-client-runtime/types";
import { useLocale, useT } from "@neton/application-client-runtime/i18n";
import { BrandMark } from "./brand-mark";
import { ConsoleHeaderActions } from "./console-header-actions";
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
  star: Star,
  history: History,
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

/** 语言名用各自语言书写，切换前后都认得出来。 */
const LANGUAGE_NAMES: Record<string, string> = { "zh-CN": "简体中文", "en-US": "English" }; // i18n-exempt: 语言自称

function isUnder(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** 窄屏下点了导航要收起抽屉；桌面端什么也不做。 */
function useCloseMobile(): () => void {
  const { isMobile, setOpenMobile } = useSidebar();
  return React.useCallback(() => { if (isMobile) setOpenMobile(false); }, [isMobile, setOpenMobile]);
}

/** 一个导航项：叶子是工作区链接；有子项的是可折叠分组（收成图标栏时，点它先展开侧栏）。 */
function NavItemRow({ item }: { item: NavItem }) {
  const pathname = useActivePath();
  const { state, isMobile, setOpen: setSidebarOpen } = useSidebar();
  const closeMobile = useCloseMobile();
  const active = isUnder(pathname, item.path);
  const [open, setOpen] = React.useState(active);
  const Icon = resolveIcon(item.icon);

  React.useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (!item.children?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === item.path} tooltip={item.name}>
          <WorkspaceLink to={item.path} onClick={closeMobile}>
            <Icon strokeWidth={1.8} />
            <span>{item.name}</span>
          </WorkspaceLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.name}
        isActive={active && state === "collapsed" && !isMobile}
        aria-expanded={open}
        onClick={() => {
          if (state === "collapsed" && !isMobile) { setSidebarOpen(true); setOpen(true); return; }
          setOpen((value) => !value);
        }}
      >
        <Icon strokeWidth={1.8} />
        <span>{item.name}</span>
        <ChevronRight className={cn("ml-auto transition-transform duration-200", open && "rotate-90")} aria-hidden />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {item.children.map((child) => (
            <SidebarMenuSubItem key={child.path}>
              <SidebarMenuSubButton asChild isActive={isUnder(pathname, child.path)}>
                <WorkspaceLink to={child.path} onClick={closeMobile}>
                  <span>{child.name}</span>
                </WorkspaceLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

function NavMain({ items, onSearch }: { items: NavItem[]; onSearch(): void }) {
  const pathname = useActivePath();
  const closeMobile = useCloseMobile();
  const t = useT("console");
  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t("search.open")} onClick={() => { closeMobile(); onSearch(); }} className="text-[var(--muted-foreground)]">
              <Search strokeWidth={1.8} />
              <span>{t("search.short")}</span>
              <kbd className="ml-auto max-lg:hidden rounded border border-[var(--sidebar-border)] bg-[var(--background)] px-1.5 text-[10px] font-medium text-[var(--muted-foreground)] group-data-[collapsible=icon]:hidden">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/"} tooltip={t("nav.home")}>
              <WorkspaceLink to="/" onClick={closeMobile}>
                <Home strokeWidth={1.8} />
                <span>{t("nav.home")}</span>
              </WorkspaceLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {groupNav(items).map((section, index) => (
        <SidebarGroup key={section.label ?? `g${index}`}>
          {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
          <SidebarMenu>
            {section.items.map((item) => <NavItemRow key={item.path} item={item} />)}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

/** 左下角的账户菜单：个人中心入口、外观、语言、退出——用户端的全部全局设置都收在这里。 */
function NavUser({
  user,
  accountLinks,
  darkMode,
  onThemeChange,
  onLogout,
}: {
  user: FrontUser;
  accountLinks: Array<{ to: string; label: string; Icon: LucideIcon }>;
  darkMode: boolean;
  onThemeChange(dark: boolean): void;
  onLogout(): void;
}) {
  const t = useT("console");
  const store = useWorkspaceStore();
  const { locale, locales, setLocale } = useLocale();
  const { isMobile } = useSidebar();
  const closeMobile = useCloseMobile();
  const name = user.nickname || user.username;
  // 展示名可能是打码手机号（短信注册没有昵称），取不到字母 / 汉字就显示用户图标
  const initial = memberInitial(user) || <UserRound className="h-4 w-4" />;
  const identity = (
    <>
      <Avatar>
        {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium text-[var(--foreground)]">{name}</span>
        {user.username && user.username !== name ? <span className="truncate text-xs text-[var(--muted-foreground)]">@{user.username}</span> : null}
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={name} aria-label={t("account.menu")}>
              {identity}
              <ChevronsUpDown className="ml-auto h-4 w-4 text-[var(--muted-foreground)]" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" sideOffset={8} className="w-60">
            <div className="flex items-center gap-2 px-1 py-1.5">{identity}</div>
            {accountLinks.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {accountLinks.map(({ to, label, Icon }) => (
                    <DropdownMenuItem key={to} onSelect={() => { closeMobile(); store.open(to); }}>
                      <Icon />{label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{darkMode ? <Moon /> : <Sun />}{t("theme.label")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={darkMode ? "dark" : "light"} onValueChange={(value) => onThemeChange(value === "dark")}>
                    <DropdownMenuRadioItem value="light">{t("theme.lightName")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">{t("theme.darkName")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {locales.length > 1 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Languages />{t("locale.label")}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
                      {locales.map((l) => <DropdownMenuRadioItem key={l} value={l}>{LANGUAGE_NAMES[l] ?? l}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onLogout}>
              <LogOut />{t("account.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
  const t = useT("console");
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
    <div className="fixed inset-0 z-[140] flex items-start justify-center bg-[var(--overlay)] px-4 pt-[14vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.label")}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-md)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder={t("search.placeholder")}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1">
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
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)]"
              >
                <Icon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                <span className="truncate text-[var(--foreground)]">{item.name}</span>
                {item.trail.length > 1 && <span className="ml-auto truncate text-xs text-[var(--muted-foreground)]">{item.trail.slice(0, -1).join(" / ")}</span>}
              </button>
            );
          }) : (
            <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">{t("search.empty")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 顶栏：侧栏开关、当前页标题（嵌套页面带上所属分组）、模块贡献的页头动作。 */
function SiteHeader({ trail }: { trail: string[] }) {
  const t = useT("console");
  const title = trail.at(-1);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
      <SidebarTrigger label={t("nav.toggle")} />
      <Separator orientation="vertical" className="mx-1 !h-4" />
      <nav aria-label={t("nav.breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.slice(0, -1).map((parent) => (
          <React.Fragment key={parent}>
            <span className="hidden truncate text-[var(--muted-foreground)] md:inline">{parent}</span>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] md:inline" aria-hidden />
          </React.Fragment>
        ))}
        <h1 className="truncate text-sm font-medium text-[var(--foreground)]">{title}</h1>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <ConsoleHeaderActions />
      </div>
    </header>
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
  const { instances, activeId } = useWorkspace();
  const flatItems = React.useMemo(() => flattenNav(items), [items]);
  // 迁移垫片：接管尚未换成 WorkspaceLink 的原生 <a href>（业务模块里还有）。
  useWorkspaceLinkDelegation(pages);
  const current = flatItems.find((item) => item.path === pathname)
    ?? [...flatItems].sort((a, b) => b.path.length - a.path.length).find((item) => pathname.startsWith(`${item.path}/`));
  const brand = useSiteBrand();
  const t = useT("console");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(false);
  // 个人中心入口只在对应页面已装配时出现：发行版可以不装 client-account，菜单不能指向不存在的页面
  const accountLinks = [
    { to: "/account/profile", label: t("account.profile"), Icon: UserRound },
    { to: "/account/password", label: t("account.password"), Icon: KeyRound },
  ].filter((link) => pages.some((page) => page.path === link.to));

  React.useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() {
    // C 端仍走 Node 代理清 Cookie（保留 SSR 形态，见受保护布局的注释）。
    WorkspaceStore.clearPersisted();
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { "X-Neton-Csrf": "1" } }).catch(() => null);
    // 退出失败时不跳走：会话仍然有效，不能让人以为已经退出（评审 R04）。
    if (!res?.ok) { window.alert(t("account.logoutFailed")); return; }
    window.location.href = "/login";
  }

  function setTheme(dark: boolean) {
    setDarkMode(dark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    localStorage.setItem("neton-client-theme", dark ? "dark" : "light");
  }

  const activeInstance = instances.find((i) => i.instanceId === activeId);
  const activeTitle = activeInstance ? instanceTitle(activeInstance) : t("nav.page");
  const trail = pathname === "/"
    ? [t("nav.home")]
    : current ? [...current.trail, ...(pathname === current.path ? [] : [activeTitle])] : [activeTitle];

  return (
    <FrontClientProvider permissions={permissions} roles={roles} user={user}>
      <TooltipProvider>
        <SidebarProvider>
          <Sidebar mobileLabel={t("nav.sidebar")}>
            <SidebarHeader>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild size="lg" tooltip={brand.name}>
                    <WorkspaceLink to="/">
                      <BrandMark className="h-8 w-8" />
                      <span className="grid min-w-0 flex-1 text-left leading-tight">
                        <span className="truncate text-sm font-semibold text-[var(--foreground)]">{brand.name}</span>
                        {brand.tagline && <span className="truncate text-xs text-[var(--muted-foreground)]">{brand.tagline}</span>}
                      </span>
                    </WorkspaceLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
              <NavMain items={items} onSearch={() => setSearchOpen(true)} />
            </SidebarContent>
            <SidebarFooter>
              <NavUser user={user} accountLinks={accountLinks} darkMode={darkMode} onThemeChange={setTheme} onLogout={logout} />
            </SidebarFooter>
          </Sidebar>

          <SidebarInset>
            <SiteHeader trail={trail} />
            {/* 单实例工作区：同一时刻只挂一个页面，滚动容器在实例内部（见 WorkspaceHost）。 */}
            <div className="front-shell-main relative min-h-0 flex-1 overflow-hidden">
              <WorkspaceHost pages={pages} ui={ui} />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <CommandPalette open={searchOpen} items={flatItems} onClose={() => setSearchOpen(false)} />
      </TooltipProvider>
    </FrontClientProvider>
  );
}
