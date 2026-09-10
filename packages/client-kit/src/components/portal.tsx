"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * 弹层宿主。默认 `document.body`；工作区会为**每个页面实例**提供各自的容器。
 *
 * 为什么必须可注入：多个实例同时挂载时，抽屉/确认框若统一挂 body，隐藏页签的
 * 弹层会和当前页签的弹层同处一层，层级、焦点和 Escape 都会互相干扰。挂到实例
 * 自己的容器里，容器随实例隐藏而隐藏，归属天然正确。
 */
const PortalHostContext = React.createContext<(() => Element | null) | null>(null);

export function PortalHostProvider({ container, children }: { container: () => Element | null; children: React.ReactNode }) {
  return <PortalHostContext.Provider value={container}>{children}</PortalHostContext.Provider>;
}

export interface PortalProps {
  children: React.ReactNode;
}

export function Portal({ children }: PortalProps) {
  const resolve = React.useContext(PortalHostContext);
  const [target, setTarget] = React.useState<Element | null>(null);

  React.useEffect(() => {
    setTarget(resolve?.() ?? document.body);
  }, [resolve]);

  return target ? createPortal(children, target) : null;
}
