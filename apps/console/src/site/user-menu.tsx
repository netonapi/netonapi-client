"use client";

import * as React from "react";
import { CircleUserRound, LogOut } from "lucide-react";
import { consoleHref, loginHref } from "@neton/application-client-runtime/public";
import { usePublicSession } from "@neton/application-client-runtime/public-client";
import { useT } from "@neton/application-client-runtime/i18n";

/** 用户菜单里的一项：`label` 是 `site` 命名空间的词条 key，`path` 是控制台内路径（如 `/interaction/favorites`）。 */
export interface UserMenuLink { label: string; path: string }

/**
 * 页头的用户入口（客户端岛）。服务端与水合首帧都渲染「登录」按钮（匿名态，缓存安全）；
 * 拿到会话后换成头像与菜单：会员中心、外壳给的常用入口（[links]，如「我的收藏」「我的足迹」）、退出。
 * 登录链接带上当前地址，登录后回到这一页。
 */
export function PublicUserMenu({ links = [] }: { links?: UserMenuLink[] }) {
  const t = useT("site");
  const { state, consoleBasePath, refresh } = usePublicSession();
  const [here, setHere] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setHere(`${window.location.pathname}${window.location.search}`); }, []);

  if (state.status !== "authenticated") {
    return (
      <a href={loginHref(here, consoleBasePath)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]" aria-busy={state.status === "loading"}>
        <CircleUserRound size={16} aria-hidden />
        {t("user.login")}
      </a>
    );
  }

  async function logout() {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { "X-Neton-Csrf": "1" } }).catch(() => null);
    if (res?.ok) { setOpen(false); refresh(); }
  }

  const { user } = state;
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("user.menu")} onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-full border border-[var(--border)] p-1 text-sm font-medium sm:pr-3">
        {user.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={user.avatar} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
          : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><CircleUserRound size={16} aria-hidden /></span>}
        {/* 窄屏只显示头像：昵称（新账号是打码的手机号）会把页头撑出视口，手机上整页被缩放、吸底条落到屏幕外 */}
        <span className="hidden max-w-[8rem] truncate sm:inline">{user.nickname}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          <a role="menuitem" href={consoleHref("/", consoleBasePath)} className="block px-3 py-2 text-sm hover:bg-[var(--muted)]">{t("user.console")}</a>
          {links.map((link) => (
            <a key={link.path} role="menuitem" href={consoleHref(link.path, consoleBasePath)} className="block px-3 py-2 text-sm hover:bg-[var(--muted)]">{t(link.label)}</a>
          ))}
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"><LogOut size={14} aria-hidden />{t("user.logout")}</button>
        </div>
      )}
    </div>
  );
}
