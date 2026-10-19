"use client";

import * as React from "react";
import { CAPTCHA_HEADER, captchaRequired, type CaptchaConfig } from "./captcha-config";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
      script.onerror = () => { scriptPromise = null; reject(new Error("turnstile script failed")); };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface CaptchaHandle {
  /** 凭证一次性：每次提交后（无论成败）都要重置，拿新的凭证再提交。 */
  reset(): void;
}

/**
 * Turnstile 组件。拿到凭证回调 [onToken]，过期或出错回调 null。
 * `action` 会随凭证一起被后端核对，同一凭证不能挪到别的动作上用。
 */
export const CaptchaWidget = React.forwardRef<CaptchaHandle, {
  config: CaptchaConfig;
  action: string;
  onToken: (token: string | null) => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
}>(function CaptchaWidget({ config, action, onToken, onError, theme = "auto", className }, ref) {
  const box = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  const callbacks = React.useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  React.useImperativeHandle(ref, () => ({
    reset() {
      callbacks.current.onToken(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }), []);

  React.useEffect(() => {
    if (!captchaRequired(config, action)) return;
    let cancelled = false;
    loadTurnstile().then((api) => {
      if (cancelled || !box.current) return;
      widgetId.current = api.render(box.current, {
        sitekey: config.siteKey,
        action,
        theme,
        callback: (token: string) => callbacks.current.onToken(token),
        "expired-callback": () => callbacks.current.onToken(null),
        "error-callback": () => { callbacks.current.onToken(null); callbacks.current.onError?.(); },
      });
    }).catch(() => callbacks.current.onError?.());
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [config, action, theme]);

  if (!captchaRequired(config, action)) return null;
  return <div ref={box} className={className} />;
});

/**
 * 表单用法：`ready` 为 false 时禁用提交，请求带上 `headers`，提交失败后 `reset()` 换新凭证。
 * 不需要验证的动作 `widget` 渲染为空、`ready` 恒为 true，页面不用分支。
 */
export function useCaptcha(config: CaptchaConfig, action: string, theme?: "light" | "dark" | "auto") {
  const ref = React.useRef<CaptchaHandle>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const required = captchaRequired(config, action);
  return {
    required,
    ready: !required || !!token,
    headers: (token ? { [CAPTCHA_HEADER]: token } : {}) as Record<string, string>,
    reset: () => ref.current?.reset(),
    widget: <CaptchaWidget ref={ref} config={config} action={action} onToken={setToken} theme={theme} className="min-h-[65px]" />,
  };
}
