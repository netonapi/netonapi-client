import { connection } from "next/server";
import { Providers } from "@/components/providers";
import { SiteBrandProvider } from "@/components/site-brand";
import { getSiteBrand } from "@/lib/site-brand";
import "@/styles/console.css";

/**
 * 登录 / 注册 / 找回密码：门户与控制台共用（public-routes §2），`private, no-store`（§8.2a：CDN 对它们回源不缓存，
 * 源站也不给可缓存的头——两层规则一致，CDN 配错了也不会把登录页缓存起来）。按请求渲染（`connection()`），
 * 品牌与人机验证配置仍走 `getSiteBrand()` 的 30 秒缓存。
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const brand = await getSiteBrand();
  return (
    <Providers>
      <SiteBrandProvider brand={brand}>{children}</SiteBrandProvider>
    </Providers>
  );
}

/** 按请求渲染：允许阻塞，不做静态外壳校验（与受保护的控制台布局相同）。 */
export const instant = false;
