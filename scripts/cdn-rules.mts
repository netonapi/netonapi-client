/**
 * CDN 缓存规则（public-routes §8.2a）：由生成的站点配置与公开路由算出，输出 JSON（缺省）或给人看的文本。
 * 部署时照着它配置 CDN（itwind：DEPLOY_CLIENT.md 把每一条对应到腾讯云 / 阿里云控制台的设置项）。
 *
 *   pnpm cdn:rules              # JSON（先 pnpm registry 生成配置）
 *   pnpm cdn:rules --text
 *   pnpm cdn:rules --out cdn-rules.json
 */
import { writeFile } from "node:fs/promises";
import { cdnRules, cdnRulesText } from "@neton/application-client-runtime/public";
import { site } from "../apps/console/src/generated/site.generated.ts";
import { proxyConfig } from "../apps/console/src/generated/public-proxy.generated.ts";

const args = process.argv.slice(2);
const rules = cdnRules(site, proxyConfig.routes);
const outIndex = args.indexOf("--out");
const text = args.includes("--text") ? cdnRulesText(rules) : `${JSON.stringify(rules, null, 2)}\n`;
if (outIndex >= 0) {
  const file = args[outIndex + 1];
  if (!file) throw new Error("--out needs a file");
  await writeFile(file, text);
} else process.stdout.write(text);
