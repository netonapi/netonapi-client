"use client";

/**
 * 夹具的控制台页面：证明控制台页面不会出现在公开路由的客户端引用里（e2e「public routes reference no console pages」），
 * 它的工具类（`[--fixture-console-page:1]`）也不进门户样式表（e2e「public CSS」）。
 */
export default function FixtureConsolePage() {
  return <p data-fixture-console className="[--fixture-console-page:1]">fixture console</p>;
}
