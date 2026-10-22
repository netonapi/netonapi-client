import { copyrightYear } from "./copyright-year";
import { serverI18n } from "./server-i18n";
import { renderSiteSlot } from "./slots";
import { PublicUserMenu } from "./user-menu";
import type { PortalShellProps } from "./shell-types";

/**
 * 门户外壳（public-routes §10.1）。**产品 fork 覆盖这个文件**：页头、导航、页脚、品牌。
 * 底座的缺省实现只有品牌名、用户入口与版权行。
 *
 * 外壳渲染在每个公开页里、随页面一起缓存：只能用服务端取数（`"use cache"` + 标签 `site:nav`）与
 * 客户端岛，不能读 Cookie / 请求头（构建期扫描会拦截）。
 */
export default async function PortalShell({ children, brand, locale }: PortalShellProps) {
  const [t, year] = await Promise.all([serverI18n.getServerT("site", locale), copyrightYear()]);
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main" className="sr-only focus:not-sr-only">{t("nav.skip")}</a>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4">
          <a href="/" className="text-lg font-semibold">{brand.name}</a>
          <div className="flex items-center gap-2">
            {renderSiteSlot("public.header.actions", { locale })}
            <PublicUserMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
        {t("footer.rights", { year, name: brand.name })}
      </footer>
    </div>
  );
}
