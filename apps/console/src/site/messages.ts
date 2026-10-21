/**
 * 门户（公开页面）的宿主词条，命名空间 `site`：外壳、状态页、通用卡片、用户菜单。服务端翻译
 * （getServerT("site")）与客户端岛共用。产品 fork 在这里补自己外壳与首页的词条（zh-CN、en-US 两份
 * key 集合必须一致，`pnpm check:locales` 检查）。
 */
import type { StaticCatalogs } from "@neton/application-client-runtime/i18n";

export const siteCatalogs: StaticCatalogs = {
  site: {
    "zh-CN": {
      "status.notFound.title": "页面不存在",
      "status.notFound.body": "你访问的页面不存在，或者已经下线。",
      "status.gone.title": "内容已删除",
      "status.gone.body": "这个页面的内容已被永久删除。",
      "status.home": "返回首页",
      "user.login": "登录",
      "user.register": "注册",
      "user.console": "会员中心",
      "user.logout": "退出登录",
      "user.menu": "账号菜单",
      "footer.rights": "© {year} {name}",
      "card.untitled": "（无标题）",
      "nav.label": "主导航",
      "nav.skip": "跳到正文",
      "feed.site.title": "最新内容",
    },
    "en-US": {
      "status.notFound.title": "Page not found",
      "status.notFound.body": "The page you're looking for doesn't exist or is no longer available.",
      "status.gone.title": "Content removed",
      "status.gone.body": "The content of this page has been permanently removed.",
      "status.home": "Back to home",
      "user.login": "Sign in",
      "user.register": "Sign up",
      "user.console": "My account",
      "user.logout": "Sign out",
      "user.menu": "Account menu",
      "footer.rights": "© {year} {name}",
      "card.untitled": "(Untitled)",
      "nav.label": "Main navigation",
      "nav.skip": "Skip to content",
      "feed.site.title": "Latest",
    },
  },
};
