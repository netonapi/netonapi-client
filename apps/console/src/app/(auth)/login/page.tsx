"use client";

import * as React from "react";
import { ArrowRight, Check, Eye, EyeOff, Fingerprint, KeyRound, MessageSquareText, Moon, ShieldCheck, Sun } from "lucide-react";
import { Alert, Button, Input, Label } from "@neton/application-client-kit";
import type { LoginMethod } from "@neton/application-client-contract";
import { ApiError, apiErrorFromEnvelope, apiWrite } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useCaptcha } from "@neton/application-client-runtime/captcha-widget";
import { useT } from "@neton/application-client-runtime/i18n";
import { CALLING_CODES } from "@neton/application-client-runtime/types";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useSiteBrand } from "@/components/site-brand";
import { site } from "@/generated/site.generated";
import { afterAuthTarget, useAuthPageHref } from "@/lib/auth-flow";

/** 发码后的冷却秒数（与后端发码限流同一量级；倒计时只是体验，真正的限制在后端）。 */
const RESEND_SECONDS = 60;
/** 登录场景（AccountSendSmsCodeRequest.scene = SmsScene.LOGIN）。 */
const SMS_SCENE_LOGIN = 1;

async function postAuth(path: string, body: unknown, headers: Record<string, string>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Neton-Csrf": "1", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (data?.code === 0) return;
  throw apiErrorFromEnvelope(data, res.status, res.headers);
}

/**
 * 登录页：门户与控制台共用。登录方式与顺序取站点配置 `auth.loginMethods`（后端仍按自己的注册策略校验）；
 * 成功后回到 `?next=`（public-routes §9.2）。整页跳转——对密码管理器与人机验证最友好。
 */
