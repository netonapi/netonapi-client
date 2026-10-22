# 公开路由契约：匿名可缓存的 SSR 页面

> 标识：NETON-APP-CLIENT-PUBLIC
> 日期：2026-10-22 · 状态：**Accepted r4**（C3 补充：`ObjectStateBatcher` §9.4、`public.object.bar` §10.2、`anonymousPaths` §2.1b、性能门禁口径 §10.6、真实用户 Web Vitals §10.7；C2 补充：密封构建 §1b、部署约束 §2.1a、媒体图片 §10.4、样式表分离 §10.5、底座端到端测试 §15；C1 已实现：契约 1.1.0、注册表生成、渲染管线、SEO 元数据、404 / 410 / 308、缓存档位与标签、失效端点、插槽与卡片、robots / sitemap / RSS 管线、短信登录与 `next` 跳回、控制台前缀；其余分期见 §15）
> 范围：`neton-application-client` 底座新增「公开路由」贡献点，让模块贡献匿名、可被 CDN 缓存、可被搜索引擎收录的 SSR 页面；产品 fork 提供门户外壳。client-contract 由 1.0.0 升到 **1.1.0**（只增不改）。
> 关联：
> - 后台底座规范 `privchat-docs/spec/07-application/NETON_APPLICATION_FRONT_SPEC.md`（模块契约、构建期注册表、RSC 非契约、贡献点）
> - 套件架构 `neton-docs/docs/zh-hans/spec/application/content-platform-architecture.md` §4（对接标准、定制三分法）
> - 服务端配套：`neton-docs/docs/zh-hans/spec/application/site-module.md`（渲染缓存失效投递、搜索引擎推送、已删除 URL 台账）
> - 首批使用方：`client-content.md`、`client-comment.md`、`client-interaction.md`（同目录）；样板产品 `itwind-docs/CLIENT_SPEC.md`

## 0. 定位

底座目前只有「受保护控制台」：登录后的工作区，全部 `no-store`，路由由模块 manifest 的 `pages` 决定。内容类产品还需要另一半——**匿名访问、首屏即完整 HTML、可缓存、可收录**的门户页面（文章、栏目、标签、作者、榜单、搜索）。

本契约给底座加一套通用机制：

| 谁 | 提供什么 |
| --- | --- |
| 底座（本仓库） | 公开路由的注册、生成与渲染管线；服务端取数客户端；SEO 元数据渲染；状态码语义；sitemap / RSS / robots；缓存与失效端点；会话水合；插槽；与控制台同域共存 |
| 模块（`neton-application-client-<name>`） | 公开页面（取数 + SEO + 渲染）、插槽组件、卡片渲染器、sitemap 与 RSS 贡献 |
| 产品 fork | 门户外壳（页头、页脚、导航、首页、品牌）、站点配置（域名、控制台前缀、路由覆盖、插槽排序、统计） |

按套件的定制三分法（架构 §4.2）：「匿名 SSR 门户」是内容、电商、社区类产品都会遇到的需求，现有扩展点（`pages` 只服务控制台）表达不了，所以**在底座里补通用扩展点**；底座不出现任何产品名或产品分支。

**不做**：多站点 / 多租户；独立移动站（`m.` 域名，响应式单域名即可）；AMP；运行期注册路由；页面级 A/B 实验框架。

## 1. 决议（已冻结）

1. 公开页面由模块在 manifest 的 `publicRoutes` 里声明，构建期生成**真实的 Next 路由文件**（不是 catch-all），每条路由有自己的元数据、状态码与缓存配置。产品 fork 的公开页面（首页等）在站点配置 `pages` 里声明、入口放 `src/site/pages/*.tsx`，走同一条生成管线与同一套检查。
1a. 缓存模型是 Next 16 的 Cache Components：生成的路由文件里 `load` 包一层模块作用域的 `"use cache"` 函数，并导出 `ensureStatic = "navigation"` 与一组**必然不合法的参数**作为 `generateStaticParams`。理由（C1 原型实测）：不加 `ensureStatic` 时，未预渲染参数的第一次请求先发出 App Shell，200 已经提交，`notFound()` 退化成 200 + noindex、`redirect()` 退化成客户端跳转；加上之后第一次请求也等完整页面，404 / 308 准确，结果进 ISR 缓存。哨兵参数让构建期只预渲染出一个 404（Cache Components 要求至少一组参数），构建不需要连后端。
1b. **构建是密封的（C2 起）：`next build` 不发任何后端请求。** 没有路径参数的可缓存路由（fork 首页 `/`、`/hot`）不再生成裸路由文件，只生成查询变体 `…/~q/[_q]`，proxy 把裸地址也改写进去（`/` → `/~q/-`，`-` 是「没有查询参数」的规范段，带路径参数的路由不接受它）。于是它们与带参数的路由同形：按需渲染 + `ensureStatic`，第一次请求等完整页面（状态码准确、不出 App Shell），结果进 ISR；构建期只预渲染哨兵 `~q/_`（404）。依赖后端的 Route Handler（sitemap 索引、站点与模块 feed）先 `connection()` 再读各自的 `"use cache"` 内容单元（按请求响应、内容照样缓存）；品牌配置在构建期直接用站点配置的兜底值（只影响构建期预渲染的哨兵页、登录注册页与站点 404，30 秒后运行期重新生成）。被否决的方案：首页 `connection()` 变动态——Cache Components 下会先流出外壳，状态码在第一个字节时就是 200；首页加假参数段——URL 变形。证据：底座端到端测试把构建期后端指向一个只计数的「绊线」服务，断言请求数为 0，并验证首页第一次请求即完整 200（`e2e/run.mts`）。
2. 公开页面的取数在服务端完成，打的是部署配置里的后端内网地址；**可缓存的渲染不携带任何会员身份**（不转发 Cookie、不带 Authorization、不读 `cookies()` / `headers()`）。
3. 缓存的 HTML 里**没有任何个性化数据**；登录态、收藏状态、我的投票等一律在客户端水合后取。
4. 规范链接（canonical）、站点地址一律取站点配置的 `origin`，**从不取请求的 Host**（防缓存投毒）。
5. 主内容不放进 `Suspense` 流式边界：取数完成、状态码确定之后才开始输出字节。
6. 控制台与门户同域：门户在根路径，控制台在 `consoleBasePath`（产品设 `/my`）；登录页、会话 Cookie 两边共用。
7. 缓存标签（cache tag）的命名是契约的一部分，前后端共用一套（§8.3），服务端 site 模块按它投递失效。
8. 所有面向用户的文案走模块语言包；错误一律按机器码翻译（`useDescribeError`），公开页同样适用。

## 2. URL 空间与共存

| 路径 | 归属 | 缓存 | 说明 |
| --- | --- | --- | --- |
| `/`、模块公开路由、fork 的公开页 | `(public)` 路由组（生成在 `(modules)` / `(site)` 下） | CDN 可缓存（§8.1） | 匿名渲染 |
| `{consoleBasePath}/*`（如 `/my/*`） | 控制台 | `private, no-store` | 受保护布局，未登录跳登录页 |
| `/login`、`/register`、`/forgot-password` | `(auth)` | 静态页（不含个人数据，可缓存） | 门户与控制台共用；支持 `?next=`；登录 / 注册 / 短信登录的 POST 都过 CSRF 检查（防登录 CSRF） |
| `/api/*` | Route Handler | `no-store` | 代理、会话、失效端点 |
| `/robots.txt`、`/sitemap.xml`、`/sitemaps/*`、`/rss.xml` 与模块声明的 feed 路径 | 底座 SEO 路由 | 可缓存 | §11 |
| `/_next/*`、`/static/*` | 静态资源 | `immutable` | 构建产物带哈希 |

### 2.1 控制台前缀

- `consoleBasePath` 在站点配置（§3）里设置，**构建期常量**。底座 `site.config.ts` 缺省 `/`，保持现有 fork（只有控制台、没有门户的产品）行为不变；这类产品的 robots.txt 为 `Disallow: /`（整站是登录后的页面），sitemap 索引为空。
- 只要装配了任何 `publicRoutes`，或 fork 在 `(public)` 下写了根页面，`consoleBasePath` 就**不能是 `/`**，注册表生成失败。
- 控制台的路由文件由注册表生成脚本按前缀生成到 `src/app/(console)/<base>/…`（`layout.tsx` 带 `instant = false`，只 re-export 入库的 `src/console/layout.tsx`、`page.tsx`；生成物不入库）；模块 manifest 里 `pages[].path` 仍写相对路径（如 `/account/profile`），实际地址是 `{consoleBasePath}/account/profile`。模块里的 `KitLink` / `WorkspaceLink` 照写工作区地址，渲染 `<a href>` 时自动加前缀；工作区之外的跳转用运行时的 `consoleHref(path)`，**禁止**写死前缀。
- 工作区宿主的前缀支持已在 `neton-application-front` 的 `front-workspace` 落地（ecadcb6）：`createBrowserHistoryHost({ basePath })`，工作区内部地址（manifest path、页签、持久化）一律不带前缀，只有地址栏与 `<a href>` 加前缀（适配器新增 `toExternal` / `toInternal`，kit 导航新增 `hrefOf`）；admin 线传空串，行为不变。
- 没有会话 Cookie 访问控制台：proxy 直接 307 到 `/login?next=<原地址>`（原地址就是控制台首页时省略 `next`，缺省即回控制台首页）；Cookie 在但会话失效时由受保护布局按 proxy 放进请求头的原地址跳登录。

### 2.1a 部署约束：不以 IP 字面量绑定

`next start -H 127.0.0.1`（或 standalone 的 `HOSTNAME=127.0.0.1`）时，Next 16.4 把 proxy 看到的 `request.nextUrl` 建成 `http://localhost:<port>`，路由层却按 `http://127.0.0.1:<port>` 判断改写目标是否同源——源不一致，改写被当成外部代理，`~q` 查询段与无参数页面全部落空成 404（底座端到端测试实测；`skipProxyUrlNormalize` 不改变这一点）。Next 服务绑 `0.0.0.0` 或 `localhost`，内网隔离交给防火墙与反代（§8.4 暴露面同理）。底座端到端测试按此启动。

### 2.1b 控制台在根路径的匿名页面（C3）

