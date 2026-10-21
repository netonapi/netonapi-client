"use client";

/**
 * 公开页的会话水合（public-routes §9.1）。服务端一律按「未登录」出 HTML（缓存里没有任何个性化数据）；
 * 水合后请求一次 `GET /api/session`（private, no-store），页头用户菜单、评论框、收藏按钮都从这里读。
 */
import * as React from "react";
import { loginHref } from "../public/next-path";

export interface PublicSessionUser { userId: string; nickname: string; avatar: string }

export type PublicSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: PublicSessionUser };

interface PublicSessionValue {
  state: PublicSessionState;
  refresh(): void;
  consoleBasePath: string;
}

const PublicSessionContext = React.createContext<PublicSessionValue | null>(null);

export function PublicSessionProvider({ consoleBasePath, children }: { consoleBasePath: string; children: React.ReactNode }) {
  // 首帧必须与服务端 HTML 一致：先是 loading，水合后再取（§9.5）
  const [state, setState] = React.useState<PublicSessionState>({ status: "loading" });
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((res) => res.json())
      .then((body: { code?: number; data?: { authenticated?: boolean; user?: PublicSessionUser } }) => {
        const user = body.code === 0 && body.data?.authenticated ? body.data.user : undefined;
        setState(user ? { status: "authenticated", user } : { status: "anonymous" });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "anonymous" }); });
    return () => controller.abort();
  }, [version]);
  const value = React.useMemo(() => ({ state, refresh: bump, consoleBasePath }), [state, consoleBasePath]);
  return <PublicSessionContext.Provider value={value}>{children}</PublicSessionContext.Provider>;
}

export function usePublicSession(): PublicSessionValue {
  const value = React.useContext(PublicSessionContext);
  if (!value) throw new Error("PublicSessionProvider is missing: public pages are wrapped by the base (public) layout.");
  return value;
}

/**
 * 需要登录的操作在匿名时调用：整页跳到 `/login?next=<当前路径 + returnTo 锚点>`，登录后回来（§9.2）。
 * `returnTo` 可以是锚点（`#comments`）或站内路径。
 */
export function requireLogin(options: { returnTo?: string; consoleBasePath: string }): void {
  const here = `${window.location.pathname}${window.location.search}`;
  const target = !options.returnTo ? `${here}${window.location.hash}`
    : options.returnTo.startsWith("#") ? `${here}${options.returnTo}` : options.returnTo;
  window.location.assign(loginHref(target, options.consoleBasePath));
}

/** 组件里用：`const login = useRequireLogin(); if (anonymous) login("#comments")`。 */
export function useRequireLogin(): (returnTo?: string) => void {
  const { consoleBasePath } = usePublicSession();
  return React.useCallback((returnTo?: string) => requireLogin({ returnTo, consoleBasePath }), [consoleBasePath]);
}
