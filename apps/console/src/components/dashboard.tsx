"use client";

import { AppWindow, ShieldCheck, Sparkles } from "lucide-react";
import { useSession } from "@neton/application-client-runtime/client-context";
import { useT } from "@neton/application-client-runtime/i18n";
import { installedModules } from "@/generated/modules.generated";

export default function Dashboard() {
  const { user } = useSession();
  const t = useT("console");
  const hour = new Date().getHours();
  const greeting = hour < 6 ? t("dashboard.greetingNight") : hour < 12 ? t("dashboard.greetingMorning") : hour < 18 ? t("dashboard.greetingAfternoon") : t("dashboard.greetingEvening");

  return (
    <div className="space-y-5">
      <section className="front-surface relative overflow-hidden rounded-xl px-6 py-7 md:px-8 md:py-9">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[34px] border-[var(--foreground)]/[0.035]" />
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--primary)]">
          <Sparkles size={12} /> CONSOLE OVERVIEW
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] md:text-3xl">
          {t("dashboard.greeting", { greeting, name: user.nickname || user.username })}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">
          {t("dashboard.ready")}
        </p>
      </section>

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
              <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-[var(--primary-soft)] p-4 text-xs leading-5 text-[var(--muted-foreground)]">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--primary)]" />
          {t("dashboard.session")}
        </div>
      </section>
    </div>
  );
}
