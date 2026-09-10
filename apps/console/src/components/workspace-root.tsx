"use client";

import * as React from "react";
import {
  WorkspaceStore,
  WorkspaceStoreProvider,
  buildWorkspacePages,
  createBrowserHistoryHost,
  type WorkspacePage,
  type WorkspaceUiAdapter,
} from "@neton/application-front-workspace";
import { KitNavigationProvider, PortalHostProvider } from "@neton/application-client-kit";
import type { NavItem } from "@neton/application-client-runtime/menu";
import type { SessionUser } from "@neton/application-client-runtime/client-context";
import { installedModules, pageRegistry } from "@/generated/modules.generated";
import { AppShell } from "@/components/app-shell";
import { consoleNav } from "@/config/console.nav";

/** 本发行版用 client-kit：把它的弹层宿主与导航注入工作区（工作区自身不认识任何 UI 包）。 */
const UI: WorkspaceUiAdapter = {
  PortalHostProvider,
  NavigationProvider: KitNavigationProvider,
};

/** 控制台首页不属于任何模块，作为内置页注入，好让它也是一个正常实例。 */
const HOME_PAGE: WorkspacePage = {
  key: "__home",
  path: "/",
  identity: [],
  title: "概览",
  standalone: true,
  load: () => import("@/components/dashboard").then((m) => ({ default: m.default })),
};

/**
 * 工作区根。
 *
 * 与 admin 线共用同一个工作区运行时；差别只在会话来源：C 端没有后端菜单与 RBAC，
 * 页签标题只能取自 manifest（`title` / 路径末段），导航是产品自己的静态
 * [consoleNav]。
 */
export function WorkspaceRoot({ user }: { user: SessionUser }) {
  const pages = React.useMemo(
    () => [HOME_PAGE, ...buildWorkspacePages(installedModules, pageRegistry)],
    [],
  );

  const [store] = React.useState(() => new WorkspaceStore({
    pages,
    host: createBrowserHistoryHost(),
    homeHref: "/",
    pinHome: true,
    persist: true,
  }));

  React.useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  const nav: NavItem[] = consoleNav;

  return (
    <WorkspaceStoreProvider store={store}>
      <AppShell items={nav} user={user} roles={[]} permissions={[]} pages={pages} ui={UI} />
    </WorkspaceStoreProvider>
  );
}
