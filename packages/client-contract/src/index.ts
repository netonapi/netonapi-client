/**
 * C 端模块契约（NETON_APPLICATION_FRONT_SPEC §4；公开路由见 docs/spec/public-routes.md §4）。
 * manifest 与站点配置必须是纯静态数据：无副作用、无 JSX、无运行时依赖 —— 构建期注册表
 * 生成脚本会在 Node 里直接 import 它们。
 *
 * 版本规则（public-routes §13）：模块声明的 contractVersion 与底座 major 相同、且 minor ≤ 底座 minor
 * 才能装配。用到 1.1.0 字段（publicRoutes、slots……）的模块必须声明 "1.1.0"。
 */

export const FRONT_CONTRACT_VERSION = "1.1.0";

export type FrontPageRendering = "server" | "client";

export interface FrontPageManifest {
  /** == 后端 system_menus.component（如 "system/user/index"） */
  key: string;
  /** 完整路由路径（如 "/system/user"），与后端菜单树 path 拼接结果一致 */
  path: string;
  /** 包内页面入口：`<pkg>/pages/<entry>` 必须可被静态 import */
  entry: string;
  rendering: FrontPageRendering;
  /** 不由后端菜单直接下发的模块内页面，例如 `/privchat/user/:id`。 */
  standalone?: boolean;
  /**
   * 决定**工作区实例身份**的参数名（路径参数或查询参数）。
   *
   * 只有这些参数变化才算「另一个资源」，才会新开页签；未列出的查询参数
   * 一律视为视图状态（翻页、筛选、切 section），落在同一个页签里。
   *
   * 省略 = 单例页面（列表页、配置页）。
   * 例：用户详情 `["id"]`；两人会话 `["uid", "peerUid"]`。
   */
  identity?: string[];
  /**
   * 页签默认标题，可用 `:name` 引用参数，如 `"用户详情 · :id"`。
   *
   * 页面加载完成后可以用 `useTabTitle()` 覆盖成更具体的名字。保留默认值是为了
   * **首帧和加载失败时页签也有名字** —— 只靠页面发布会退化成无名页签。
   */
  title?: string;
}

export interface FrontContribution {
  /** 扩展槽 id，如 "member.user.detail.tabs" */
  target: string;
  type: "tab" | "action" | "widget";
  id: string;
  entry: string;
  permission?: string;
}

export interface FrontLocaleManifest {
  lang: string;
  entry: string;
}

export interface FrontModuleManifest {
  /** 唯一模块 id，构建期查重；也是语言包命名空间与各类 key 的前缀 */
  id: string;
  /** 兼容的 contract 版本：major 与底座相同且 minor ≤ 底座 minor */
  contractVersion: string;
  /** 依赖的其他模块 id，构建期校验存在性 */
  requires?: string[];
  /** 控制台页面（路径相对 consoleBasePath） */
  pages: FrontPageManifest[];
  locales?: FrontLocaleManifest[];
  contributions?: FrontContribution[];
  /** 匿名、可缓存、可收录的公开页面（1.1.0，public-routes §4） */
  publicRoutes?: PublicRouteManifest[];
  /** 本模块声明的插槽 id（必须以 `<模块 id>.` 开头），供别的模块往里贡献（1.1.0） */
  slotTargets?: string[];
  /** 往插槽里贡献的组件（1.1.0，public-routes §10.2） */
  slots?: SlotContribution[];
  /** 按对象类型渲染卡片（1.1.0，§10.3） */
  cardRenderers?: CardRendererManifest[];
  /** sitemap 分片贡献（1.1.0，§11.2） */
  sitemaps?: SitemapContribution[];
  /** RSS 贡献（1.1.0，§11.3） */
  feeds?: FeedContribution[];
}

export function defineFrontModule(m: FrontModuleManifest): FrontModuleManifest {
  return m;
}

// ---------------------------------------------------------------------------
// 公开路由（public-routes §4）

/**
 * 路径参数规则。不合法直接 404，不打后端。
 * - `id`：十进制正整数，≤ 19 位（与后端 Long 主键一致）
 * - `int`：十进制整数（可为 0），≤ 9 位
 * - `slug`：内容词条 slug 规则——小写的字母（含中文）、数字、`-`、`_`，首字符为字母或数字，≤ 160
 * - `code`：节点编码规则（筛选器频道、合集）——`[a-z0-9][a-z0-9_-]{0,63}`
 * - `{ enum }`：取值白名单
 */
