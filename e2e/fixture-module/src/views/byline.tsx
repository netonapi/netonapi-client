/**
 * 公开页用到、但不在 public / cards / slots 目录里的组件：证明门户样式表扫描模块的整个 src（真实路径），
 * 它的工具类（`[--fixture-public-view:1]`）必须出现在门户 CSS 里（e2e「public CSS」）。
 */
export function Byline({ text }: { text: string }) {
  return <p data-fixture-byline className="[--fixture-public-view:1]">{text}</p>;
}
