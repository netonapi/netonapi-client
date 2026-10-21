import { Providers } from "@/components/providers";
import { SiteBrandProvider } from "@/components/site-brand";
import { getSiteBrand } from "@/lib/site-brand";
import "@/styles/console.css";

/** 登录 / 注册 / 找回密码：门户与控制台共用（public-routes §2），`private, no-store`。 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await getSiteBrand();
  return (
    <Providers>
      <SiteBrandProvider brand={brand}>{children}</SiteBrandProvider>
    </Providers>
  );
}
