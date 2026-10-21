/**
 * 词条模板渲染：`{name}` 插值与复数 `{count, plural, one {# item} other {# items}}`（`#` 代入数字，
 * 复数规则用 Intl.PluralRules）。客户端（i18n.tsx）与服务端翻译（public-server/i18n.ts）共用。
 */

/** 渲染一条模板。 */
export function formatMessage(template: string, params: Record<string, unknown> | undefined, locale: string): string {
  if (!params) return template;
  return template.replace(
    /\{(\w+)(?:,\s*plural,\s*((?:[^{}]|\{[^{}]*\})*))?\}/g,
    (whole, name: string, plural: string | undefined) => {
      const value = params[name];
      if (plural === undefined) return value === undefined || value === null ? whole : String(value);
      const n = Number(value);
      const options = parsePluralOptions(plural);
      const exact = options[`=${n}`];
      const category = new Intl.PluralRules(locale).select(n);
      const chosen = exact ?? options[category] ?? options.other ?? "";
      return chosen.replace(/#/g, new Intl.NumberFormat(locale).format(n));
    },
  );
}

function parsePluralOptions(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(=?\w+)\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1]] = m[2];
  return out;
}

