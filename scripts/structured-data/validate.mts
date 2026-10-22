/**
 * 本地结构化数据校验（public-routes §6.3，itwind C5）：Rich Results Test 只认公网地址，上线前用同一套规则在本地卡住——
 * schema.org 词表（类型、属性是否存在，取值类型）+ Google 富媒体结果的要求（BreadcrumbList 等由
 * @adobe/structured-data-validator 内置，Article / NewsArticle 见 news-article.mjs）。
 *
 * schema.org 词表钉在一个版本上（[SCHEMA_ORG_VERSION]），第一次用时下载到缓存目录（`NETON_SCHEMA_ORG_CACHE`，
 * 缺省 `~/.cache/neton`），之后离线可用；CI 用 actions/cache 缓存同一个目录。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import Validator from "@adobe/structured-data-validator";
import WebAutoExtractor from "@marbec/web-auto-extractor";

export const SCHEMA_ORG_VERSION = "30.1";

export interface StructuredDataIssue { issueMessage: string; severity: "ERROR" | "WARNING"; path?: unknown; fieldNames?: string[]; location?: string }
export interface StructuredDataReport {
  /** JSON-LD 里出现的顶层类型 → 个数。 */
  types: Record<string, number>;
  /** 解析出的 JSON-LD 对象（按类型）。 */
  jsonld: Record<string, Record<string, unknown>[]>;
  errors: StructuredDataIssue[];
  warnings: StructuredDataIssue[];
}

let vocabulary: Promise<unknown> | null = null;

/** schema.org 词表（缓存优先；没有缓存时下载钉住的版本）。 */
export function loadSchemaOrg(): Promise<unknown> {
  vocabulary ??= (async () => {
    const dir = process.env.NETON_SCHEMA_ORG_CACHE || path.join(homedir(), ".cache", "neton");
    const file = path.join(dir, `schemaorg-all-https-${SCHEMA_ORG_VERSION}.jsonld`);
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      const url = `https://schema.org/version/${SCHEMA_ORG_VERSION}/schemaorg-all-https.jsonld`;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`cannot download the schema.org vocabulary ${url}: HTTP ${res.status} (set NETON_SCHEMA_ORG_CACHE to a directory holding schemaorg-all-https-${SCHEMA_ORG_VERSION}.jsonld)`);
      const text = await res.text();
      await mkdir(dir, { recursive: true });
      await writeFile(file, text);
      return JSON.parse(text);
    }
  })();
  return vocabulary;
}

/** 校验一页 HTML 里的结构化数据（JSON-LD、microdata、RDFa）。 */
export async function validateStructuredData(html: string): Promise<StructuredDataReport> {
  const data = new WebAutoExtractor({ addLocation: true, embedSource: ["rdfa", "microdata"] }).parse(html) as { jsonld?: Record<string, Record<string, unknown>[]> };
  const validator = new Validator(await loadSchemaOrg()) as { registeredHandlers: Record<string, (() => Promise<unknown>)[]>; validate(d: unknown): Promise<StructuredDataIssue[]> };
  const article = () => import("./news-article.mjs");
  for (const type of ["Article", "NewsArticle", "BlogPosting"]) validator.registeredHandlers[type] = [...(validator.registeredHandlers[type] ?? []), article];
  const issues = await validator.validate(data);
  const jsonld = data.jsonld ?? {};
  return {
    types: Object.fromEntries(Object.entries(jsonld).map(([k, v]) => [k, v.length])),
    jsonld,
    errors: issues.filter((i) => i.severity === "ERROR"),
    warnings: issues.filter((i) => i.severity === "WARNING"),
  };
}
