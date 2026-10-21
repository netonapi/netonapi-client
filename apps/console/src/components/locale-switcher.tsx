"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import { useLocale, useT } from "@neton/application-client-runtime/i18n";

/** 语言名用各自语言书写，切换前后都认得出来。 */
const LANGUAGE_NAMES: Record<string, string> = { "zh-CN": "简体中文", "en-US": "English" }; // i18n-exempt: 语言自称

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, locales, setLocale } = useLocale();
  const t = useT("console");
  if (locales.length < 2) return null;
  return (
    <label className={className ?? "flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 text-[var(--muted-foreground)] shadow-sm"}>
      <Languages size={14} aria-hidden />
      <span className="sr-only">{t("locale.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        className="bg-transparent text-xs text-[var(--foreground)] outline-none"
      >
        {locales.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l] ?? l}</option>)}
      </select>
    </label>
  );
}
