"use client";

import * as React from "react";
import {
  WorkspaceLabelsProvider,
  WorkspaceStore,
  WorkspaceStoreProvider,
  buildWorkspacePages,
  createBrowserHistoryHost,
  type WorkspaceLabels,
  type WorkspacePage,
  type WorkspaceUiAdapter,
} from "@neton/application-front-workspace";
import { KitNavigationProvider, PortalHostProvider } from "@neton/application-client-kit";
import type { NavItem } from "@neton/application-client-runtime/menu";
import type { SessionUser } from "@neton/application-client-runtime/client-context";
import { useT } from "@neton/application-client-runtime/i18n";
import { installedModules, pageRegistry } from "@/generated/modules.generated";
import { AppShell } from "@/components/app-shell";
import { consoleNav } from "@/config/console.nav";

/** 本发行版用 client-kit：把它的弹层宿主与导航注入工作区（工作区自身不认识任何 UI 包）。 */
const UI: WorkspaceUiAdapter = {
  PortalHostProvider,
  NavigationProvider: KitNavigationProvider,
};

/** 控制台首页不属于任何模块，作为内置页注入，好让它也是一个正常实例。 */
function homePage(title: string): WorkspacePage {
  return {
    key: "__home",
    path: "/",
    identity: [],
    title,
    standalone: true,
    load: () => import("@/components/dashboard").then((m) => ({ default: m.default })),
  };
}

/**
 * 工作区根。
 *
 * 与 admin 线共用同一个工作区运行时；差别只在会话来源：C 端没有后端菜单与 RBAC，
 * 页签标题取侧栏名（consoleNav），其次 manifest 的 `title`，最后才是路径末段；导航是产品自己的静态
 * [consoleNav]。
 */
export function WorkspaceRoot({ user, basePath }: { user: SessionUser; basePath: string }) {
  const t = useT("console");
  const labels = React.useMemo<WorkspaceLabels>(() => ({
    loading: t("workspace.loading"),
    renderFailed: (title) => t("workspace.renderFailed", { title }),
    loadFailed: (title) => t("workspace.loadFailed", { title }),
    staleVersion: t("workspace.staleVersion"),
    retry: t("workspace.retry"),
    reload: t("workspace.reload"),
    confirmCloseDirty: (title) => t("workspace.confirmCloseDirty", { title }),
  }), [t]);
  // consoleNav 的 name 是词条 key（menu.*）；没有对应词条就原样显示。
  const nav = React.useMemo<NavItem[]>(
    () => consoleNav.map((item) => ({ ...item, name: t.has(item.name) ? t(item.name) : item.name })),
    [t],
  );
  const pages = React.useMemo(() => {
    // manifest 的 title 按当前语言取 `title.<页面 key>`，没有词条就用原文
    const modules = installedModules.map((m) => ({
      ...m,
      pages: m.pages.map((p) => (p.title && t.has(`title.${p.key}`) ? { ...p, title: t(`title.${p.key}`) } : p)),
    }));
    // 侧栏名就是页签标题（与管理台用菜单名同理）；不传则退回路径末段，页签上会出现 key / usage 这种英文
    return [homePage(t("title.home")), ...buildWorkspacePages(modules, pageRegistry, Object.fromEntries(nav.map((item) => [item.path, item.name])))];
  }, [t, nav]);

  const [store] = React.useState(() => new WorkspaceStore({
    pages,
    // 控制台挂在 consoleBasePath 下（门户产品如 /my）；工作区内部地址不带前缀
    host: createBrowserHistoryHost({ basePath }),
    homeHref: "/",
    pinHome: true,
    // 按身份域 + 用户隔离：换人登录不会恢复出上一个人的页签（评审 R19）。
    persist: { scope: `account:${user.userId}` },
  }));

  React.useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  // 语言切换或词条加载完成后页面表会变：已打开的页签原样保留，只更新默认标题（不丢未保存内容）。
  React.useEffect(() => { store.updatePages(pages); }, [store, pages]);

  return (
    <WorkspaceStoreProvider store={store}>
      <WorkspaceLabelsProvider labels={labels}>
        <AppShell items={nav} user={user} roles={[]} permissions={[]} pages={pages} ui={UI} />
      </WorkspaceLabelsProvider>
    </WorkspaceStoreProvider>
  );
}
