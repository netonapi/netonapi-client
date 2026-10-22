/**
 * 本地结构化数据校验（public-routes §6.3）：取页面 HTML，按 schema.org 词表与 Google 富媒体结果的要求校验，
 * 有 ERROR 退出码 1。
 *
 *   pnpm structured-data http://localhost:3200/article/1 http://localhost:3200/
 */
import { validateStructuredData } from "./structured-data/validate.mts";

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: pnpm structured-data <url>…");
  process.exit(2);
}
let failed = false;
for (const url of urls) {
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  const report = await validateStructuredData(await res.text());
  failed ||= report.errors.length > 0;
  console.log(`${report.errors.length ? "✖" : "✔"} ${url}  ${JSON.stringify(report.types)}  ${report.errors.length} error(s), ${report.warnings.length} warning(s)`);
  for (const i of [...report.errors, ...report.warnings]) console.log(`    ${i.severity} ${i.issueMessage}${i.fieldNames?.length ? ` [${i.fieldNames.join(", ")}]` : ""}`);
}
process.exit(failed ? 1 : 0);