只有控制台、没有门户的产品（`consoleBasePath = "/"`）里，除登录注册页、接口与 SEO 文件之外的地址都属于控制台、没有会话就跳登录。产品若有几张不需要登录的页面（价格页、帮助页），在站点配置里声明：

```ts
anonymousPaths: ["/pricing", "/docs/:slug"],
```

- 写法同路由形态（§4：静态段 + `:name` 整段参数），由 `resolveSite()` 校验：语法、不能是 `/`、不能落在保留前缀（§2.2）下、彼此不能重叠；**有门户（前缀不是 `/`）时配置即失败**——前缀之外本来就全部匿名。
- 只影响 proxy 的登录拦截：匹配的地址不跳登录。页面文件仍要放在受保护的控制台布局之外（如 `(auth)` 路由组或产品自己的路由组），否则受保护布局照样要求会话。
- 它们不是公开路由：不进 sitemap，robots.txt 仍是 `Disallow: /`（§11.1）；需要被收录的页面应该做成公开路由（产品就得有控制台前缀）。
- 取代产品 fork 里手写的 proxy 白名单（NetonAPI 的 `/pricing` 已迁移）：fork 不改 `proxy.ts`。

### 2.2 保留前缀

模块与 fork 的公开路由不得占用：`consoleBasePath`、`/api`、`/login`、`/register`、`/forgot-password`、`/_next`、`/static`、`/robots.txt`、`/sitemap.xml`、`/sitemaps`、`/rss.xml`、`/favicon.ico`、`/.well-known`、`/indexnow-key.txt`。冲突即构建失败。路径段 `~q` 是内部查询段（§4.3），外部直接访问一律 404。

## 3. 站点配置（fork 的增量文件）

`apps/console/site.config.ts`，纯静态数据（与 `client.modules.ts` 一样会被生成脚本在 Node 里 import）：

```ts
export default defineSite({
  /** 规范来源地址：canonical、sitemap、RSS、JSON-LD 都用它。部署可用 NETON_SITE_ORIGIN 覆盖（构建期读取）。 */
  origin: "https://www.example.com",
  consoleBasePath: "/my",
  locales: { default: "zh-CN", supported: ["zh-CN"], prefix: "none" },   // §12；控制台与登录页可选的语言也取这里
  timeZone: "Asia/Shanghai",
  brand: { name: "itwind" },                                              // 后端不可达时的品牌兜底
  auth: { loginMethods: ["sms", "password"], defaultCallingCode: "+86" }, // 缺省 ["password"]
  pages: [{ key: "site.home", pattern: "/", entry: "home", cache: "list", indexable: true }],  // fork 页面 → src/site/pages/home.tsx
  routes: {
    /** 改模块路由的 URL 形态（键 = 路由 key）。只能改形态，参数名必须一致。 */
    override: { "content.item": "/article/:id" },
    /** 不装某条路由（模块的其他路由照常）。 */
    disable: ["content.archive"],
    /** 同一入口的额外实例，带固定参数（§4.2）。 */
    instances: [{ key: "content.item@video", of: "content.item", pattern: "/video/:id", fixed: { type: "video" } }],
  },
  slots: { order: { "public.object.toolbar": ["interaction.favorite", "content.share"] }, hide: [] },
  robots: { disallow: ["/search"], deadLinkFile: true },
  verification: { google: "", baidu: "", bing: "" },   // 输出为 <meta name="…-site-verification">
  feeds: { site: { title: "site.feed.title" } },       // 词条 key（命名空间 site）
  vitals: { endpoint: "/api/site/vitals", sampleRate: 0.1 },  // 真实用户 Web Vitals 上报（§10.7），不填 = 不上报
  // anonymousPaths: ["/pricing"],                      // 只用于控制台在根路径的产品（§2.1b）
});
```

- 密钥不进这个文件：失效端点的共享密钥 `NETON_SITE_REVALIDATE_SECRET`、IndexNow key `NETON_SITE_INDEXNOW_KEY` 走环境变量（运行期读取）。
- 品牌名、描述、版权、备案号等沿用底座现有的品牌配置（`getSiteBrand()`，`"use cache"` + `list` 档 + 标签 `site:config`），不进 i18n。
- 门户外壳是固定位置的文件 `apps/console/src/site/portal-shell.tsx`（§10.1），底座给一个最小默认实现，fork 覆盖。
- 站点配置由运行时的 `resolveSite()` 统一解析与校验（生成脚本与 `next.config` 都调它）：origin 只能是 `scheme://host[:port]`、前缀只能是小写普通路径段、`loginMethods` 只能是 `password` / `sms`、时区必须是合法 IANA 名、`media` 与缓存档位冲突（§8.1）即启动 / 构建失败。登录方式是产品配置，后端仍按自己的注册策略校验（理由：account 模块没有对网页公开注册策略的匿名接口，登录方式又是构建期的页面形态，放站点配置最直接）。
- 原来的 `NEXT_PUBLIC_NETON_LOCALES` / `_DEFAULT_LOCALE` / `_TIME_ZONE` 构建变量已删除：控制台与登录页的语言列表也取 `locales`（单一来源，单语言门户不会出现浏览器语言的登录页）。

## 4. 契约增量（client-contract 1.1.0）

```ts
export const FRONT_CONTRACT_VERSION = "1.1.0";

export interface FrontModuleManifest {
  // …1.0.0 的字段不变
  publicRoutes?: PublicRouteManifest[];
  slotTargets?: string[];                // 本模块声明的插槽 id（以 `<模块 id>.` 开头）
  slots?: SlotContribution[];            // 公开页与控制台的插槽贡献（§10）
  cardRenderers?: CardRendererManifest[];// 按对象类型渲染卡片（§10.3）
  sitemaps?: SitemapContribution[];      // §11.2
  feeds?: FeedContribution[];            // §11.3
}

export interface PublicRouteManifest {
  /** 全局唯一，`<模块 id>.<名称>`，如 "content.item"。站点配置按它覆盖 / 禁用 / 实例化。 */
  key: string;
  /** 缺省 URL 形态：静态段 + `:name` 参数（整段），不支持可选段与通配。如 "/article/:id"。 */
  pattern: string;
  /** 参数校验：id = 十进制正整数（≤ 19 位，≤ Long 上限），int，slug = 词条 slug 规则（小写字母含中文、数字、`-`、`_`），code = 节点编码 `[a-z0-9][a-z0-9_-]{0,63}`，enum。不合法直接 404，不打后端。 */
  params?: Record<string, "id" | "int" | "slug" | "code" | { enum: string[] }>;
  /** 允许读取的查询参数白名单；其余参数不进缓存键（统计参数 utm_* 等一律剥掉）。 */
  query?: string[];
  /** `<pkg>/public/<entry>`，服务端模块，导出 definePublicRoute(...) 的结果。 */
  entry: string;
  /** 缓存档位（§8.1）。 */
  cache: "object" | "list" | "static" | "dynamic";   // dynamic 只能 200，必须 indexable: false（§7.3）
  /** 缺省 robots：false = noindex, follow。页面可按数据再收紧，不能放宽。 */
  indexable: boolean;
  /** 可被站点配置的 instances 复用（带固定参数）。 */
  instantiable?: boolean;
  /** 该路由的对象被彻底删除后返回 410（§7.2）。 */
  goneAware?: boolean;
  /** 旧 URL 形态：底座生成 308 到当前形态，改路由不丢收录（§13）。 */
  legacyPatterns?: string[];
}

export interface SlotContribution {
  /** 插槽 id（§10.2），如 "public.object.after"。 */
  target: string;
  id: string;                               // "<模块 id>.<名称>"
  entry: string;                            // `<pkg>/slots/<entry>`
  rendering: "server" | "client";          // 「服务端首屏 + 客户端接管」= server 组件里渲染 client 岛，不单列 hybrid
  /** 只在对象具备该能力时渲染（ObjectSummary.capabilities），如 "comment"、"favorite"。 */
  capability?: string;
  /** 只接这些对象类型；省略 = 任意。 */
  objectTypes?: string[];
  order?: number;
}

export interface CardRendererManifest { objectType: string; entry: string; }   // `<pkg>/cards/<entry>`
export interface SitemapContribution { id: string; entry: string; news?: boolean; }   // `<pkg>/sitemaps/<entry>`
export interface FeedContribution { id: string; pattern?: string; entry: string; site?: boolean; params?: Record<string, ParamRule>; }  // `<pkg>/feeds/<entry>`；site = 聚合进 /rss.xml
```

模块包新增导出子路径：`./public/*`、`./slots/*`、`./cards/*`、`./sitemaps/*`、`./feeds/*`。`./manifest` 仍是纯静态数据。

### 4.1 路由入口

```ts
export default definePublicRoute<Data>({
  /** 服务端取数。只能用 ctx 给的能力；不能读 Cookie、请求头、会话。 */
  async load(ctx): Promise<PublicLoadResult<Data>>,
  /** 由数据生成 SEO 元数据（§6）。ctx 不含 backend：元数据只能由 load 的数据推出。 */
  seo(data, ctx): PublicSeo,
  /** 页面组件（服务端组件），只拿 data 与 ctx 的只读部分。 */
  Page,
});

type PublicLoadResult<D> =
  | { kind: "ok"; data: D; tags?: string[]; cache?: CacheProfileName }  // tags 见 §8.3；data 必须可被 RSC 序列化
  | { kind: "not_found"; tags?: string[] }                              // 404
  | { kind: "unavailable"; tags?: string[] }                            // 404 + noindex，短缓存（§7）
  | { kind: "gone"; tags?: string[] }                                   // 页面层 404，记入已删除集合，此后 proxy 给 410
  | { kind: "redirect"; to: string; permanent: boolean }                // 308 / 307

interface PublicRouteContext {
  params: Record<string, string>;   // 已按 params 校验
  query: Record<string, string>;    // 只含白名单内的参数
  locale: string;
  site: { origin: string; name: string; consoleBasePath: string; locale: string; timeZone: string };
  backend: PublicBackend;           // §5
  t: ServerTranslator;              // §12，按模块命名空间
  href(routeKey: string, params?: Record<string, string>): string | null;   // 按站点配置生成路径；路由未装配返回 null
  path: string;                     // 当前页面的规范路径：按路由形态与路径参数生成，不含查询串，实例的固定参数不在路径里（运行时 pathOf()）
}
// Page 的 ctx 另有 renderSlot(target, { objectRef, summary }) 与 renderCards(cards, { styles, eagerImages, priorityFirst, headingLevel })（§10）
```

