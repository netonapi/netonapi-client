/** 发行版模块装配清单 —— 对标服务端 ksp neton.modules。C 端底座默认不装模块，产品 fork 在此登记。 */
export default [
  // 通用模块：任何 Neton C 端产品都可复用
  "@neton/application-client-account",
  "@neton/application-client-member",
  "@neton/application-client-payment",
  // 产品模块：NewGate 的 API 网关自助面
  "@neton/application-client-gateway",
];
