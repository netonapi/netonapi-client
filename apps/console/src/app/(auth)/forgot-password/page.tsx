"use client";

import * as React from "react";
import { Alert, Button, Input, Label } from "@neton/application-client-kit";
import { apiErrorFromEnvelope } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useCaptcha } from "@neton/application-client-runtime/captcha-widget";
import { useT } from "@neton/application-client-runtime/i18n";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useSiteBrand } from "@/components/site-brand";

/** 找回密码：邮箱 → 验证码 → 新密码。只对绑定过邮箱的账号有效；后端对未知邮箱也返回成功，不泄露账号存在与否。 */
export default function ForgotPasswordPage() {
  const brand = useSiteBrand();
  const t = useT("console");
  const describeError = useDescribeError("account");
  // 人机验证只挡发码：重置那一步已经要验证码，刷不了短信/邮件
  const captcha = useCaptcha(brand.captcha, "send_code");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function call(body: Record<string, string>, extraHeaders: Record<string, string> = {}) {
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
    if (!res.ok || data?.code !== 0) throw apiErrorFromEnvelope(data, res.status, res.headers);
  }

  async function send() {
    setError(null); setBusy(true);
    try { await call({ action: "send", email }, captcha.headers); setSent(true); setCooldown(60); }
    catch (cause) { setError(describeError(cause)); } finally { setBusy(false); captcha.reset(); }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError(t("forgot.mismatch")); return; }
    setBusy(true);
    try { await call({ action: "reset", email, code, newPassword: password }); setDone(true); }
    catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="mx-auto flex h-20 w-full max-w-[1280px] items-center px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em]">{brand.name}</div>
            {brand.tagline && (
              <div className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted-foreground)]">{brand.tagline}</div>
            )}
          </div>
        </div>
        <LocaleSwitcher className="ml-auto flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 text-[var(--muted-foreground)] shadow-sm" />
      </header>
      <section className="mx-auto flex w-full max-w-[420px] flex-col px-5 pb-16 pt-6 sm:px-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("forgot.title")}</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t("forgot.subtitle")}</p>
        {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
        {done ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm">
            {t("forgot.doneBefore")}<a href="/login" className="ml-1 font-medium text-[var(--primary)] hover:underline">{t("forgot.doneLink")}</a>{t("forgot.doneAfter")}
          </div>
        ) : (
          <form onSubmit={(e) => void reset(e)} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("forgot.email")}</Label>
              <div className="flex gap-2">
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="h-11 bg-[var(--background)] px-3.5" />
                <Button type="button" variant="outline" onClick={() => void send()} disabled={busy || cooldown > 0 || !email.includes("@") || !captcha.ready} className="h-11 shrink-0">
                  {cooldown > 0 ? `${cooldown}s` : sent ? t("forgot.resend") : t("forgot.send")}
                </Button>
              </div>
            </div>
            {captcha.widget}
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("forgot.code")}</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("forgot.codePlaceholder")} inputMode="numeric" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("forgot.newPassword")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("forgot.confirm")}</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <Button type="submit" disabled={busy || !sent || !code || password.length < 8} className="h-11 w-full">{busy ? t("forgot.submitting") : t("forgot.submit")}</Button>
            <p className="text-center text-sm text-[var(--muted-foreground)]">{t("forgot.remembered")}<a href="/login" className="font-medium text-[var(--primary)] hover:underline">{t("forgot.backToLogin")}</a></p>
          </form>
        )}
      </section>
    </main>
  );
}