`load` 是缓存单元：生成的路由文件里模块作用域的 `"use cache"` 函数以 `(规范化 params, 白名单 query)` 为键缓存它的结果（路由 key 与 locale 是该文件与部署的常量），按返回的 `tags` 打标签、按结果类型选档位（§8.1）。`"use cache"` 必须写在路由文件里而不是运行时包里：缓存函数只能闭包住可序列化的值，路由定义里有函数。`Page` 不得再自行取数（需要的数据都在 `load` 里取齐，避免一页里出现多个缓存时效不一的主内容）；插槽有各自的缓存单元（§10.2）。

### 4.2 路由实例

`instantiable: true` 的路由可被站点配置复制成多个实例，每个实例有自己的 URL 与固定参数（`fixed`），例如同一个内容详情入口分别服务 `article` 与 `video` 两种类型。实例 key 形如 `content.item@video`。模块用 `ctx.params` 读固定参数，与 URL 参数无差别。

### 4.3 查询参数

Cache Components 下读 `searchParams` 就是请求期数据，页面再也不能整页缓存。所以底座把查询参数「挪进路径」：proxy 只保留 `query` 白名单里的参数（每个键取第一个非空值、单值 ≤ 512 字符）、按键排序、base64url 编码成一个路径段，内部改写到 `<路由>/~q/<编码>`；生成脚本为有 `query` 的路由多生成一个 `…/~q/[_q]/page.tsx` 变体，页面从参数里解码。效果：白名单外的参数（utm_* 等）到不了页面也不进缓存键；参数顺序不同命中同一份缓存；带查询的页面照样整页缓存、状态码照样准确。解码只接受规范形式，外部直接访问 `~q` 段由 proxy 拦成 404。

## 5. 服务端取数

`ctx.backend`（运行时 `@neton/application-client-runtime/public-server`）：

| 方面 | 约定 |
| --- | --- |
| 地址 | `NETON_BACKEND_INTERNAL_URL`（部署配置，内网直连后端，不经 CDN）；缺省回落到 `NETON_BACKEND_URL` |
| 身份 | 无。不带 Cookie、Authorization、客户端 IP。只调后端 `/app/*` 下标了匿名可读的接口 |
| 信封 | 与 `backendJson` 同一套解析：`code === 0` 取 `data`；机器码原样上抛为 `PublicBackendError(code, message, status)`，由 `load` 决定映射成 `not_found` / `unavailable` / `gone` 还是抛出 |
| 超时 | 单请求缺省 3 秒，`load` 总预算 5 秒；超时与连不上抛出（走 §7 的 5xx 路径），不吞成空数据 |
| 并行 | `load` 内多个请求用 `Promise.all`；同一渲染内对同一 URL 的 GET 自动去重 |
| 动态路由 | 只有 `cache: "dynamic"` 的路由（如搜索）由底座构造带客户端转发头（X-Forwarded-For、User-Agent）的取数客户端，让后端按真实客户端 IP 限流；模块代码拿不到请求头。后端只在对端地址属于 `ratelimit.trusted_proxies`（Next 服务的出口）时才信这个头——按来源地址认证，沿用框架现有的可信代理机制（R10），不另设共享密钥：多一把密钥不增加安全性（能伪造来源地址的人也拿得到同机的密钥），只增加配置面 |

**为什么可缓存渲染不转发客户端 IP**：缓存后的结果会发给所有人，取数时是谁触发的无关紧要；把触发者的 IP 带进去只会让后端的限流误伤或被利用。

**限流决议**：匿名、可缓存的只读接口（详情、列表、栏目树、频道 / 楼层）**不按 IP 限流**——所有服务端渲染都来自 Next 的同一个出口，按 IP 限流等于所有访客一起被限（爬虫顺着分页走就会把 429 变成 500）；这类读取的滥用防护放在边缘（CDN / nginx）。搜索与写接口照常按真实客户端 IP 限流。filter 的三个匿名读接口已按此去掉 IP 限流（module-filter 0e6955d）；content、comment 的匿名读接口随 C2、C3 调整。

**构建期检查**：生成脚本从每个服务端入口（模块的 public / cards / sitemaps / feeds、`rendering: "server"` 的插槽、fork 的 `src/site/pages/*` 与 `portal-shell.tsx`）出发，沿相对 import 与 `@/` 别名递归扫描（遇到 `"use client"` 文件停下，注释不算），出现 `next/headers`、`@neton/application-client-runtime/server`、`apiFetch` / `apiWrite`、`connection()` 即失败。

## 6. SEO 元数据

```ts
interface PublicSeo {
  title: string;                         // 页面自身标题；站点模板「%s · 站点名」由底座套
  titleAbsolute?: boolean;               // 首页等不套模板
  description?: string;                  // 底座截到 160 字符（按字素），去换行
  keywords?: string[];                   // 输出 <meta name="keywords">（百度仍参考）
  canonical?: string;                    // 路径或绝对地址；缺省 = 当前路径（不含查询参数）
  robots?: { index?: boolean; follow?: boolean; maxImagePreview?: "large" | "standard" | "none" };
  openGraph?: {
    type: "website" | "article" | "profile";
    images?: { url: string; width?: number; height?: number; alt?: string }[];
    article?: { publishedTime?: string; modifiedTime?: string; section?: string; tags?: string[]; authors?: string[] };
  };
  jsonLd?: object[];                     // schema.org 对象，底座负责序列化与转义
  pagination?: { prev?: string; next?: string };
  alternates?: { languages?: Record<string, string>; feeds?: { title: string; href: string }[] };
}
```

规则：

- **canonical**：缺省 = 当前路径 + 白名单内的规范查询串（带游标的列表页指向自己，不指向第一页）；模块给的相对路径拼站点 `origin` 且去掉查询参数；同站的绝对地址规范成本站地址；异站绝对地址（编辑指定的外站规范链接，如转载指向原文）原样保留。
- **robots**：页面值与路由 `indexable` 取更严的一方；404 / 410 / `unavailable` 恒为 `noindex`；`max-image-preview:large` 缺省开启（资讯类在搜索结果里的大图依赖它）。
- **Open Graph / Twitter**：底座由 `openGraph` 同时生成 `og:*` 与 `twitter:card`（有图 `summary_large_image`，否则 `summary`）；`og:site_name`、`og:locale` 自动填。
- **JSON-LD**：每个对象单独一个 `<script type="application/ld+json">`；底座把 `<`、`>`、`&` 与 U+2028/2029 转义，保证不能闭合脚本标签。运行时提供构造器 `jsonLd.article()`（NewsArticle / Article，headline 截 110 字符）、`breadcrumb()`、`itemList()`、`collectionPage()`、`webPage()`、`person()`、`webSite()`（有搜索路由时带 `SearchAction`）、`organization()`，字段规则写在构造器里，模块不手拼。站点级 `WebSite` 与 `Organization` 由**首页**（fork 页面）用构造器输出——底座不认识哪一页是首页；注册表导出 `searchRoute` 供首页拼 `SearchAction`。
- **分页**：`pagination` 输出 `<link rel="prev/next">`（React 19 把它提升到 `<head>`）。Google 已不使用它，但百度等仍参考，成本为零。
- **description** 按字素（`Intl.Segmenter`）截到 160，换行与连续空白压成一个空格；`verification` 的 Bing 输出为 `msvalidate.01`、百度为 `baidu-site-verification`。
- **RSS 发现**：`alternates.feeds` 输出 `<link rel="alternate" type="application/rss+xml">`；站点 feed 由底座在所有公开页输出。
- 站点验证（`verification`）输出为对应的 meta 标签。

## 7. 状态语义

### 7.1 映射

| `load` 结果 | HTTP | robots | 缓存 | 典型场景 |
| --- | --- | --- | --- | --- |
| `ok` | 200 | 按 §6 | 按路由档位 | — |
| `not_found` | 404 | noindex | `list` 档（短） | ID 从未存在、参数不合法、类型不匹配 |
| `unavailable` | 404 | noindex | 60 秒 | 对象暂时下线：撤回、归档、进回收站（`ObjectUnavailable(permanent = false)`），之后可能重新发布 |
| `gone` | 页面层 404，此后 410（§7.2） | noindex | 1 天 | 对象已彻底删除（`ObjectUnavailable(permanent = true)`） |
| `redirect` | 308（permanent）/ 307 | — | 按路由档位 | slug 变化、canonical 与当前 URL 不一致、跳转型内容 |
| 抛出（后端不可用、超时） | 500 | — | 不缓存 | 有旧缓存时先给旧的（§8.2） |
| 参数 / 查询段不合法 | 404 | noindex | `list` 档 | 不打后端 |

决议（产品决定 4）：**删除 → 410**（proxy + 从 site 模块已删除台账同步的集合）；**撤回 / 下线 → 404 + noindex**；**从未存在 → 404**。

为什么暂时下线用 404 而不是 410：410 会让搜索引擎更快、更彻底地丢弃 URL，只该在确定不会回来时使用；撤回后重新发布在资讯站很常见。

### 7.2 410 的实现

App Router 的页面只能产出 404（`notFound()`）与重定向，不能产出 410。底座的做法：

