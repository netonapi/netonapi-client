"use client";

import * as React from "react";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Moon, Sparkles, Sun, UserPlus } from "lucide-react";
import { Alert, Button, Input, Label } from "@neton/application-client-kit";
import { BrandMark } from "@/components/brand-mark";

export default function RegisterPage() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [inviteCode, setInviteCode] = React.useState("");
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

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = username.trim().length > 0 && password.length >= 6 && confirm === password && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, nickname, inviteCode }),
      });
      const body = await res.json();
      if (body.code === 0) {
        window.location.href = "/";
        return;
      }
      setError(body.message || "注册失败，请稍后重试");
    } catch {
      setError("无法连接到服务，请稍后重试");
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
            <div className="text-sm font-semibold tracking-[-0.01em]">NanoGate</div>
            <div className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted-foreground)]">API GATEWAY</div>
          </div>
        </div>
        <button type="button" onClick={toggleTheme} aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition hover:text-[var(--foreground)]">
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      <section className="relative z-[1] mx-auto flex min-h-[calc(100vh-132px)] w-full max-w-[1280px] items-center px-5 py-10 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1040px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_30px_100px_rgba(15,23,42,0.12)] dark:shadow-[0_30px_100px_rgba(0,0,0,0.42)] lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative flex min-h-[570px] flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--muted)] p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full border-[52px] border-[var(--foreground)]/[0.04]" />
            <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full border-[70px] border-[var(--foreground)]/[0.025]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--muted-foreground)] shadow-sm">
                <Sparkles size={13} className="text-[var(--primary)]" />
                GET STARTED
              </div>
              <h1 className="mt-8 max-w-sm text-[30px] font-semibold leading-[1.2] tracking-[-0.035em] sm:text-[34px]">一个 Key，接入所有模型</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--muted-foreground)]">兼容 OpenAI、Anthropic、Gemini 三种客户端配置方式。注册后即可创建 API Key，按量计费，充值即用。</p>
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
              <span>NANOGATE CONSOLE</span>
              <span>SECURE / METERED</span>
            </div>
          </section>

          <section className="flex min-h-[570px] items-center p-7 sm:p-10 lg:p-14">
            <div className="mx-auto w-full max-w-[390px]">
              <div className="mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--primary)]"><UserPlus size={18} /></div>
                <p className="mt-6 text-[10px] font-semibold tracking-[0.17em] text-[var(--primary)]">CREATE ACCOUNT</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">注册 NanoGate</h2>
                <p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">填写账号信息，注册成功后会直接进入控制台。</p>
              </div>
              <form className="space-y-4" onSubmit={submit}>
                {error && <Alert tone="error">{error}</Alert>}
                <div className="space-y-2">
                  <Label htmlFor="username">账号</Label>
                  <Input id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用于登录的用户名" autoComplete="username" autoFocus className="h-11 bg-[var(--background)] px-3.5" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Input id="password" name="password" type={passwordVisible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5 pr-11" />
                    <button type="button" onClick={() => setPasswordVisible((v) => !v)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]" aria-label={passwordVisible ? "隐藏密码" : "显示密码"}>
                      {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">确认密码</Label>
                  <Input id="confirm" name="confirm" type={passwordVisible ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再输一次" autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5" />
                  {mismatch && <p className="text-[11px] text-red-500">两次输入的密码不一致</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称（可选）</Label>
                  <Input id="nickname" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="在控制台里显示的名字" autoComplete="nickname" className="h-11 bg-[var(--background)] px-3.5" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">邀请码（可选）</Label>
                  <Input id="inviteCode" name="inviteCode" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="有邀请码可获得额度奖励" autoComplete="off" className="h-11 bg-[var(--background)] px-3.5" />
                </div>
                <Button type="submit" className="group mt-2 h-11 w-full gap-2 text-sm" disabled={!canSubmit}>
                  {pending ? "正在创建…" : "创建账号"}
                  {!pending && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
                </Button>
              </form>
              <div className="mt-7 flex items-start gap-2.5 border-t border-[var(--border)] pt-5 text-[11px] leading-5 text-[var(--muted-foreground)]">
                <KeyRound size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                <span>已有账号？<a href="/login" className="font-medium text-[var(--primary)] hover:underline">直接登录</a></span>
              </div>
            </div>
          </section>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex h-[52px] w-full max-w-[1280px] items-center justify-between px-5 text-[10px] text-[var(--muted-foreground)] sm:px-8">
        <span>© 2026 NanoGate</span>
        <span className="tracking-[0.08em]">API GATEWAY</span>
      </footer>
    </main>
  );
}