export default function LoginPage() {
  const brand = useSiteBrand();
  const t = useT("console");
  const describeError = useDescribeError("account");
  const methods = site.auth.loginMethods;
  const [method, setMethod] = React.useState<LoginMethod>(methods[0]!);
  const [error, setError] = React.useState<string | null>(null);
  const [darkMode, setDarkMode] = React.useState(false);
  const registerHref = useAuthPageHref("/register");
  const forgotHref = useAuthPageHref("/forgot-password");

  React.useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem("neton-client-theme", next ? "dark" : "light");
  }

  const onFailure = React.useCallback((e: unknown) => {
    // 后端给了机器码就翻译它；连不上（fetch 抛 TypeError）才说网络问题
    setError(e instanceof ApiError ? describeError(e) : t("login.networkError"));
  }, [describeError, t]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.42] dark:opacity-[0.18]" style={{ backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, black, transparent 82%)" }} />
      <div className="pointer-events-none absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[var(--foreground)]/[0.035] blur-[110px]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <a href="/" className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em]">{brand.name}</div>
            {brand.tagline && (
              <div className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted-foreground)]">{brand.tagline}</div>
            )}
          </div>
        </a>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/70 px-3 py-2 text-[11px] text-[var(--muted-foreground)] shadow-sm backdrop-blur sm:flex">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            {t("auth.status")}
          </div>
          <LocaleSwitcher />
          <button type="button" onClick={toggleTheme} aria-label={darkMode ? t("theme.light") : t("theme.dark")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition hover:text-[var(--foreground)]">
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <section className="relative z-[1] mx-auto flex min-h-[calc(100vh-132px)] w-full max-w-[1280px] items-center px-5 py-10 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1040px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_30px_100px_rgba(15,23,42,0.12)] dark:shadow-[0_30px_100px_rgba(0,0,0,0.42)] lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative hidden min-h-[570px] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--muted)] p-10 lg:flex">
            <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full border-[52px] border-[var(--foreground)]/[0.04]" />
            <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full border-[70px] border-[var(--foreground)]/[0.025]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--muted-foreground)] shadow-sm">
                <Fingerprint size={13} className="text-[var(--primary)]" />
                {t("auth.badge")}
              </div>
              <h1 className="mt-8 max-w-sm text-[30px] font-semibold leading-[1.2] tracking-[-0.035em] sm:text-[34px]">{t("auth.heroTitle")}</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--muted-foreground)]">{t("login.heroBody")}</p>
            </div>
            <div className="relative mt-10 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--card)]/75 p-2 shadow-sm backdrop-blur">
              {(["1", "2", "3"] as const).map((n) => (
                <div key={n} className="flex items-center gap-3 rounded-xl px-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><Check size={14} strokeWidth={2.5} /></span>
                  <div className="min-w-0"><div className="text-xs font-semibold">{t(`auth.feature${n}`)}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{t(`auth.feature${n}Detail`)}</div></div>
                </div>
              ))}
            </div>
            <div className="relative mt-auto flex items-center justify-between pt-8 text-[10px] font-medium tracking-[0.1em] text-[var(--muted-foreground)]">
              <span>{t("auth.footerConsole", { name: brand.name.toUpperCase() })}</span>
              <span>{t("auth.footerTagline")}</span>
            </div>
          </section>

          <section className="flex min-h-[520px] items-center p-7 sm:p-10 lg:p-14">
            <div className="mx-auto w-full max-w-[390px]">
              <div className="mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--primary)]"><KeyRound size={18} /></div>
                <p className="mt-6 text-[10px] font-semibold tracking-[0.17em] text-[var(--primary)]">{t("login.eyebrow")}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{t("login.title", { name: brand.name })}</h2>
                <p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">{t("login.subtitle")}</p>
              </div>

              {methods.length > 1 && (
                <div role="tablist" aria-label={t("login.methods")} className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1">
                  {methods.map((m) => (
                    <button key={m} type="button" role="tab" id={`login-tab-${m}`} aria-controls={`login-panel-${m}`} aria-selected={method === m}
                      onClick={() => { setMethod(m); setError(null); }}
                      className={`h-9 rounded-md text-xs font-medium transition ${method === m ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
                      {t(`login.method.${m}`)}
                    </button>
                  ))}
                </div>
              )}

              {error && <Alert tone="error" className="mb-4">{error}</Alert>}
              <div role="tabpanel" id={`login-panel-${method}`} aria-labelledby={methods.length > 1 ? `login-tab-${method}` : undefined}>
                {method === "sms"
                  ? <SmsLoginForm onError={onFailure} clearError={() => setError(null)} />
                  : <PasswordLoginForm onError={onFailure} clearError={() => setError(null)} />}
              </div>

              <div className="mt-7 flex items-start gap-2.5 border-t border-[var(--border)] pt-5 text-[11px] leading-5 text-[var(--muted-foreground)]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                <span className="flex-1">{t("login.noAccount")}<a href={registerHref} className="font-medium text-[var(--primary)] hover:underline">{t("login.register")}</a> · <a href="/pricing" className="hover:underline">{t("auth.viewPricing")}</a></span>
                {method === "password" && <a href={forgotHref} className="font-medium text-[var(--muted-foreground)] hover:underline">{t("login.forgotPassword")}</a>}
              </div>
            </div>
          </section>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex h-[52px] w-full max-w-[1280px] items-center justify-between px-5 text-[10px] text-[var(--muted-foreground)] sm:px-8">
        <span>© {brand.name}</span>
        <span className="tracking-[0.08em]">{brand.tagline}</span>
      </footer>
    </main>
  );
}

interface FormProps { onError: (e: unknown) => void; clearError: () => void }

function PasswordLoginForm({ onError, clearError }: FormProps) {
  const brand = useSiteBrand();
  const t = useT("console");
  const captcha = useCaptcha(brand.captcha, "login");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    clearError();
    try {
      await postAuth("/api/auth/login", { username, password }, captcha.headers);
      window.location.href = afterAuthTarget();
      return;
    } catch (e) {
      onError(e);
      captcha.reset();
    }
    setPending(false);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="username">{t("login.username")}</Label>
        <Input id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("login.usernamePlaceholder")} autoComplete="username" autoFocus className="h-11 bg-[var(--background)] px-3.5" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("login.password")}</Label>
        <div className="relative">
          <Input id="password" name="password" type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("login.passwordPlaceholder")} autoComplete="current-password" className="h-11 bg-[var(--background)] px-3.5 pr-11" />
          <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]" aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      {captcha.widget}
      <Button type="submit" className="group mt-2 h-11 w-full gap-2 text-sm" disabled={pending || !username || !password || !captcha.ready}>
        {pending ? t("login.submitting") : t("login.submit")}
        {!pending && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
      </Button>
    </form>
  );
}

function SmsLoginForm({ onError, clearError }: FormProps) {
  const brand = useSiteBrand();
  const t = useT("console");
  // 发码与登录是两个动作，人机验证各自取凭证（后端按动作核对，凭证不能挪用）
  const sendCaptcha = useCaptcha(brand.captcha, "send_code");
  const loginCaptcha = useCaptcha(brand.captcha, "login");
  const [callingCode, setCallingCode] = React.useState(site.auth.defaultCallingCode);
  const [number, setNumber] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const digits = number.replace(/\D/g, "");
  const mobile = `${callingCode}${digits}`;
  const codes = CALLING_CODES.includes(site.auth.defaultCallingCode) ? CALLING_CODES : [site.auth.defaultCallingCode, ...CALLING_CODES];

  async function sendCode() {
    setSending(true);
    clearError();
    try {
      await apiWrite<void>("/app/auth/send-sms-code", "POST", { mobile, scene: SMS_SCENE_LOGIN }, sendCaptcha.headers);
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      onError(e);
    } finally {
      sendCaptcha.reset();
      setSending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    clearError();
    try {
      await postAuth("/api/auth/sms-login", { mobile, smsCode: code.trim() }, loginCaptcha.headers);
      window.location.href = afterAuthTarget();
      return;
    } catch (e) {
      onError(e);
      loginCaptcha.reset();
    }
    setPending(false);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="mobile">{t("login.mobile")}</Label>
        <div className="flex gap-2">
          <select aria-label={t("login.callingCode")} value={callingCode} onChange={(e) => setCallingCode(e.target.value)} className="h-11 w-24 shrink-0 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-sm">
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input id="mobile" name="mobile" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t("login.mobilePlaceholder")} autoComplete="tel-national" autoFocus className="h-11 bg-[var(--background)] px-3.5" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sms-code">{t("login.smsCode")}</Label>
        <div className="flex gap-2">
          <Input id="sms-code" name="sms-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("login.smsCodePlaceholder")} autoComplete="one-time-code" maxLength={8} className="h-11 bg-[var(--background)] px-3.5" />
          <Button type="button" variant="outline" className="h-11 shrink-0 gap-1.5 px-3 text-xs" onClick={sendCode} disabled={sending || cooldown > 0 || digits.length < 5 || !sendCaptcha.ready}>
            <MessageSquareText size={14} />
            {cooldown > 0 ? t("login.resendIn", { seconds: cooldown }) : sending ? t("login.sending") : sent ? t("login.resend") : t("login.sendCode")}
          </Button>
        </div>
      </div>
      {!sent && sendCaptcha.widget}
      {sent && loginCaptcha.widget}
      <Button type="submit" className="group mt-2 h-11 w-full gap-2 text-sm" disabled={pending || !sent || code.trim().length < 4 || !loginCaptcha.ready}>
        {pending ? t("login.submitting") : t("login.submitSms")}
        {!pending && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
      </Button>
      <p className="text-[11px] leading-5 text-[var(--muted-foreground)]">{t("login.smsNotice")}</p>
    </form>
  );
}