- `goneAware` 路由由底座的 `proxy.ts`（Next 16 的请求代理）先查**已删除 URL 集合**，命中即由 proxy 直接返回 410：一份生成期按站点语言写好的独立静态 HTML（`<meta name="robots" content="noindex">` + `X-Robots-Tag: noindex`，文案取宿主 `site` 命名空间的 `status.gone.*`，缓存一天），不进入页面渲染。不用「改写到内部 410 页面 + 状态码」：C1 实测 Next 16 不保证改写后的响应带上 proxy 给的状态码（同一 URL 时而 410 时而 200）。
- **失效目标就绪（site-module §6.0，产品决定 2）**：Next 服务启动时（以及已删除集合的同步从失败恢复时）向后端发签名的 `POST /platform/site/target/ready`（payload = 原始请求体 `{}`；多实例可设 `NETON_SITE_REVALIDATE_TARGET` 只唤醒自己），后端把积压的失效投递立即重排、清零退避，下一个投递节拍就按顺序合并补投——重启不再等退避窗口（后端退避上限也降到 60 秒）。启动时按 1–60 秒退避重试直到成功；后端没装 site 模块或没配密钥时记一次日志后停止（运行时 `signalSiteReady`，底座端到端测试断言启动后收到一次签名正确的信号）。
- 集合的来源是服务端 site 模块的已删除台账：失效端点收到 `gone` 条目时加入（§8.5）；Next 服务启动时、以及每 10 分钟，从后端 `GET /platform/site/gone?since=` 增量同步（签名鉴权，site-module §6）。
- 多实例部署时集合放在共享缓存里（`setGoneStore()` 换实现，与 §8.6 的共享缓存同一处）；单实例放进程内，挂在 `process` 对象上：proxy 跑在自己的上下文里，能读到主上下文 `globalThis` 上已有的属性，自己写上去的属性主上下文却看不到（C1 实测：proxy 先访问时两边各建一份，集合分裂），`process` 是两边共享的同一个对象。
- 站点配置 `robots.deadLinkFile = true` 时集合同时输出为 `/sitemaps/gone.txt`（§11.5）。
- 页面 `load` 在后端返回「已删除」机器码时也返回 `gone`——此时底座以 404 输出（页面层做不到 410），并把路径加入集合，下一个请求起就是 410。

### 7.3 `dynamic` 档只能是 200

`dynamic` 路由（搜索）不缓存、每次渲染。Cache Components 下这类渲染先输出静态外壳，状态码在第一个字节时就是 200，之后的 `notFound()` 只能退化成 noindex（C1 原型实测，与 `ensureStatic` 的整页路由不同）。所以契约规定 `dynamic` 路由必须 `indexable: false`、不能 `goneAware`；空查询、被限流、后端出错都在页面里说明（`useDescribeError` 翻译机器码），HTTP 状态恒为 200。

## 8. 缓存与失效

### 8.1 档位

两层缓存：Next 的渲染 / 数据缓存（Cache Components：`"use cache"` + `cacheTag` + `cacheLife`，整页 ISR），以及 CDN 的 HTML 缓存。档位是契约，时长是运行时包 `PUBLIC_CACHE_PROFILES` 的常量（单一来源，调用处直接传对象，不在 `next.config` 再注册一份名字）：

| 档位 | 用途 | stale / revalidate / expire |
| --- | --- | --- |
| `object` | 详情页（文章、作者） | 60 秒 / 60 秒 / 7 天，**事件驱动失效为主** |
| `list` | 栏目、标签、频道、榜单、首页、sitemap 分片、外壳导航 | 30 秒 / 30 秒 / 1 小时 |
| `static` | 单页、协议、robots、历史 sitemap 分片 | 5 分钟 / 5 分钟 / 30 天 |
| `unavailable` | `load` 返回暂时下线 | 30 秒 / 60 秒 / 10 分钟 |
| `gone` | `load` 返回已删除（页面层 404） | 5 分钟 / 1 天 / 7 天 |
| `dynamic` | 搜索 | 不缓存，`private, no-store` |

- **CDN 的 `Cache-Control` 由 Next 生成**：整页里**最短**的档位决定 `s-maxage = revalidate`、`stale-while-revalidate = expire − revalidate`（例：首页 `s-maxage=30, stale-while-revalidate=3570`）。不另写一张 CDN 头的表：两套时长迟早不一致。revalidate 刻意短——没有 CDN 主动刷新时，它就是 CDN 层的新鲜度上限；事件驱动的失效（§8.4）才是主路径。Route Handler（sitemap、RSS、robots）用 `cacheControlFor(档位)` 输出同一形式。
- 不输出 `stale-if-error`：渲染失败时 Next 自己继续给旧缓存；CDN 侧按产品的 CDN 配置开启回源失败给旧内容。
- Next 的预渲染规则：stale ≥ 30 秒、expire ≥ 5 分钟，否则被排除出预渲染、变成请求期的动态洞，整页缓存不成立——档位都满足这两条。
- **与签名媒体地址的约束（产品决定 1；C4 改为单一来源）**：签名有效期的唯一来源是后端的部署配置（infra-media §7.3 的 `GET /app/infra/media/policy`），站点配置不重复它（C3 的站点 3600 与开发后端 600 不一致告警就出在两处各配一个数）。`object` / `list` / `static` 的 revalidate 在运行期经 `cacheProfile()` 收紧到 ≤ 有效期 / 2；取到策略之前按最短的受支持有效期（120 秒，即 revalidate ≤ 60 秒）收紧；有效期为 null（稳定地址）不收紧；后端的有效期短于 60 秒时记错误 `site.media.policy.invalid`（档位 stale 下限 30 秒，页面缓存名存实亡）。超过 revalidate 之后的 stale-while-revalidate 窗口里给出的旧页面，以及长时间打开的标签页，由客户端的图片兜底刷新（infra-media §7.3）。
- 控制台与 `/api/*` 恒为 `private, no-store`；页面渲染时不得读当前时间（版权年份等用 `"use cache"` 包成缓存单元）。

### 8.2 缓存安全

- 公开路由的响应**绝不 `Set-Cookie`**，不 `Vary: Cookie`；CDN 的缓存键忽略 Cookie，并剥掉白名单外的查询参数（与 §4 的 `query` 一致）。C1 验收：带与不带会话 Cookie 拿到的首页、频道页 HTML 逐字节一致。
- Next 的响应带 `Vary: rsc, next-router-state-tree, …`：门户页面之间一律整页导航（普通 `<a>`），不用客户端路由预取，CDN 只需按 URL 缓存文档请求；带 `RSC` 头的请求不缓存。
- 渲染失败时：Next 缓存里有旧版本就继续给旧版本（stale-if-error），CDN 同理；5xx 不进缓存。
- `origin` 来自站点配置，`X-Forwarded-Host` / `Host` 只用于 CSRF 同源判断，不参与任何 URL 生成。

### 8.3 标签命名（前后端共用）

| 标签 | 含义 | 谁打 | 谁失效 |
| --- | --- | --- | --- |
| `obj:{type}:{id}` | 某对象的公开表示 | 渲染了该对象的任何缓存单元（详情页、卡片所在的列表、评论区里的每条评论） | 对象可见性变化、线上版本变化 |
| `feed:{type}` | 含该类型对象的所有列表 | 列表、首页楼层、sitemap 分片、RSS | 该类型有对象上线或下线（合并，见下） |
| `node:{nodeType}:{nodeId}` | 某个列表节点自身（栏目、标签、频道、楼层、合集） | 节点页、用到节点名称的面包屑与导航 | 节点改名、改设置、改挂载 |
| `thread:{type}:{id}` | 某对象的评论区第一页 | 评论区插槽 | 一般不主动失效，靠 `list` 档短 TTL；评论被隐藏 / 删除时走 `obj:comment.comment:{id}` |
| `site:nav` | 全站导航、栏目树 | 门户外壳 | 栏目树变化、频道列表变化 |
| `site:config` | 站点级配置 | 外壳 | 手动 |

- `type` 是 `ObjectRef.type`（如 `content.item`、`comment.comment`），`id` 原样；各段只允许 `[A-Za-z0-9._~-]`。标签总长 ≤ 256，超出不打。运行时构造器 `objTag` / `feedTag` / `nodeTag` / `threadTag` / `SITE_NAV_TAG` / `SITE_CONFIG_TAG`；失效端点只接受这几种形状（`isContractTag`）。
- 列表缓存单元除了 `feed:{type}`，还要给列表里的**每个对象**打 `obj:` 标签：对象被撤回时，所有展示过它的列表立即失效，不必等 `feed` 的合并窗口。
- 评论区插槽给渲染出的每条评论打 `obj:comment.comment:{id}`：管理员隐藏一条评论，只失效包含它的评论区。

### 8.4 失效端点

`POST /api/site/revalidate`（底座实现；服务端 site 模块调用，site-module §5）：

```json
{ "eventId": "01JB…", "items": [ { "tag": "obj:content.item:1024", "mode": "expire" }, { "tag": "feed:content.item", "mode": "refresh" } ],
  "gone": [ "/article/998" ], "revived": [ "/article/1001" ] }
```

| 方面 | 约定 |
| --- | --- |
| 鉴权 | 头 `X-Neton-Signature: t=<epoch 秒>,v1=<hex>`，`v1 = HMAC-SHA256(NETON_SITE_REVALIDATE_SECRET, t + "." + 原始 body)`，常数时间比较；`|now - t| > 300` 拒绝。失败 401，信封 `code = 10001`、`message = SIGNATURE_INVALID` / `SIGNATURE_EXPIRED`。密钥 < 32 字节视为未配置：端点 503 `REVALIDATE_DISABLED`，启动日志 `site.revalidate.disabled` |
| 校验 | 标签必须是契约形状、`mode` 只有 refresh / expire、`eventId` 为 `[A-Za-z0-9._:-]{1,128}`；400 `REVALIDATE_INVALID`（code 10100）带字段错误；同一标签既 refresh 又 expire 时 expire 胜出 |
| `mode` | `refresh` = `revalidateTag(tag, "max")`（先给旧的、后台刷新，用于上线与更新）；`expire` = 立即过期（`revalidateTag(tag, { expire: 0 })`，用于下线：撤回的内容不能再被任何人看到） |
| `gone` / `revived` | 加入 / 移出已删除 URL 集合（§7.2）；路径必须以 `/` 开头且不在保留前缀里 |
| 幂等 | 按 `eventId` 记最近 10 000 条，重复请求直接 200（`duplicate: true`）；即使不去重，标签失效本身也是幂等的 |
| 限额 | 单次 ≤ 500 个标签、≤ 500 条路径；超出 400 `REVALIDATE_TOO_LARGE`（code 10106），由调用方拆批 |
| 响应 | `{ code: 0, data: { applied: n } }`；不访问后端、不渲染页面，单次处理 < 100 ms |
| 暴露面 | 部署时只对内网开放（反代不把 `/api/site/*` 暴露到公网，或按来源地址放行）；签名是第二道门 |

