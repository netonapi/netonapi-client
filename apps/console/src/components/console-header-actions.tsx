"use client";

import * as React from "react";
import { useLocale } from "@neton/application-client-runtime/i18n";
import { selectSlotContributions } from "@neton/application-client-runtime/public";
import { PublicSessionProvider } from "@neton/application-client-runtime/public-client";
import { consoleSlotRegistry } from "@/generated/modules.generated";
import { site } from "@/generated/site.generated";
import { ClientSlotBoundary } from "@/site/slot-boundary";

// 与门户插槽同一套排序与隐藏规则；每个贡献按需加载一次（模块作用域：页头重渲染不重复创建懒组件）
const lazySlots = selectSlotContributions("console.header.actions", consoleSlotRegistry.map((s) => s.contribution), {}, site.slots)
  .map((contribution) => ({ id: contribution.id, Component: React.lazy(consoleSlotRegistry.find((s) => s.contribution === contribution)!.load) }));

/**
 * 控制台页头的插槽 `console.header.actions`（public-routes §10.2）：模块的客户端岛（如「回复我的」红点），
 * 与门户的页头贡献是同一个组件，所以外面同样挂会话水合（PublicSessionProvider，一次 `/api/session`）。
 */
export function ConsoleHeaderActions() {
  const { locale } = useLocale();
  if (!lazySlots.length) return null;
  return (
    <PublicSessionProvider consoleBasePath={site.consoleBasePath}>
      {lazySlots.map(({ id, Component }) => (
        <ClientSlotBoundary key={id} id={id}>
          <React.Suspense fallback={null}><Component locale={locale} /></React.Suspense>
        </ClientSlotBoundary>
      ))}
    </PublicSessionProvider>
  );
}
