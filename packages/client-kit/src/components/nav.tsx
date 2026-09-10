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
  open(href: string): void;
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
 * 站内链接。始终渲染真 `<a href>` —— 中键、Ctrl/Cmd+点击、右键新标签页、复制链接
 * 地址都必须照常可用；只有普通左键点击才交给适配器接管。
 */
export function KitLink({ href, onClick, ...rest }: KitLinkProps) {
  const navigation = useKitNavigation();
  return (
    <a
      {...rest}
      href={href}
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