**已知竞态（stale-while-revalidate 固有）**：一个页面正处于「先给旧的、后台重渲染」状态时，若数据在后台渲染**开始之后**才变化、`expire` 又在这次后台渲染**写回之前**到达，写回的结果仍是变化前的数据（Next 不按失效时间丢弃在途的后台渲染）。窗口等于一次渲染耗时；之后的 `refresh` / 档位到期会纠正。对下线（撤回）这类必须立即生效的变化，site 模块的投递在 `expire` 成功后 1 秒内对同一组标签再投一次 `expire`（site-module §5.1），即可覆盖这个窗口。

### 8.5 失效顺序

服务端先调失效端点、成功后再刷新 CDN（site-module §5.3）。反过来会出现「CDN 已刷新、回源又拿到 Next 里的旧缓存再缓存一轮」。

### 8.6 多实例

`revalidateTag` 只作用于本实例的缓存。多实例部署必须配置共享的缓存处理器（`cacheHandlers`，如 Redis），否则失效端点要对每个实例各调一次（site 模块支持配置多个目标，但不推荐）。单实例部署不需要。

## 9. 个性化与水合

### 9.1 会话

- 会话 Cookie 仍是 `neton_client_session`（HttpOnly、`SameSite=Lax`、`path=/`），门户与控制台天然共享。
- 公开布局挂 `<PublicSessionProvider>`：水合后请求 `GET /api/session`（`private, no-store`）→ `{ authenticated, user?: { userId, nickname, avatar } }`。页头的用户菜单、评论框、收藏按钮都从这里读。服务端渲染一律按「未登录」出 HTML。
- `GET /api/session` 用现有的 `getMemberProfile`；会话失效时清 Cookie 并返回 `authenticated: false`（不是 401，避免公开页上触发跳转）。

### 9.2 匿名到登录

