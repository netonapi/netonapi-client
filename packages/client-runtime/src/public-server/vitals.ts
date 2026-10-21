/**
 * Web Vitals 的收集端点（public-routes §10.7，`POST /api/site/vitals`）：一个日志汇。
 *
 * - 校验（`parseVitalsPayload`：形状、枚举、数值范围，≤ 4 KB），不合法 400 `VITALS_INVALID`；
 * - 按来源地址限流（进程内，每分钟 [VITALS_RATE_PER_MINUTE] 份，超出 429 `VITALS_RATE_LIMITED`）：来源取
 *   `X-Forwarded-For` 最右一跳（边缘反代写入的那一跳，左边的可被客户端伪造），没有时按「本机」一个桶；
 * - 每个指标写一行 JSON（`{"type":"web-vital",…}`）：`NETON_SITE_VITALS_LOG` 有值时追加到该文件，否则写标准输出；
 * - 不读写 Cookie、不访问后端、恒 `no-store`；成功 204。
 */
import { appendFile } from "node:fs/promises";
import { parseVitalsPayload, VITALS_MAX_BYTES, type VitalsSample } from "../public/vitals";

export const VITALS_RATE_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

export interface VitalsSink { write(lines: string): Promise<void> }

export function vitalsSink(env: Record<string, string | undefined> = process.env): VitalsSink {
  const file = env.NETON_SITE_VITALS_LOG?.trim();
  if (file) return { write: (lines) => appendFile(file, lines, "utf8") };
  return { write: async (lines) => { process.stdout.write(lines); } };
}

/** 固定窗口计数（每个来源每分钟一个桶）；桶太多时整体清掉，防止被大量伪造来源撑爆内存。 */
export function createVitalsLimiter(perMinute = VITALS_RATE_PER_MINUTE, now: () => number = Date.now) {
  const buckets = new Map<string, { start: number; count: number }>();
  return (key: string): boolean => {
    const t = now();
    let b = buckets.get(key);
    if (!b || t - b.start >= WINDOW_MS) {
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
      b = { start: t, count: 0 };
      buckets.set(key, b);
    }
    b.count += 1;
    return b.count <= perMinute;
  };
}

export function vitalsClientKey(headers: Headers): string {
  const hops = headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean) ?? [];
  return hops.at(-1) ?? "local";
}

const NO_STORE = { "Cache-Control": "private, no-store" };

export function createVitalsHandler(options: { sink?: VitalsSink; limiter?: (key: string) => boolean; now?: () => number } = {}) {
  const sink = options.sink ?? vitalsSink();
  const limiter = options.limiter ?? createVitalsLimiter();
  const now = options.now ?? Date.now;
  return async function POST(request: Request): Promise<Response> {
    if (!limiter(vitalsClientKey(request.headers))) {
      return Response.json({ code: 10429, message: "VITALS_RATE_LIMITED" }, { status: 429, headers: NO_STORE });
    }
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > VITALS_MAX_BYTES) return Response.json({ code: 10100, message: "VITALS_INVALID" }, { status: 400, headers: NO_STORE });
    const raw = await request.text();
    const samples: VitalsSample[] | null = parseVitalsPayload(raw, now());
    if (!samples) return Response.json({ code: 10100, message: "VITALS_INVALID" }, { status: 400, headers: NO_STORE });
    await sink.write(samples.map((s) => `${JSON.stringify(s)}\n`).join(""));
    return new Response(null, { status: 204, headers: NO_STORE });
  };
}
