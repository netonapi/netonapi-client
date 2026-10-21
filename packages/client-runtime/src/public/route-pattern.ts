/**
 * 公开路由的 URL 形态（public-routes §4）：静态段 + `:name` 参数段，参数占整段。
 * 不支持可选段、通配与段内混写——每条路由都要生成成真实的 Next 路由文件，形态必须一眼可判。
 *
 * 构建期（生成脚本）与运行期（ctx.href、proxy 的 410 / legacy 匹配）共用这一份实现。
 */
import type { PublicParamRule } from "@neton/application-client-contract";

export type PatternSegment = { kind: "static"; value: string } | { kind: "param"; name: string };

const STATIC_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const PARAM_NAME = /^[a-z][A-Za-z0-9]*$/;

export class RoutePatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutePatternError";
  }
}

/** 解析并校验形态。静态段只允许小写字母、数字、`.`、`_`、`-`（URL 不区分大小写的地方太多）。 */
export function parsePattern(pattern: string): PatternSegment[] {
  if (!pattern.startsWith("/")) throw new RoutePatternError(`pattern must start with "/": ${pattern}`);
  if (pattern !== "/" && pattern.endsWith("/")) throw new RoutePatternError(`pattern must not end with "/": ${pattern}`);
  if (pattern === "/") return [];
  const names = new Set<string>();
  return pattern.slice(1).split("/").map((raw) => {
    if (raw.startsWith(":")) {
      const name = raw.slice(1);
      if (!PARAM_NAME.test(name)) throw new RoutePatternError(`invalid parameter ":${name}" in ${pattern}`);
      if (names.has(name)) throw new RoutePatternError(`duplicate parameter ":${name}" in ${pattern}`);
      names.add(name);
      return { kind: "param", name } as const;
    }
    if (!STATIC_SEGMENT.test(raw)) throw new RoutePatternError(`invalid static segment "${raw}" in ${pattern}`);
    return { kind: "static", value: raw } as const;
  });
}

export function patternParamNames(pattern: string): string[] {
  return parsePattern(pattern).flatMap((s) => (s.kind === "param" ? [s.name] : []));
}

/** 形态的「骨架」：参数段统一成 `*`，用来判断两条形态会不会匹配到同一批 URL。 */
export function patternShape(pattern: string): string {
  return "/" + parsePattern(pattern).map((s) => (s.kind === "param" ? "*" : s.value)).join("/");
}

/**
 * 两条形态是否会互相遮挡：段数相同，且每个位置上要么都是参数、要么静态段相同、要么一边是参数。
 * 「一边静态一边参数」在 Next 里静态段优先，不报错但会让参数路由吞不到这个值——这正是要拦下的冲突。
 */
export function patternsConflict(a: string, b: string): boolean {
  const x = parsePattern(a);
  const y = parsePattern(b);
  if (x.length !== y.length) return false;
  return x.every((s, i) => {
    const t = y[i]!;
    if (s.kind === "param" || t.kind === "param") return true;
    return s.value === t.value;
  });
}

/** 形态是否落在某个保留前缀下（`/api` 覆盖 `/api/x`，不覆盖 `/apix`）。 */
export function patternUnderPrefix(pattern: string, prefix: string): boolean {
  if (prefix === "/") return true;
  const segments = parsePattern(pattern);
  const prefixSegments = prefix.split("/").filter(Boolean);
  if (segments.length < prefixSegments.length) return false;
  return prefixSegments.every((p, i) => {
    const s = segments[i]!;
    return s.kind === "param" || s.value === p;
  });
}

/** 按形态匹配路径；不匹配返回 null。参数值已 decodeURIComponent。 */
export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const segments = parsePattern(pattern);
  const parts = pathname === "/" ? [] : pathname.replace(/\/+$/, "").slice(1).split("/");
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    const part = parts[i]!;
    if (s.kind === "static") {
      if (s.value !== part) return null;
      continue;
    }
    let value: string;
    try { value = decodeURIComponent(part); } catch { return null; }
    if (value === "") return null;
    params[s.name] = value;
  }
  return params;
}

/** 按形态生成路径；缺参数抛错（模块间互链写错应该在开发期就炸）。 */
export function buildPath(pattern: string, params: Record<string, string | number>): string {
  const segments = parsePattern(pattern);
  if (!segments.length) return "/";
  return "/" + segments.map((s) => {
    if (s.kind === "static") return s.value;
    const value = params[s.name];
    if (value === undefined || value === "") throw new RoutePatternError(`missing parameter "${s.name}" for ${pattern}`);
    return encodeURIComponent(String(value));
  }).join("/");
}

// ---------------------------------------------------------------------------
// 参数规则

const ID = /^[1-9][0-9]{0,18}$/;
const INT = /^(0|-?[1-9][0-9]{0,8})$/;
const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,159}$/u;
const CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function paramMatchesRule(value: string, rule: PublicParamRule): boolean {
  if (typeof rule === "object") return rule.enum.includes(value);
  switch (rule) {
    case "id": return ID.test(value) && BigInt(value) <= 9223372036854775807n;
    case "int": return INT.test(value);
    case "slug": return SLUG.test(value) && value === value.toLowerCase();
    case "code": return CODE.test(value);
  }
}

/**
 * 一个**必然不合法**的参数值：构建期的 generateStaticParams 用它产出一份「参数不合法 → 404」
 * 的预渲染，既满足 Cache Components 的构建期校验（必须至少返回一组参数），又不需要构建时连后端。
 */
export function sentinelParam(rule: PublicParamRule): string {
  if (typeof rule === "object") {
    let candidate = "-";
    while (rule.enum.includes(candidate)) candidate += "-";
    return candidate;
  }
  return rule === "id" ? "0" : "-";
}

/** 校验全部参数；任一不合法返回 null。 */
export function validateParams(
  values: Record<string, string>,
  rules: Record<string, PublicParamRule> | undefined,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    const rule = rules?.[name];
    if (!rule || !paramMatchesRule(value, rule)) return null;
    out[name] = value;
  }
  return out;
}
