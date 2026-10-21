"use client";

/**
 * 真实用户 Core Web Vitals 信标（public-routes §10.7）。站点配置了 `vitals` 时由公开外框渲染。
 *
 * - 按页面浏览抽样（`sampleRate`）；不在首屏关键路径上：页面 `load` 之后、浏览器空闲时才动态加载 `web-vitals`
 *   （懒加载块，不计入首屏 JS，§10.6）。
 * - 页面隐藏（切走、关闭）时把这次浏览的全部指标（每个指标取最后一次的值）一次发出：`navigator.sendBeacon`，
 *   不支持时 `fetch(keepalive)`。不带 Cookie、不带身份：只有路由 key 与形态（取自页面 `<meta name="neton-route">`）、
 *   路径（不含查询串）、导航类型、设备档（视口宽度）、网络类型。
 * - 渲染为空（不改变 DOM），首帧与服务端 HTML 一致。
 */
import * as React from "react";
import type { VitalsBeaconPayload, VitalsMetric } from "../public/vitals";
import { deviceClassOf } from "../public/vitals-device";

type Connection = { effectiveType?: string };

function metaContent(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
}

function connectionType(): VitalsBeaconPayload["conn"] {
  const type = (navigator as Navigator & { connection?: Connection }).connection?.effectiveType;
  return type === "slow-2g" || type === "2g" || type === "3g" || type === "4g" ? type : "unknown";
}

function send(endpoint: string, payload: VitalsBeaconPayload) {
  const body = JSON.stringify(payload);
  // text/plain：同源时与 JSON 无异，跨源（独立收集服务）时不触发预检
  const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(endpoint, blob)) return;
  void fetch(endpoint, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => undefined);
}

export function VitalsBeacon({ endpoint, sampleRate }: { endpoint: string; sampleRate: number }) {
  React.useEffect(() => {
    if (!(Math.random() < sampleRate)) return;
    let cancelled = false;
    const metrics = new Map<string, VitalsMetric>();
    let nav: VitalsBeaconPayload["nav"] = "navigate";
    const flush = () => {
      if (!metrics.size) return;
      const payload: VitalsBeaconPayload = {
        v: 1,
        route: metaContent("neton-route"),
        pattern: metaContent("neton-route-pattern"),
        path: window.location.pathname,
        nav,
        device: deviceClassOf(window.innerWidth),
        conn: connectionType(),
        metrics: [...metrics.values()],
      };
      metrics.clear();
      send(endpoint, payload);
    };
    // 先注册 web-vitals 的回调、再注册这个：同一次「隐藏」里 web-vitals 先交出最终的 CLS / INP / LCP，再一起发出
    const onHidden = () => { if (document.visibilityState === "hidden") queueMicrotask(flush); };
    const start = () => {
      void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        if (cancelled) return;
        const record = (m: { name: VitalsMetric["name"]; value: number; rating: VitalsMetric["rating"]; id: string; navigationType: string }) => {
          nav = (m.navigationType as VitalsBeaconPayload["nav"]) || "navigate";
          metrics.set(m.name, { name: m.name, value: Math.round(m.name === "CLS" ? m.value * 10_000 : m.value) / (m.name === "CLS" ? 10_000 : 1), rating: m.rating, id: m.id });
        };
        onLCP(record);
        onINP(record);
        onCLS(record);
        onFCP(record);
        onTTFB(record);
        document.addEventListener("visibilitychange", onHidden);
        window.addEventListener("pagehide", flush);
      });
    };
    const idle = (cb: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cb, { timeout: 5000 });
      else setTimeout(cb, 1);
    };
    const onLoad = () => idle(start);
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [endpoint, sampleRate]);
  return null;
}
