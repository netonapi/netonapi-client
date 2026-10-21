"use client";

import * as React from "react";

/**
 * 导航适配器。
 *
 * front-kit 不认识工作区（那会形成循环依赖：front-workspace 依赖 front-kit），
 * 所以这里只声明一个「怎么打开一个站内地址」的接口，由宿主注入。没注入时
 * [KitLink] 退化成普通 `<a href>`，行为与改造前一致。
 */
export interface KitNavigation {
  /** 打开一个站内地址（工作区地址，不带宿主的路径前缀）。 */
  open(href: string): void;
  /** 工作区地址 → 浏览器地址（宿主挂在路径前缀下时加前缀），用于渲染 `<a href>`。 */
  hrefOf(href: string): string;
}

const KitNavigationContext = React.createContext<KitNavigation | null>(null);

export function KitNavigationProvider({ navigation, children }: { navigation: KitNavigation; children: React.ReactNode }) {
  return <KitNavigationContext.Provider value={navigation}>{children}</KitNavigationContext.Provider>;
}

export function useKitNavigation(): KitNavigation | null {
  return React.useContext(KitNavigationContext);
}

export interface KitLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/**
 * 站内链接。`href` 是工作区地址（与 manifest 的 path 同一套）。始终渲染真 `<a href>`（宿主挂在前缀下时
 * 自动加前缀）—— 中键、Ctrl/Cmd+点击、右键新标签页、复制链接地址都必须照常可用；只有普通左键点击才交给
 * 适配器接管。
 */
export function KitLink({ href, onClick, ...rest }: KitLinkProps) {
  const navigation = useKitNavigation();
  return (
    <a
      {...rest}
      href={navigation ? navigation.hrefOf(href) : href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !navigation) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigation.open(href);
      }}
    />
  );
}
