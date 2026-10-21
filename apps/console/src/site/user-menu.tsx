"use client";

import * as React from "react";
import { CircleUserRound, LogOut } from "lucide-react";
import { consoleHref, loginHref } from "@neton/application-client-runtime/public";
import { usePublicSession } from "@neton/application-client-runtime/public-client";
import { useT } from "@neton/application-client-runtime/i18n";

/**
 * 页头的用户入口（客户端岛）。服务端与水合首帧都渲染「登录」按钮（匿名态，缓存安全）；
 * 拿到会话后换成头像与菜单。登录链接带上当前地址，登录后回到这一页。
 */
export function PublicUserMenu() {
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
        className="flex h-9 items-center gap-2 rounded-full border border-[var(--border)] pl-1 pr-3 text-sm font-medium">
        {user.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={user.avatar} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
          : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><CircleUserRound size={16} aria-hidden /></span>}
        <span className="max-w-[8rem] truncate">{user.nickname}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          <a role="menuitem" href={consoleHref("/", consoleBasePath)} className="block px-3 py-2 text-sm hover:bg-[var(--muted)]">{t("user.console")}</a>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"><LogOut size={14} aria-hidden />{t("user.logout")}</button>
        </div>
      )}
    </div>
  );
}