export type PublicParamRule = "id" | "int" | "slug" | "code" | { enum: string[] };

/**
 * 缓存档位（§8.1）。档位是契约，具体时长由底座的 cacheLife 配置给出，CDN 的
 * `Cache-Control` 由 Next 按档位的 revalidate / expire 生成。
 * - `object`：详情页；`list`：栏目、标签、榜单、sitemap 分片；`static`：单页、协议；
 * - `dynamic`：搜索——不缓存、每次渲染，且**只能是 200**（流式输出后状态码不可改，§7.3）。
 */
export type PublicRouteCache = "object" | "list" | "static" | "dynamic";

export interface PublicRouteManifest {
  /** 全局唯一，`<模块 id>.<名称>`，如 "content.item"。站点配置按它覆盖 / 禁用 / 实例化。 */
  key: string;
  /** 缺省 URL 形态：静态段 + `:name` 参数（整段），不支持可选段与通配。如 "/article/:id"。 */
  pattern: string;
  /** 每个 `:name` 都必须声明规则。 */
  params?: Record<string, PublicParamRule>;
  /** 允许读取的查询参数白名单；其余参数（utm_* 等）不进缓存键、也读不到。 */
  query?: string[];
  /** `<pkg>/public/<entry>`：服务端模块，默认导出 definePublicRoute(...) 的结果。 */
  entry: string;
  cache: PublicRouteCache;
  /** 缺省 robots：false = noindex, follow。页面可按数据再收紧，不能放宽。 */
  indexable: boolean;
  /** 可被站点配置的 instances 复用（带固定参数，§4.2）。 */
  instantiable?: boolean;
  /** 对象被彻底删除后返回 410（§7.2）。只有对象详情类路由才声明。 */
  goneAware?: boolean;
  /** 旧 URL 形态：底座生成 308 到当前形态（§13）。参数名集合必须与当前形态一致。 */
  legacyPatterns?: string[];
}

/** 底座声明的插槽（§10.2）。模块自己声明的插槽写在 manifest 的 slotTargets 里。 */
export const BASE_SLOT_TARGETS = [
  "public.head",
  "public.header.actions",
  "public.sidebar",
  "public.object.toolbar",
  "public.object.after",
  "public.object.aside",
  "public.object.bar",
  "console.header.actions",
  "console.home",
] as const;

export interface SlotContribution {
  /** 插槽 id，如 "public.object.after"。 */
  target: string;
  /** `<模块 id>.<名称>`。 */
  id: string;
  /** `<pkg>/slots/<entry>`，默认导出组件。 */
  entry: string;
  /**
   * - `server`：服务端组件，自己负责缓存（`"use cache"` + 标签）；失败只影响自己。
   * - `client`：客户端岛（`"use client"`），首屏按匿名态渲染、水合后再取个性化数据。
   * 「服务端出首屏 + 客户端接管」的组件就是一个 server 组件里渲染一个 client 组件，不单列一类。
   */
  rendering: "server" | "client";
  /** 只在对象具备该能力时渲染（ObjectSummary.capabilities），如 "comment"、"favorite"。 */
  capability?: string;
  /** 只接这些对象类型；省略 = 任意。 */
  objectTypes?: string[];
  /** 小的在前；站点配置 slots.order 可覆盖。 */
  order?: number;
}

/** `<pkg>/cards/<entry>`，默认导出服务端组件 `({ card, style, ctx })`。 */
export interface CardRendererManifest { objectType: string; entry: string; }

/** `<pkg>/sitemaps/<entry>`，默认导出 defineSitemap(...)。`news` = 同时贡献 news sitemap。 */
export interface SitemapContribution { id: string; entry: string; news?: boolean; }

/**
 * `<pkg>/feeds/<entry>`，默认导出 defineFeed(...)。`pattern` 是 feed 自己的地址（如
 * `/category/:slug/rss.xml`）；`site: true` 的贡献聚合进站点 feed `/rss.xml`。
 */
export interface FeedContribution { id: string; pattern?: string; entry: string; site?: boolean; params?: Record<string, PublicParamRule>; }

// ---------------------------------------------------------------------------
// 站点配置（public-routes §3）：产品 fork 的 apps/console/site.config.ts

