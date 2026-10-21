"use client";

import * as React from "react";

/** 客户端插槽的错误边界：岛屿出错只让它自己消失，页面其余部分照常（public-routes §10.2）。 */
export class ClientSlotBoundary extends React.Component<{ id: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[site] slot ${this.props.id} failed`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
