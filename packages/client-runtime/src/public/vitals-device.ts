/**
 * 视口宽度 → 设备档（public-routes §10.7）：与门户的断点一致（< 768 手机，< 1200 平板，其余桌面）。
 * 单独一个文件：浏览器信标只引这一个函数，校验与报告的规则（vitals.ts）不进门户的客户端包。
 */
export type DeviceClass = "mobile" | "tablet" | "desktop";

export function deviceClassOf(width: number): DeviceClass {
  if (width < 768) return "mobile";
  if (width < 1200) return "tablet";
  return "desktop";
}