export type LoginMethod = "password" | "sms";

export interface SiteRouteInstance {
  /** `<路由 key>@<名称>`，如 "content.item@video" */
  key: string;
  /** 被复用的路由 key（必须 instantiable） */
  of: string;
  pattern: string;
  /** 固定参数：页面从 ctx.params 读，与 URL 参数无差别 */
  fixed: Record<string, string>;
}

/**
 * 产品 fork 手写的公开页面（首页、频道页……）：入口在 `apps/console/src/site/pages/<entry>.tsx`，
 * 默认导出 definePublicPage(...)。与模块路由走同一条生成管线与同一套构建期检查。
 */
export interface SitePageDeclaration extends Omit<PublicRouteManifest, "instantiable" | "legacyPatterns"> {
  /** `site.<名称>` */
  key: string;
}

export interface SiteConfig {
  /** 规范来源地址（canonical、sitemap、RSS、JSON-LD）。构建期可用 NETON_SITE_ORIGIN 覆盖。从不取请求的 Host。 */
  origin: string;
  /** 控制台前缀：`/` = 只有控制台的产品（缺省）；装配了公开路由时不能是 `/`。 */
  consoleBasePath: string;
  /** 第一版每个部署一种语言（prefix: "none"），§12。 */
  locales: { default: string; supported: string[]; prefix: "none" };
  /** 服务端渲染日期用的时区（IANA），缺省 Asia/Shanghai。 */
  timeZone?: string;
  /** 后端不可达时的品牌兜底（正常情况下品牌取后台配置 system.site.*）。 */
  brand?: { name: string; tagline?: string };
  auth?: {
    /** 登录页提供的方式与顺序；第一个是默认页签。缺省 ["password"]。后端仍按自己的注册策略校验。 */
    loginMethods?: LoginMethod[];
    /** 短信登录的缺省国际区号，缺省 "+86"。 */
    defaultCallingCode?: string;
  };
  routes?: {
    /** 改模块路由的 URL 形态（键 = 路由 key）。只能改形态，参数名集合必须一致。 */
    override?: Record<string, string>;
    /** 不装某条路由；它的 URL 从此 404（有意为之，不要求 legacy）。 */
    disable?: string[];
    instances?: SiteRouteInstance[];
    /** 产品改过的旧形态（键 = 路由 key 或实例 key），底座生成 308。 */
    legacy?: Record<string, string[]>;
  };
  /** fork 手写的公开页面 */
  pages?: SitePageDeclaration[];
  slots?: { order?: Record<string, string[]>; hide?: string[] };
  robots?: { disallow?: string[]; deadLinkFile?: boolean };
  /** 输出为 <meta name="…-site-verification">。 */
  verification?: { google?: string; baidu?: string; bing?: string };
  /** 站点 feed 的标题（站点外壳词条 key，命名空间 `site`）。 */
  feeds?: { site?: { title: string } };
  /**
   * 控制台在根路径（consoleBasePath = "/"）的产品里，不需要会话的额外页面（价格页、帮助页……）：
   * proxy 不对它们做登录拦截。写法同路由形态：静态段 + `:name` 整段参数（如 "/pricing"、"/docs/:slug"）。
   * 页面本身要放在受保护的控制台布局之外（如 `(auth)` 或产品自己的路由组）。有门户（前缀不是 "/"）时不能用：
   * 前缀之外本来就全部匿名。不进 sitemap；robots 仍是全站 `Disallow: /`（§11.1）。
   */
  anonymousPaths?: string[];
  /**
   * 真实用户的 Core Web Vitals 采样上报（§10.7）。不填 = 不上报。
   * `endpoint`：站内路径（如底座自带的 "/api/site/vitals"）或绝对 https 地址；`sampleRate`：0–1，按页面浏览抽样。
   */
  vitals?: { endpoint: string; sampleRate: number };
  /**
   * 热点页面预热（public-routes §8.7）：启动时、`expire` 失效之后由服务自己先请求一遍，第一个真实访客不必等渲染。
   * 站内路径（不在保留前缀里、不带查询串），≤ 20 个。缺省：有门户时 `["/"]`，控制台在根路径时为空。
   */
  warmup?: { paths: string[] };
}

export function defineSite(config: SiteConfig): SiteConfig {
  return config;
}