- 需要登录的操作（收藏、发评论、投票、举报）在匿名时调用运行时的 `requireLogin({ returnTo })`：跳 `/login?next=<当前路径 + 锚点>`。
- 登录 / 注册 / 短信登录的 Route Handler 成功后按 `next` 跳回。`next` 必须是本站相对路径：以 `/` 开头、不以 `//` 或 `/\` 开头、不进 `/api/`，解码后再检查一次；不合格一律回 `consoleBasePath`。
- 退出登录（`/api/auth/logout`）支持 `next`，门户上退出留在当前页。
- **整页跳转（产品决定 6）**，不做登录弹层——简单、对密码管理器与人机验证最友好。
- **短信验证码登录在底座**（产品决定 6）：登录页按站点配置 `auth.loginMethods` 显示「验证码登录 / 密码登录」页签，复用 account 模块已有的 App 接口——发码经 `/api/backend` 匿名代理调 `POST /app/auth/send-sms-code`（`scene = 1`，人机验证动作 `send_code`），登录走底座 `POST /api/auth/sms-login` → `/app/auth/sms-login`（号码首次出现时后端按注册策略开户）。网页登录统一带 `device.platform = "web"`。

### 9.3 运行时调整

| 现状 | 调整 |
| --- | --- |
| `/api/backend` 代理没有 Cookie 时直接 401 | 没有 Cookie 时**不带 Authorization 转发**，是否允许匿名由后端接口决定（`@AllowAnonymous`）；仍只放行 `/app/*`，写请求仍过 CSRF 检查 |
| `apiFetch` 遇到登录失效就 `location.href = "/login"` | 区分场景：当前地址在控制台前缀下才跳 `/login?next=<当前地址>`（前缀经构建期常量 `NEXT_PUBLIC_NETON_CONSOLE_BASE_PATH` 给到客户端）；公开页内**不跳转**，抛出 `ApiError(kind = "unauthorized")`，由组件调用 `requireLogin` 或提示 |
| i18n 在客户端从 localStorage / 浏览器偏好选语言 | 公开页 `I18nProvider serverLocale`：用服务端确定的语言初始化，不读不写 localStorage（否则水合不一致）；公开岛屿要用到的模块词条由公开布局在服务端一次性给出，首帧就有译文，§12 |

### 9.4 批量状态

一页上常有多个需要「我的状态」的组件（收藏按钮、点赞、评论区里每条评论的我的投票）。运行时的 `ObjectStateBatcher`（C3 实现，`@neton/application-client-runtime/public-state`，客户端）把同一个节拍里的请求按加载器合并成一次，结果按对象分发。模块定义自己的批量加载器，彼此不认识：

```ts
export const myVotes = defineObjectStateLoader<number>({
  id: "comment.viewer-state",      // `<模块 id>.<名称>`，全局唯一（重复定义抛错；开发环境的热更新替换）
  maxBatch: 100,                   // 后端单次上限，更多的拆成几次
  fallback: 0,                     // 加载前、匿名、结果里没有的 id 都是它
  requiresSession: true,           // 缺省 true：匿名或会话确认中不请求
  load: (ids, { signal }) => apiFetch("/app/comment/viewer-state", { method: "POST", body: JSON.stringify({ commentIds: ids }), signal }).then(toRecord),
});
const { value, status } = useObjectState(myVotes, String(comment.id));   // status: idle | loading | ready | error
setObjectState(myVotes, id, 1);          // 乐观更新 / 刚发表的评论；之前在途的旧结果不覆盖它
invalidateObjectState(myVotes, [id]);    // 重新取（失败后的重试也用它）
```

| 方面 | 约定 |
| --- | --- |
| 合并 | 同一次提交里挂载的组件、以及到下一个宏任务之前的请求，按加载器去重后一次 `load(ids)`；超过 `maxBatch` 拆批 |
| 水合 | 首帧恒为 `{ value: fallback, status: "idle" }`（服务端 HTML 是匿名态），会话确定后才请求 |
| 会话 | 结果按会话用户缓存（读 `PublicSessionProvider`）；登录、退出、换账号时清空、中止在途请求，仍在订阅的 id 按新会话重新请求。匿名时不请求，状态 `idle` |
| 失败 | 不抛出：状态 `error`、值不变；普通的再次请求不重试（不会因为每次重渲染打一次后端），`invalidateObjectState` 重试 |
| 体积 | 无 React Query 依赖；只有用到它的模块的客户端岛引入 |

底座端到端测试：夹具对象页的服务端插槽里 4 个状态岛——匿名时 0 次请求、服务端 HTML 为 fallback；登录后恰好 1 次合并请求（4 个 id），值按对象分发。

### 9.5 水合一致性

- 客户端组件的首次渲染必须与服务端 HTML 相同（匿名态），拿到会话与状态后再更新。
- 相对时间（「3 小时前」）服务端输出绝对时间的 `<time datetime>`，客户端水合后再换成相对时间。
- 公开页不使用工作区（页签、持久化）。

## 10. 外壳与插槽

### 10.1 门户外壳

```
src/app/(public)/layout.tsx          底座：PublicFrame（服务端语言、预载词条、会话水合）+ <PortalShell>
src/app/(public)/not-found.tsx       底座：外壳内的 404 状态页（站点级 404 同样套外壳）
src/site/portal-shell.tsx            fork：页头、导航、页脚（底座给最小默认）
src/site/pages/<entry>.tsx           fork：公开页面（definePublicPage），在 site.config `pages` 里声明
src/app/(public)/(site)/…            生成：fork 页面的路由文件（不入库）
src/app/(public)/(modules)/…         生成：模块公开路由与模块 feed（不入库）
```

- `PortalShell` 的入参：`{ children, brand, locale, origin, consoleBasePath }`（`shell-types.ts`）。导航由外壳自己在服务端取（`"use cache"`，打 `site:nav` 标签）；用户菜单是客户端岛（`<PublicUserMenu links>`：会员中心、外壳给的常用控制台入口——`links` 是 `{ label: site 命名空间词条, path: 控制台内路径 }`，如「我的收藏」「我的足迹」——与退出）。外壳随每个公开页缓存，不读请求（构建期扫描覆盖它）；当前导航项在水合后由客户端标记 `aria-current`。
- fork 的公开页面用同一套运行时能力（`definePublicPage`，与 `definePublicRoute` 相同的 load / seo / Page 结构；命名空间 `site`），在站点配置 `pages` 里声明（key `site.<名称>`），遵守同样的禁止项与冲突检查。

### 10.2 插槽

插槽 id 由**声明方**定义；对象类插槽一律以 `ObjectRef` 为参数，这样贡献方（评论、互动）只认对象，不认识具体模块的页面。

| 插槽 | 声明方 | 参数 | 典型贡献 |
| --- | --- | --- | --- |
| `public.head` | 底座 | `{ route }` | 统计脚本、额外 meta |
| `public.header.actions` | 底座（外壳渲染） | — | 用户菜单（底座）、「回复我的」红点（comment） |
| `public.sidebar` | 底座（外壳决定放不放） | `{ route }` | 热榜、热评 |
| `public.object.toolbar` | 对象详情页（如 client-content） | `{ ref, summary }` | 收藏（interaction）、分享（content） |
| `public.object.after` | 对象详情页 | `{ ref, summary }` | 评论区（comment）、相关内容 |
| `public.object.aside` | 对象详情页 | `{ ref, summary }` | 同栏目最新、作者其他文章 |
| `public.object.bar` | 对象详情页（C3） | `{ ref, summary }` | 手机吸底条（< 768 px，滚动时收起，与 App 详情页底部工具栏同形）：写评论 + 评论数（comment）、收藏（interaction）、分享（content）。桌面端不显示；详情页负责容器与显隐，贡献方只给按钮 |
| `console.header.actions` | 底座（控制台） | — | 「回复我的」红点 |
| `console.home` | 底座（控制台首页，C4） | — | 模块的概览卡片：未读回复（comment）、收藏与足迹（interaction）、投稿状态（content）。首页按 `slots.order["console.home"]` 排成两列网格，每张卡片按需加载、各自取数、各自出错；没有贡献时首页列出已装配的模块 |

- `summary` 是对象详情里取到的对外信息（`capabilities`、计数、`link.web`），贡献方据 `capability` 过滤，**不能**拿它代替后端的授权检查。
- 渲染方式：`server` 是服务端组件，自己负责缓存（`"use cache"` + 标签）；`client` 是客户端岛（`"use client"`，首屏按匿名态渲染）。「服务端出首屏（可收录）+ 客户端接管交互」就是一个 server 组件里渲染一个以服务端数据为初始值的 client 组件，不单列 `hybrid`。
- **不针对对象的插槽**（`public.header.actions`、`console.header.actions`、`console.home`）入参只有 `SiteSlotProps = { locale }`。门户里由外壳调用 `renderSiteSlot("public.header.actions", { locale })`（`src/site/slots.tsx`；fork 的外壳必须调用它，否则模块的页头贡献不出现），随每个公开页缓存，客户端岛首帧按匿名态。控制台里由页头（`ConsoleHeaderActions`）渲染：`console.*` 贡献**只能是客户端岛**，注册表生成脚本把它们写进 `modules.generated.ts` 的 `consoleSlotRegistry`（按需 `import()`），不进门户的 `public.generated.tsx`；外面同样挂 `PublicSessionProvider`（多一次 `/api/session`），所以同一个组件（如「回复我的」红点）可以同时贡献给门户与控制台。底座端到端测试的夹具模块两处都挂了一个读会话的岛并断言。
- 贡献方的入参（运行时导出类型）：`ClientSlotProps = { objectRef, summary, locale }`；`ServerSlotProps` 另有 `site` 与 `href(routeKey, params)`（与页面 `ctx.href` 相同，贡献方互链不写死 URL）。客户端岛拿不到 `href`：需要的链接由 server 贡献算好作为 props 传下去。
- `summary` 里的对外计数 `commentCount`、`favoriteCount`、`viewCount`（可选）由拥有对象的模块在详情里给出，缓存时效内允许滞后；贡献方只用来显示，实时数在水合后自己取。
- 一个插槽里多个贡献按站点配置 `slots.order[target]` 列出的顺序在前，其余按 `order`（缺省 100）再按 id；`slots.hide` 隐藏。server 贡献抛错时记日志、渲染为空；client 贡献包在错误边界里。都不让整页 500。

### 10.3 卡片渲染器

列表、首页楼层、筛选器卡片流（`/app/channel/{code}` 返回的 `Card`）里的对象按 `ref.type` 选渲染器：模块用 `cardRenderers` 注册（content 注册 `content.item`，comment 注册 `comment.comment`），没有渲染器的类型退回底座的 `ObjectSummary` 通用卡片（标题 + 摘要 + `link.web`，同源链接转站内路径）。渲染器是服务端组件，入参 `CardRendererProps = { card, style, eager, priority, headingLevel, ctx }`：`style` 来自挂载的 `cardStyle`（缺省 `auto`）；`eager` = 首屏前 `eagerImages` 张（缺省 3），图片不懒加载；`priority` = 页面的 LCP 图，只在 `priorityFirst: true` 时给第一张（缺省 false）。页面经 `ctx.renderCards(cards, { styles, eagerImages, priorityFirst })` 调用：列表页、首页最新流把第一张设为 LCP 图；详情页的首图由页面自己给 `priority`，其下的卡片流不开 `priorityFirst`。`headingLevel`（缺省 3）是卡片标题的标题级别：列表直接挂在页面 `h1` 下（频道、栏目）给 2，挂在 `h2` 区块里（首页楼层）用缺省——标题层级不跳级（屏幕阅读器按层级导航，Lighthouse heading-order）。

### 10.4 媒体图片（C2）

公开页的图片一律经运行时的 `<MediaImage>`（`@neton/application-client-runtime/public`），地址由后端 infra 按 CDN 地址策略生成（infra-media §7.3，产品决定 1）：

- 后端给的**站内相对地址**（策略 `none` 时 infra 的中转读取地址 `/app/infra/file/get/…`，相对的是后端而不是门户）一律改走底座的匿名代理 `/api/backend/app/…`（`browserMediaUrl`，`<img>`、`srcset`、分享图与兜底刷新脚本同一规则）；绝对地址（CDN、对象存储）原样使用。

```ts
type PublicMedia = { fileId: string; url: string; mimeType?: string | null; width?: number | null; height?: number | null; variants?: Record<string, string> | null };
<MediaImage media={m} alt="…" displayWidth={720} aspect="3:2" priority sizes="…" className="…" />
```

| 方面 | 约定 |
| --- | --- |
| 渲染 | 服务端组件，输出一个普通 `<img>`，**没有客户端 JS**；不经 Next 的图片优化（缩放交给 CDN 的图片处理参数） |
| 规格 | 后端按固定宽度档给出完整（已签名）地址 `variants`：`w180`、`w360`、`w720`、`w1080`、`w1440`（限宽、保持比例）与 `og`（1200×675）。`srcset` 列出全部宽度档；`src` 取不小于 2 × `displayWidth` 的最小一档；没有派生规格时只给原图 |
| CLS | 一律带 `width` / `height`：原图宽高；只有比例时按 `aspect` 给名义尺寸，并用 CSS `aspect-ratio` + `object-fit: cover` 裁到该比例 |
| 加载 | 三档。`priority`（页面的 LCP 图：详情首图、焦点图第一张、列表第一张）：`loading="eager"`、`fetchpriority="high"`，并经 React `preload()` 在 `<head>` 输出 `<link rel="preload" as="image" fetchpriority="high" imagesrcset imagesizes>`。`eager`（首屏内的其余图，如列表前几张）：只 `loading="eager"`，不提高优先级（React 对不懒加载的 `<img>` 自己会给一个普通优先级的预加载提示，不额外处理）。其余 `loading="lazy"`。非 priority 的图一律 `decoding="async"` |
| 一页一张 LCP 图 | 同一次服务端渲染里只有第一张 `priority` 图生效（`React.cache` 按请求记账），之后的降级为 `eager`，开发环境告警。页面与卡片流同时要求时以文档顺序先渲染的为准；端到端测试断言整页只有一个高优先级图与一个高优先级预加载 |
| 加载器 | 可替换：fork 覆盖 `src/site/media-loader.ts`（与 `portal-shell.tsx` 同一规则），由 `public-runtime` 在加载时 `setMediaLoader()`。地址仍由后端生成，网页端不能自己拼签名 |
| 过期兜底 | 公开外框在 `<body>` 开头输出一段不依赖 React 的内联脚本（`MEDIA_REFRESH_SCRIPT`）：捕获阶段监听 `error`，对带 `data-neton-media` 的图片调一次 `GET /api/backend/app/infra/media/url/{fileId}?variant=`，去掉 `srcset` 换上新地址；每张图只重试一次 |
| 分享图 | `shareImageUrl(media)`：有 `og` 规格用它（1200×675），否则原图 |
| 有效期 | 服务启动时读 `GET /app/infra/media/policy`（`{ strategy, validitySeconds, bucketSeconds, imageParams }`），记 `site.media.policy.applied`；会渲染媒体的档位（object / list / static）经 `cacheProfile()` 收紧到 `revalidate ≤ 有效期 / 2`。策略 `none`（没有 CDN）时后端如实报告中转地址短期签名的有效期（会员可见内容的图片），约束照样生效、不告警。后端暂时连不上时按退避重试，在那之前按 120 秒收紧 |

私密媒体（会员可见、仅本人、临时文件）永不出现在公开 HTML 里：后端对匿名访问者不给出它们的地址，公开页在服务端也拿不到。

### 10.5 样式表

门户与控制台各自一份样式表：公开页（PublicFrame）只加载 `src/site/public.css`——Tailwind 只扫描门户外壳与 fork 页面（`src/site`）、生成的公开路由、站点 404 与各模块 `src` 下**除控制台页面（`src/pages`）、测试与语言包以外**的全部代码（模块自己组织的视图、正文渲染、客户端岛同样出现在公开页里），加上共享的设计令牌 `src/styles/tokens.css`；控制台与登录注册页加载 `src/styles/console.css`（整个工作区与模块控制台页面）。模块目录由注册表生成脚本按模块包的**真实路径**写进 `src/generated/public-sources.css`：pnpm 的 `file:` 依赖在 `node_modules` 里是符号链接，Tailwind 的 `@source` glob 不跟随符号链接，写成 `node_modules/@neton/*/src` 会静默漏掉模块的工具类（itwind C2 实测：文章卡片「没样式」）。门户专属样式（品牌色等）写在 fork 的 `src/site/portal.css`。字体一律系统字体栈，不加载网络字体。端到端测试以符号链接装入夹具模块（与产品一致），断言公开页只有一个样式表、不含控制台规则、模块 `views/` 里组件的工具类在、模块控制台页面的工具类不在（夹具门户 gzip 后约 4 KB）。

公开页的服务端翻译只 import `src/generated/locales.generated.ts`（模块语言包），控制台页面的加载器在 `modules.generated.ts`：两者合在一个文件时，控制台页面全部成为每个公开路由的客户端引用并进入首屏 JS（itwind C2 实测每个公开路由多出 57 KB）。端到端测试的夹具模块带一个控制台页面，断言它不出现在公开路由的客户端引用清单里。

### 10.6 首屏 JS 预算与性能门禁

`next build` 之后由 console 的 `postbuild`（`scripts/check-bundle-budget.mts`，`pnpm budget` 可单独跑）检查，超出即构建失败。计量全部按 gzip，单位 KB = 1024 字节：

- **框架底数**：`build-manifest.json` 的 `rootMainFiles`，每页都加载、与路由无关。`polyfillFiles` 是 nomodule 脚本，现代浏览器不加载，不计。
- **路由自身**：该路由 `page_client-reference-manifest.js` 里 `entryJSFiles` 的并集（根布局、路由组布局、页面、边界组件），去掉框架底数。动态 import 的懒加载块不在首屏，不计。
- 预算在 `apps/console/bundle-budget.ts`（产品 fork 可改；`NETON_BUNDLE_BUDGET_FILE` 换一份）：`shared` 卡框架底数；`public` 是 `(public)` 路由自身 JS 的缺省上限；`routes` 按路由覆盖（去掉路由组的写法，如 `/item/[id]`），也可以给控制台路由设上限，没列出的控制台、登录注册路由只报告。总量（底数 + 自身）只报告，不单独卡。预算里写了构建产物里没有的路由也算失败（防止改了路由形态后预算悄悄失效）。

**为什么不卡总量**：框架底数本身就超过「文章页首屏 JS ≤ 100 KB、首页 ≤ 130 KB」这类总量目标，任何页面都达不到，而它不是模块或门户代码能改变的。底座端到端构建（Next 16.4.0 + React 19.3.0，Turbopack，2026-10-22 实测）的数据：

| 块（build-manifest / client-reference manifest） | 内容 | gzip（kB = 1000 字节） |
| --- | --- | --- |
| 框架底数 | react-dom + scheduler | 71.9 kB |
| | Next 路由（app-router 客户端） | 48.5 kB |
| | React | 7.4 kB |
| | Turbopack 运行时 | 3.9 kB |
| | **合计** | **131.8 kB = 128.8 KiB** |
| 公开路由自身 | 根布局 | 3.6 kB |
| | 公开页 Provider（I18nProvider + 会话水合） | 4.4 kB（瘦身前 8.4 kB：曾导入运行时、控制台、门户的全部词条与模块注册表） |
| | 页面 | 0.3 kB |
| | **合计** | **8.3 kB = 8.1 KiB** |

公开页树里没有 react-query、工作区、kit 或控制台代码。底座缺省（KiB）`shared: 135`（底数之上约 5% 给补丁升级）、`public: 20`。框架底数超限时先查根布局是否多引了东西；确属框架升级，在 `bundle-budget.ts` 里调高并附上新的实测数据。

- **路由名**：去掉路由组；查询变体（`…/~q/[_q]`，§4.3）与裸路由记在同一个名下，取较大者——首页 `/(public)/(site)/~q/[_q]` 就是 `/`，产品按 `routes: { "/": 30 }` 放宽首页（itwind：首页 ≤ 30 KiB，其余公开路由 ≤ 20 KiB）。
- C3 实测（底座夹具，含 Web Vitals 信标与夹具的状态岛）：公开路由自身 11.0 KB（C2 8.1 KB）；增量是夹具对象页的状态岛（`ObjectStateBatcher` + `apiFetch`，Turbopack 把 `(public)` 下全部客户端岛并进同一个布局块，所以每个公开路由都计入）与信标本体（`web-vitals` 是 load 之后的懒加载块，不计）。

**产品确认的口径（itwind C2 → C3，产品决定）**：首屏 JS 按「框架底数 ≤ 135 KiB + 路由自身 ≤ 20 KiB（首页 ≤ 30 KiB）」，原「文章页 ≤ 100 KB / 首页 ≤ 130 KB」总量目标作废（框架底数本身就超过它，simulate 模式还按 1.6 Mbps 悲观地把这 130 KB 全算进 LCP 依赖）。实验室门禁与真实用户门禁分开：

| 门禁 | 工具 | 口径 | 门槛 |
| --- | --- | --- | --- |
| 构建期首屏 JS | `pnpm budget`（postbuild） | gzip KiB | 底数 ≤ 135、路由自身 ≤ 20（产品可按路由放宽） |
| 实验室回归 | `pnpm lighthouse <url>…`（`scripts/lighthouse.mts`） | 移动端预设、**devtools 实际节流**（慢 4G：延迟 562.5 ms、下行 1.47 Mbps、CPU 4×），每个地址 3 次取各指标中位数 | LCP ≤ 2.0 s、CLS ≤ 0.05、TBT ≤ 200 ms；同时报告性能 / SEO / 无障碍分数；`--out` 写 JSON 汇总，超出退出码 1 |
| 真实用户（最终判据） | 信标 + 收集端点 + `pnpm vitals:report`（§10.7） | p75，按全站与路由形态 × 设备档 | LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（Google「good」） |

Lighthouse 选 devtools 节流的理由：simulate（lantern）由一次不节流的观测推算，把首屏前发起的全部请求都算进 LCP 的依赖链，与浏览器按优先级调度（LCP 图 `fetchpriority=high` 先下）的真实行为不符；devtools 节流让真实浏览器在限速下加载，与真实设备 p75 更接近。simulate 只作趋势参考。Chrome 取 `CHROME_PATH`，否则 Playwright 的 Chromium。底座端到端测试对夹具对象页跑一次（3 次中位数）：LCP 1.28–1.41 s、CLS 0、TBT 63–143 ms、性能 98–100；机器满载时（load average > 80）LCP 实测可到 2.7 s——CPU 4× 降速叠加宿主争用，门禁要在空闲的 CI 机器上跑。

### 10.7 真实用户 Core Web Vitals（C3）

站点配置 `vitals: { endpoint, sampleRate }`（`resolveSite()` 校验：`endpoint` 是站内路径或 https 地址，`sampleRate` 在 0–1）。

| 部分 | 约定 |
| --- | --- |
| 信标 | 公开外框里的客户端组件（`@neton/application-client-runtime/public-vitals`，配置了才渲染）：按页面浏览抽样；页面 `load` 之后、浏览器空闲时才动态加载 `web-vitals`（懒加载块，不计首屏 JS）；收集 LCP、INP、CLS、FCP、TTFB，页面隐藏（`visibilitychange` → hidden、`pagehide`）时把这次浏览的指标一次发出——`navigator.sendBeacon`（`text/plain`，跨源收集服务不触发预检），不支持时 `fetch(keepalive, credentials: omit)` |
| 上报内容 | `{ v: 1, route, pattern, path, nav, device, conn, metrics: [{ name, value, rating, id }] }`：路由 key 与形态取自页面 `<meta name="neton-route">` / `neton-route-pattern`（公开路由渲染管线输出，站点 404 等为 null），`path` 不含查询串与锚点，`device` 按视口宽度分档（< 768 mobile、< 1200 tablet、其余 desktop），`conn` 是 `effectiveType`。**没有 Cookie、没有任何身份**；缓存的 HTML 不变（信标只在客户端运行） |
| 收集端点 | 底座自带 `POST /api/site/vitals`（`createVitalsHandler`）：形状、枚举、数值范围全量校验（≤ 4 KB，任何一处不合法整份 400 `VITALS_INVALID`）；按来源地址每分钟 60 份（`X-Forwarded-For` 最右一跳，进程内计数，超出 429 `VITALS_RATE_LIMITED`）；每个指标写一行 `{"type":"web-vital",ts,id,name,value,rating,route,pattern,path,nav,device,conn}` 到 `NETON_SITE_VITALS_LOG`（缺省标准输出）；204、`no-store`；不访问后端。`/api/` 本来就在 robots 的 Disallow 里。产品也可以把 `endpoint` 指向自己的后端或日志服务，格式相同 |
| 报告与门禁 | `pnpm vitals:report <日志>… [--since] [--min-samples 50] [--json] [--allow-insufficient]`：从日志里挑出样本行（允许前面有日志前缀），同一 `id` + 指标只取最后一次（页面再次隐藏时会重报 CLS / INP）；p75 用最近秩法（CrUX 口径，不插值）；分组 = 全站 × 设备档、路由形态 × 设备档；样本数 ≥ `min-samples` 的组才判定；退出码 0 达标、1 超出门槛、2 全站手机或桌面样本不足 |

底座端到端测试：夹具站点 `sampleRate: 1`，浏览器打开对象页、离开后，日志里有该页的 LCP / FCP / TTFB 行（路由、形态、路径、设备档正确，不含会话令牌），`vitals:report` 算出的 p75 与按最近秩手算一致。

## 11. robots、sitemap、RSS

### 11.1 robots.txt

底座生成：`Allow: /`；`Disallow:` 控制台前缀（`/my/` 与 `/my$`，不误伤 `/mything`）、`/api/`、登录注册页、站点配置的 `robots.disallow`；末尾 `Sitemap: {origin}/sitemap.xml`。只有控制台的产品（前缀为 `/`）输出 `Disallow: /`。不按搜索引擎分别写规则（需要时站点配置扩展）。

### 11.2 sitemap

- `/sitemap.xml` 是**索引**，列出所有贡献的全部分片：`/sitemaps/{贡献 id}.{分片 id}.xml`（两段都是 `[a-z0-9][a-z0-9-]{0,63}`，用 `.` 分隔避免 `content` + `terms-all` 与 `content-terms` + `all` 的歧义），以及有 news 贡献时的 `/sitemaps/news.xml`。贡献 id 不能是 `news` / `gone`。
- 贡献入口导出：

```ts
export default defineSitemap({
  async shards(ctx): Promise<{ id: string; lastmod?: string }[]>,         // 分片要稳定：已有分片的 id 不随新内容变化
  async urls(shardId, ctx): Promise<{ urls: { loc: string; lastmod?: string; images?: { loc: string }[] }[]; tags?: string[] } | null>,  // ≤ 50 000 条；null = 分片不存在
  async news?(ctx): Promise<{ urls: { loc: string; title: string; publishedAt: string; language: string }[]; tags?: string[] }>,  // 近 48 小时，≤ 1000 条
});
```

- 底座负责：拼 `origin`、XML 转义、单文件 50 000 条 / 50 MB 上限检查（超出构建期不可知，运行时截断并记错误日志）、`lastmod` 用 W3C 时间格式；不输出 `changefreq` / `priority`。
- 缓存：索引与分片走 `list` 档，打 `feed:{type}`；历史分片（如按月分片的往月）由贡献方标 `immutable`，走 `static` 档。
- news sitemap 的 `<news:publication>` 名称与语言取站点品牌与语言配置。

### 11.3 RSS

- 站点 feed `/rss.xml`（底座，聚合所有声明了 `site: true` 的 feed 贡献，按时间合并，前 50 条；没有站点 feed 贡献时 404；有贡献时站点配置必须给 `feeds.site.title`）；模块 feed 按 `pattern`（如 `/category/:slug/rss.xml`），生成为各自的 Route Handler。
- RSS 2.0，带 `atom:link rel="self"`；条目 `title`、`link`（规范地址）、`guid`（同 link，`isPermaLink="true"`）、`pubDate`、`description`（摘要，不输出全文，开放项 §16）、`category`。
- 缓存走 `list` 档。

### 11.4 IndexNow 密钥文件

环境变量 `NETON_SITE_INDEXNOW_KEY` 有值时，底座输出 `/indexnow-key.txt`（内容即密钥，`text/plain`，`static` 档）；服务端推送时 `keyLocation` 填 `{origin}/indexnow-key.txt`。没有设置时该路径 404。`/indexnow-key.txt` 一并列入保留路径。

### 11.5 死链文件（可选）

站点配置 `robots.deadLinkFile = true` 时输出 `/sitemaps/gone.txt`：已删除 URL 集合（§7.2）的纯文本列表，每行一个绝对地址，供提交到百度资源平台的死链工具。`list` 档缓存。

## 12. 国际化

- 第一版：公开页**每个部署一种语言**（`locales.prefix = "none"`），即站点配置的 `locales.default`；`<html lang>` 由服务端设置。
- 服务端翻译：运行时 `createServerI18n()` → `getServerT(namespace, locale)`（读同一份模块语言包与宿主静态词条：运行时、`console`、`site`），公开页、插槽的服务端部分、sitemap / RSS 里的文案都用它。`pnpm check:locales` 检查：各命名空间 key 集合与参数一致；已国际化模块的整个源码（`locales/` 与测试除外，含被公开页 import 的视图、正文渲染、客户端岛）与宿主源码不得硬编码中文（行尾 `// i18n-exempt` 只给语言自称一类不该翻译的文字）；模块公开页客户端岛里字面量 `t("…")` 的 key 必须是公开 key，且在语言包里存在。测试文件（`*.test.*`、`__tests__/`、`__fixtures__/`、`__mocks__/`）不检查。
- 客户端岛：公开布局用服务端语言初始化 `I18nProvider`，不读 localStorage；只有一种语言时不显示语言切换。
- 公开页只预载**公开 key**：模块命名空间里以 `public.` 或 `error.` 开头的 key（`catalogsFor(namespaces, locale, { publicKeysOnly: true })`），加上宿主的 `errors`（运行时错误码）与 `site`（门户）整份，都只取站点语言（及默认语言回退）。`PublicProviders` 不导入任何语言包或模块注册表，也不按需加载命名空间：控制台的词条与模块清单不进门户的客户端包。服务端翻译（`ctx.t`、`getServerT`）不受此限制，它不进 HTML。
- 因此模块的公开页客户端岛（模块源码里 `"use client"` 且调用 `useT("<模块 id>")` 的文件，控制台页面 `pages/` 除外）只能用公开 key。客户端岛的其余文案由 server 组件翻译好作为 props 传入。
- 预留：`prefix: "non-default"` 时非默认语言加前缀（`/en/...`），每条路由按语言生成、输出 `hreflang` 备选。契约里的 `ctx.locale`、`alternates.languages` 现在就有，到时不改接口。
- 错误：公开页上的客户端岛同样用 `useDescribeError("<模块 id>")`；服务端 `load` 的错误不显示给用户（映射成状态码或抛出）。

