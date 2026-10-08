"use client";

import * as React from "react";
import { Alert, Button, Input, Label } from "@neton/application-client-kit";
import { BrandMark } from "@/components/brand-mark";
import { useSiteBrand } from "@/components/site-brand";

/** 找回密码：邮箱 → 验证码 → 新密码。只对绑定过邮箱的账号有效；后端对未知邮箱也返回成功，不泄露账号存在与否。 */
export default function ForgotPasswordPage() {
  const brand = useSiteBrand();
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

  async function call(body: Record<string, string>) {
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!res.ok || data.code !== 0) throw new Error(data.message || "请求失败");
  }

  async function send() {
    setError(null); setBusy(true);
    try { await call({ action: "send", email }); setSent(true); setCooldown(60); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError("两次输入的新密码不一致"); return; }
    setBusy(true);
    try { await call({ action: "reset", email, code, newPassword: password }); setDone(true); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
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
      </header>
      <section className="mx-auto flex w-full max-w-[420px] flex-col px-5 pb-16 pt-6 sm:px-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">找回密码</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">输入注册时绑定的邮箱，我们会发送一封验证码邮件。</p>
        {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
        {done ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm">
            密码已重置，请用新密码<a href="/login" className="ml-1 font-medium text-[var(--primary)] hover:underline">登录</a>。
          </div>
        ) : (
          <form onSubmit={(e) => void reset(e)} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">邮箱</Label>
              <div className="flex gap-2">
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="h-11 bg-[var(--background)] px-3.5" />
                <Button type="button" variant="outline" onClick={() => void send()} disabled={busy || cooldown > 0 || !email.includes("@")} className="h-11 shrink-0">
                  {cooldown > 0 ? `${cooldown}s` : sent ? "重新发送" : "发送验证码"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">验证码</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="邮件里的 6 位数字" inputMode="numeric" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">新密码（至少 8 位）</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">确认新密码</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="h-11 bg-[var(--background)] px-3.5" />
            </div>
            <Button type="submit" disabled={busy || !sent || !code || password.length < 8} className="h-11 w-full">{busy ? "提交中…" : "重置密码"}</Button>
            <p className="text-center text-sm text-[var(--muted-foreground)]">想起来了？<a href="/login" className="font-medium text-[var(--primary)] hover:underline">返回登录</a></p>
          </form>
        )}
      </section>
    </main>
  );
}
