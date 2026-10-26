import { BrandMark } from "@/components/brand-mark";
import { copyrightYear } from "./copyright-year";
import { serverI18n } from "./server-i18n";
import { renderSiteSlot } from "./slots";
import { PublicUserMenu } from "./user-menu";
import type { PortalShellProps } from "./shell-types";

/**
 * NetonAPI 的门户外壳（public-routes §10.1，产品 fork 覆盖）：页头放品牌、价格页与账号入口，页脚放常用链接。
 *
 * 外壳随每个公开页一起缓存：只能用服务端取数与客户端岛，不能读 Cookie / 请求头。账号入口是客户端岛
 * （PublicUserMenu），首帧按匿名态渲染「登录 / 注册」，拿到会话后换成「进入控制台」。
 */
export default async function PortalShell({ children, brand, locale }: PortalShellProps) {
  const [t, year] = await Promise.all([serverI18n.getServerT("site", locale), copyrightYear()]);
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main" className="sr-only focus:not-sr-only">{t("nav.skip")}</a>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4">
          <a href="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="truncate text-base font-semibold">{brand.name}</span>
          </a>
          <nav aria-label={t("nav.label")} className="flex items-center gap-1 sm:gap-2">
            <a href="/pricing" className="hidden rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] sm:inline-block">{t("nav.pricing")}</a>
            {renderSiteSlot("public.header.actions", { locale })}
            <PublicUserMenu />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-[var(--border)] py-8 text-xs text-[var(--muted-foreground)]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
          <span>{t("footer.rights", { year, name: brand.name })}</span>
          <span className="flex gap-4">
            <a href="/pricing" className="hover:text-[var(--foreground)]">{t("nav.pricing")}</a>
            <a href="/login" className="hover:text-[var(--foreground)]">{t("user.login")}</a>
            <a href="/register" className="hover:text-[var(--foreground)]">{t("user.register")}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
