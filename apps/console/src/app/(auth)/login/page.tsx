"use client";

import * as React from "react";
import { ArrowRight, Check, Eye, EyeOff, Fingerprint, KeyRound, Moon, ShieldCheck, Sun } from "lucide-react";
import { Alert, Button, Input, Label } from "@neton/application-client-kit";
import { apiErrorFromEnvelope } from "@neton/application-client-runtime/client";
import { useDescribeError } from "@neton/application-client-runtime/errors";
import { useCaptcha } from "@neton/application-client-runtime/captcha-widget";
import { BrandMark } from "@/components/brand-mark";
import { useSiteBrand } from "@/components/site-brand";

export default function LoginPage() {
  const brand = useSiteBrand();
  const describeError = useDescribeError("account");
  const captcha = useCaptcha(brand.captcha, "login");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(false);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...captcha.headers },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (body.code === 0) {
        window.location.href = "/";
        return;
      }
      setError(describeError(apiErrorFromEnvelope(body, res.status, res.headers)));
      captcha.reset();
    } catch {
      setError("无法连接到管理服务，请稍后重试");
      captcha.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.42] dark:opacity-[0.18]" style={{ backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, black, transparent 82%)" }} />
      <div className="pointer-events-none absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[var(--foreground)]/[0.035] blur-[110px]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em]">{brand.name}</div>
            {brand.tagline && (
              <div className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted-foreground)]">{brand.tagline}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/70 px-3 py-2 text-[11px] text-[var(--muted-foreground)] shadow-sm backdrop-blur sm:flex">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            Identity service operational
          </div>
          <button type="button" onClick={toggleTheme} aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition hover:text-[var(--foreground)]">
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <section className="relative z-[1] mx-auto flex min-h-[calc(100vh-132px)] w-full max-w-[1280px] items-center px-5 py-10 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1040px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_30px_100px_rgba(15,23,42,0.12)] dark:shadow-[0_30px_100px_rgba(0,0,0,0.42)] lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative flex min-h-[570px] flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--muted)] p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full border-[52px] border-[var(--foreground)]/[0.04]" />
            <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full border-[70px] border-[var(--foreground)]/[0.025]" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--muted-foreground)] shadow-sm">
                <Fingerprint size={13} className="text-[var(--primary)]" />
                DEVELOPER CONSOLE
              </div>
              <h1 className="mt-8 max-w-sm text-[30px] font-semibold leading-[1.2] tracking-[-0.035em] sm:text-[34px]">一个 Key，接入所有模型</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--muted-foreground)]">兼容 OpenAI、Anthropic、Gemini 三种客户端配置方式。按量计费，充值即用。</p>
            </div>

            <div className="relative mt-10 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--card)]/75 p-2 shadow-sm backdrop-blur">
              {[
                ["自助 Key", "Create and revoke instantly"],
                ["透明账单", "Per-request usage and cost"],
                ["额度充值", "Top up and start calling"],
              ].map(([label, detail]) => (
                <div key={label} className="flex items-center gap-3 rounded-xl px-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><Check size={14} strokeWidth={2.5} /></span>
                  <div className="min-w-0"><div className="text-xs font-semibold">{label}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{detail}</div></div>
                </div>
              ))}
            </div>

            <div className="relative mt-auto flex items-center justify-between pt-8 text-[10px] font-medium tracking-[0.1em] text-[var(--muted-foreground)]">
              <span>{brand.name.toUpperCase()} CONSOLE</span>
              <span>SECURE / METERED</span>
            </div>
          </section>

          <section className="flex min-h-[570px] items-center p-7 sm:p-10 lg:p-14">
            <div className="mx-auto w-full max-w-[390px]">
              <div className="mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--primary)]"><KeyRound size={18} /></div>
                <p className="mt-6 text-[10px] font-semibold tracking-[0.17em] text-[var(--primary)]">SIGN IN</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">登录 {brand.name}</h2>
                <p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">使用你的账号进入控制台，管理 API Key、查看用量与充值。</p>
              </div>

              <form className="space-y-4" onSubmit={submit}>
                {error && <Alert tone="error">{error}</Alert>}
                <div className="space-y-2">
                  <Label htmlFor="username">账号</Label>
                  <Input id="username" name="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入用户名" autoComplete="username" autoFocus className="h-11 bg-[var(--background)] px-3.5" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">登录密码</Label>
                  <div className="relative">
                    <Input id="password" name="password" type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoComplete="current-password" className="h-11 bg-[var(--background)] px-3.5 pr-11" />
                    <button type="button" onClick={() => setPasswordVisible((value) => !value)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]" aria-label={passwordVisible ? "隐藏密码" : "显示密码"}>
                      {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {captcha.widget}
                <Button type="submit" className="group mt-2 h-11 w-full gap-2 text-sm" disabled={pending || !username || !password || !captcha.ready}>
                  {pending ? "正在验证…" : "安全登录"}
                  {!pending && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
                </Button>
              </form>

              <div className="mt-7 flex items-start gap-2.5 border-t border-[var(--border)] pt-5 text-[11px] leading-5 text-[var(--muted-foreground)]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                <span>还没有账号？<a href="/register" className="font-medium text-[var(--primary)] hover:underline">立即注册</a> · <a href="/pricing" className="hover:underline">查看模型价格</a></span>
                <a href="/forgot-password" className="font-medium text-[var(--muted-foreground)] hover:underline">忘记密码</a>
              </div>
            </div>
          </section>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex h-[52px] w-full max-w-[1280px] items-center justify-between px-5 text-[10px] text-[var(--muted-foreground)] sm:px-8">
        <span>© {new Date().getFullYear()} {brand.name}</span>
        <span className="tracking-[0.08em]">{brand.tagline}</span>
      </footer>
    </main>
  );
}
