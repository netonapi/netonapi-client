/**
 * 真实用户 Core Web Vitals 的 p75 报告与门禁（public-routes §10.7）。读收集端点写出的日志（`/api/site/vitals`
 * 的 `NETON_SITE_VITALS_LOG`，或混在标准输出日志里的样本行），按全站与路由形态 × 设备档算 p75：
 * p75 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（Google「good」）。
 *
 *   pnpm vitals:report vitals.log [更多文件…] [--since 2026-10-01] [--until 2026-10-08] [--days 7]
 *                      [--min-samples 50] [--lcp 2500] [--inp 200] [--cls 0.1] [--json] [--allow-insufficient]
 *
 * 时间窗：`--since` / `--until`（ISO 日期或时间，until 不含）；`--days N` = 截至 until（缺省现在）的最近 N 天。
 * 门槛缺省是 Google「good」，`--lcp` / `--inp`（毫秒）、`--cls` 可以收紧（不建议放宽：现场门禁的意义就在这条线）。
 *
 * 退出码：0 达标；1 有样本足够的组超出门槛；2 全站手机 / 桌面任一档样本不足（`--allow-insufficient` 时不算失败）。
 */
import { readFile } from "node:fs/promises";
import { formatVital, parseVitalsLog, vitalsReport } from "@neton/application-client-runtime/public";

async function main() {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let since: number | undefined;
  let until: number | undefined;
  let days: number | undefined;
  const thresholds: Partial<Record<"LCP" | "INP" | "CLS", number>> = {};
  let minSamples = 50;
  let json = false;
  let allowInsufficient = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === "--since") {
      since = Date.parse(args[++i] ?? "");
      if (!Number.isFinite(since)) throw new Error("--since needs a date");
    } else if (a === "--until") {
      until = Date.parse(args[++i] ?? "");
      if (!Number.isFinite(until)) throw new Error("--until needs a date");
    } else if (a === "--days") {
      days = Number(args[++i]);
      if (!Number.isFinite(days) || days <= 0) throw new Error("--days needs a positive number");
    } else if (a === "--lcp" || a === "--inp" || a === "--cls") {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${a} needs a positive number`);
      thresholds[a.slice(2).toUpperCase() as "LCP" | "INP" | "CLS"] = v;
    } else if (a === "--min-samples") {
      minSamples = Number(args[++i]);
      if (!Number.isInteger(minSamples) || minSamples < 1) throw new Error("--min-samples needs a positive integer");
    } else if (a === "--json") json = true;
    else if (a === "--allow-insufficient") allowInsufficient = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else files.push(a);
  }
  if (!files.length) throw new Error("usage: pnpm vitals:report <log file>…");
  if (days !== undefined) {
    if (since !== undefined) throw new Error("--days and --since are exclusive");
    since = (until ?? Date.now()) - days * 86_400_000;
  }
  if (since !== undefined && until !== undefined && since >= until) throw new Error("--since must be before --until");
  const samples = (await Promise.all(files.map((f) => readFile(f, "utf8")))).flatMap((text) => parseVitalsLog(text, { since, until }));
  const report = vitalsReport(samples, { minSamples, thresholds });
  const window = { since: since ? new Date(since).toISOString() : null, until: until ? new Date(until).toISOString() : null };
  if (json) {
    console.log(JSON.stringify({ samples: samples.length, minSamples, window, thresholds, ...report }, null, 2));
  } else {
    console.log(`${samples.length} samples${window.since || window.until ? ` in [${window.since ?? "…"}, ${window.until ?? "now"})` : ""}, gate needs ≥ ${minSamples} per group`);
    const width = Math.max(10, ...report.rows.map((r) => r.group.length));
    for (const r of report.rows) {
      const mark = !r.gated ? " " : r.ok ? "✔" : "✖";
      console.log(`${mark} ${r.group.padEnd(width)}  ${r.device.padEnd(7)}  ${r.name.padEnd(4)}  p75 ${formatVital(r.name, r.p75).padStart(9)}  n=${r.count}${r.threshold === null ? "" : `  (≤ ${formatVital(r.name, r.threshold)})`}`);
    }
    for (const e of report.errors) console.log(`FAIL ${e}`);
    for (const e of report.insufficient) console.log(`INSUFFICIENT ${e}`);
  }
  if (report.errors.length) process.exit(1);
  if (report.insufficient.length && !allowInsufficient) process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
