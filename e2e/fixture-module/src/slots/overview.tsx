"use client";

import type { SiteSlotProps } from "@neton/application-client-runtime/public";

/** 控制台首页插槽 `console.home`：按需加载的模块概览卡片，验证首页渲染它（e2e）。 */
export default function OverviewSlot({ locale }: SiteSlotProps) {
  return <section data-testid="console-overview" data-locale={locale} className="front-surface rounded-xl p-5">overview</section>;
}
