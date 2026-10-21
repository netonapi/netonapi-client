"use client";

/**
 * 登录 / 注册页的跳回规则（public-routes §9.2）：成功后回到 `?next=`（只认本站相对路径，见
 * safeNextPath），没有或不合格时进控制台首页；在登录、注册、找回密码之间切换时带着 next 走。
 */
import * as React from "react";
import { consoleHref, safeNextPath } from "@neton/application-client-runtime/public";
import { site } from "@/generated/site.generated";

const home = () => consoleHref("/", site.consoleBasePath);

/** 登录 / 注册成功后去哪（只在事件处理里调，读当前地址）。 */
export function afterAuthTarget(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), home());
}

/**
 * 认证页之间的链接，保留合格的 next。首帧与服务端一致（不带 next），水合后再补上——
 * 认证页是静态页面，服务端不读查询参数。
 */
export function useAuthPageHref(path: "/login" | "/register" | "/forgot-password"): string {
  const [href, setHref] = React.useState<string>(path);
  React.useEffect(() => {
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"), home());
    setHref(next === home() ? path : `${path}?next=${encodeURIComponent(next)}`);
  }, [path]);
  return href;
}