## 13. 版本

- client-contract 1.1.0 只增字段；1.0.0 的模块不受影响。
- 注册表生成脚本的兼容规则从「major 相同」改为「major 相同且模块 minor ≤ 底座 minor」：用到 `publicRoutes` 等字段的模块声明 `contractVersion: "1.1.0"`，装在 1.0 底座上直接构建失败，而不是静默忽略字段。
- 路由 key、插槽 id、标签命名（§8.3）、失效端点的请求格式是契约，变更按 semver。
- **改 URL 形态是 SEO 层面的破坏性变更**：模块改缺省 `pattern`、或 fork 改 `override` 时，旧形态必须写进 `legacyPatterns`（模块）或站点配置的 `routes.legacy`（fork），proxy 生成 308（保留查询串）；构建期比对上次构建的路由清单（`src/generated/public-routes.json`，生成物里唯一入库的文件），发现形态变化而没有 legacy 声明即失败；路由整个消失（卸了模块）必须在 `routes.disable` 里列出以确认其 URL 从此 404。

## 14. 构建期检查（注册表生成脚本）

1. 路由 key 全局唯一、以模块 id 为前缀；实例 key 为 `<路由 key>@<名称>`；fork 页面 key 为 `site.<名称>`。
2. 覆盖后的 `pattern` 两两不冲突（同形态、或静态段与参数段在同一位置互相遮挡）、不占保留前缀、不与 fork 手写的 `(public)` 页面冲突。
3. `override` 只改形态：参数名集合不变。
4. 有公开路由时 `consoleBasePath ≠ "/"`。
5. `entry` 都能解析；`slots`、`cardRenderers`、`sitemaps`、`feeds` 的入口同理；插槽 `target` 必须是已声明的插槽。
6. §5 的禁止访问扫描。
9. 每个 `:name` 都有规则、规则里没有多余参数；`dynamic` 路由不得 indexable、不得 goneAware；插槽 id 以模块 id 为前缀、target 已声明；同一对象类型只有一个卡片渲染器。
7. §13 的 URL 形态回归检查。
8. contract 版本兼容（§13）。

