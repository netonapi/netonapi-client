"use client";

import * as React from "react";
import { AppWindow } from "lucide-react";
import { useSession } from "@neton/application-client-runtime/client-context";
import { useLocale, useT } from "@neton/application-client-runtime/i18n";
import { selectSlotContributions } from "@neton/application-client-runtime/public";
import { consoleSlotRegistry, installedModules } from "@/generated/modules.generated";
import { site } from "@/generated/site.generated";
import { ClientSlotBoundary } from "@/site/slot-boundary";

// 与其它插槽同一套排序与隐藏规则；每个贡献按需加载一次（模块作用域：首页重渲染不重复创建懒组件）
const widgets = selectSlotContributions("console.home", consoleSlotRegistry.map((s) => s.contribution), {}, site.slots)
  .map((contribution) => ({ id: contribution.id, Component: React.lazy(consoleSlotRegistry.find((s) => s.contribution === contribution)!.load) }));

/**
 * 控制台首页（public-routes §10.2 `console.home`）：问候 + 各模块的概览卡片（未读回复、最近收藏、投稿状态……），
 * 每张卡片是模块的客户端岛，按需加载、各自取数、各自出错（错误边界只让它自己消失）。没有模块贡献概览时
 * 列出已装配的模块（底座自带的空控制台）。
 */
export default function Dashboard() {
  const { user } = useSession();
  const { locale } = useLocale();
  const t = useT("console");
  const hour = new Date().getHours();
  const greeting = hour < 6 ? t("dashboard.greetingNight") : hour < 12 ? t("dashboard.greetingMorning") : hour < 18 ? t("dashboard.greetingAfternoon") : t("dashboard.greetingEvening");

  return (
    <div className="space-y-5">
      <section className="front-surface rounded-xl px-6 py-6 md:px-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[var(--foreground)] md:text-2xl">
          {t("dashboard.greeting", { greeting, name: user.nickname || user.username })}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{widgets.length ? t("dashboard.overview") : t("dashboard.ready")}</p>
      </section>

      {widgets.length ? (
        <div className="grid gap-5 lg:grid-cols-2" data-console-home="">
          {widgets.map(({ id, Component }) => (
            <ClientSlotBoundary key={id} id={id}>
              <React.Suspense fallback={<div className="front-surface h-40 animate-pulse rounded-xl" aria-hidden />}>
                <Component locale={locale} />
              </React.Suspense>
            </ClientSlotBoundary>
          ))}
        </div>
      ) : (
        <section className="front-surface rounded-xl p-5 md:p-6">
          <h2 className="text-base font-bold text-[var(--foreground)]">{t("dashboard.distribution")}</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("dashboard.distributionNote", { count: installedModules.length })}</p>
          <div className="mt-5 space-y-3">
            {installedModules.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted-foreground)]">
                {t("dashboard.noModules")}
              </div>
            )}
            {installedModules.map((module) => (
              <div key={module.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-white"><AppWindow size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[var(--foreground)]">{module.id}</span><span className="block text-xs text-[var(--muted-foreground)]">contract {module.contractVersion}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