## 15. 实施分期（底座部分）

| 期 | 内容 | 状态 |
| --- | --- | --- |
| P1 | 契约类型 1.1.0；`consoleBasePath` 与控制台路由生成；`front-workspace` 前缀支持（上游 ecadcb6）；`(public)` 布局、外壳文件、`definePublicRoute` / `definePublicPage`；`ctx.backend`；§6 元数据渲染与 JSON-LD 构造器；状态映射；会话水合、`requireLogin`、`next` 跳回；代理匿名转发；服务端翻译；构建期检查 1–9；短信登录 | **C1 已实现** |
| P2 | 缓存档位与 CDN 头；标签；失效端点；插槽与卡片渲染器；`ObjectStateBatcher` | C1 已实现；`ObjectStateBatcher` C3 已实现（§9.4） |
| P3 | robots / sitemap / RSS 管线；410（proxy + 已删除集合 + 同步客户端）；死链文件；IndexNow 密钥文件；URL 形态回归检查与 legacy 308 | C1 已实现管线；内容的 sitemap / RSS 贡献随 client-content（C2），已删除台账的服务端随 site 模块 S1（C2） |
| P4（C2） | 密封构建（§1b）；门户 / 控制台样式表分离（§10.5）；媒体图片、过期兜底与签名有效期的运行期交叉校验（§10.4）；底座端到端测试 | **C2 已实现** |
| P5（C3） | `ObjectStateBatcher`（§9.4）；`public.object.bar` 插槽（§10.2）；控制台在根路径的 `anonymousPaths`（§2.1b）；首屏 JS 路由名合并查询变体；Lighthouse 门禁（devtools 节流）与真实用户 Web Vitals（信标、收集端点、p75 报告，§10.6–10.7） | **C3 已实现** |
| — | 多实例的共享缓存处理器（`cacheHandlers`）与共享的已删除集合 | 扩容时做；第一版单实例 |

C1 验收（itwind-client 真实运行，Playwright 12/12）：首页 HTML 含完整主内容与元数据、首屏不靠客户端取数（只有一次 `/api/session`）；带与不带 Cookie 的 HTML 逐字节一致；未知频道与不合法参数 404、内部 `~q` 段 404、已删除地址 410（noindex）、恢复后 404；失效端点错签 / 无签 401、错标签 400、正确签名 200 且按 eventId 幂等；robots 与 sitemap 索引、分片可用；`/my/account/profile` 未登录 → `/login?next=…` → 短信验证码登录后回到原页；门户页上账密登录回到原页；`next=//evil.example` 被拒、落在控制台首页。底座自身：生成脚本与运行时单测 87 项。

底座端到端测试（C2，`pnpm e2e`，26 项全绿）：夹具模块（`e2e/fixture-module`：无参数列表页 `/`、goneAware 对象页 + legacy 308 + 数据驱动 308、带查询白名单的列表页、dynamic 页、卡片渲染器、带 news 的 sitemap、站点与模块 feed）+ 进程内模拟后端（`e2e/mock-backend.mts`：签名校验的已删除台账、媒体策略与刷新、账密登录）+ 真实 `next build && next start`。覆盖：构建期 0 次后端请求；路由生成；SSR 正文、元数据、站点验证、JSON-LD；404 / 暂时下线 404 + noindex / 参数不合法不打后端；启动同步的台账首访即 410、页面层 gone 先 404 后 410、死链文件；数据驱动与 legacy 308；`~q` 顺序无关、剥 utm、canonical 带白名单、外部访问 `~q` 404；dynamic 恒 200 + noindex；失效端点的签名 / 时间戳 / 字段 / 限额 / 保留路径 / 重复 eventId，refresh 与 expire 对下一次响应的实际效果，gone / revived；缓存命中不打后端；robots、sitemap 索引 / 分片 / news、RSS、IndexNow；站点 404 与控制台守卫；公开页只有门户样式表；浏览器里的登录 `next` 跳回与开放重定向防护（`//evil`、`/\evil`、编码变体、外站、`/api/`）；带路径参数的模块 feed（生成的路由文件过 `next build` 类型检查、参数校验 404）；列表页整页只有一张高优先级图（焦点图与 `priorityFirst` 同时要求时第二张降级）、其后 `eager`、再后懒加载；首屏 JS 预算（§10.6）；过期图片的兜底刷新；带与不带 Cookie 的 HTML 逐字节一致；运行日志无错误。Next 16.4 已知行为：页面里的 `permanentRedirect` 输出两行相同的 `Location`（浏览器只在取值不同时报错），测试按每一行都等于目标校验。

## 16. 开放项（已关闭）

| 项 | 决议与理由 |
| --- | --- |
| 登录用整页跳转还是弹层 | 整页跳转（产品决定 6）；短信登录进底座 |
| RSS 是否输出全文 | 只输出摘要：防整站被聚合器转载，摘要已足够让订阅者判断 |
| 410 是否值得 proxy 的成本 | 值得：只对 `goneAware` 路由匹配、集合查找是内存操作，CDN 命中时根本不经过 proxy；410 让搜索引擎更快、更彻底地丢弃删除的地址（产品决定 4） |
| 共享缓存处理器选型 | 第一版单实例不需要；扩容时用 Redis，与已删除集合放在同一处 |
| 是否需要按语言前缀的多语言门户 | 不做；契约预留（§12），单语言部署 |
| `/api/site/revalidate` 的网络隔离由谁保证 | 部署（反代不把 `/api/site/*` 暴露到公网）+ 签名，两道都要 |
| 搜索被限流时的状态码 | `dynamic` 档只能 200（流式输出后状态码不可改，C1 实测）：页面内提示 + noindex，不返回 429 |
| 匿名读接口的限流 | 不按 IP 限流，搜索与写接口按真实客户端 IP（产品决定 8，§5） |
| 外壳与首页谁输出站点级 JSON-LD | 首页（fork 页面）用构造器输出：底座不认识首页 |
