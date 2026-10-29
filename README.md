# NetonAPI 网站前端

NetonAPI 网站前端（仓库 [`netonapi/netonapi-web`](https://github.com/netonapi/netonapi-web)，本地目录 `netonapi-client`）：用户在这里建 API Key、看用量与账单、
在线充值或用兑换码入账，并查看模型与价格；门户首页与公开价格页也由本仓提供。React 19 + Next.js App Router（SSR），pnpm workspace，BFF 代理模式。
与管理后台 [`netonapi/netonapi-admincp`](https://github.com/netonapi/netonapi-admincp) 同构、同维护模式，
面向的是会员而不是运营人员。

服务端是 [`netonapi/netonapi`](https://github.com/netonapi/netonapi)（默认
`http://localhost:8800`）；部署与密钥说明见 `nanogate` 仓的
[`DEPLOY.md`](https://github.com/zoujiaqing/nanogate/blob/main/DEPLOY.md)。

| | |
|---|---|
| 前端 | React 19.2 · Next.js 16（App Router，SSR）· Tailwind 4 · TanStack Query 5 |
| 包管理 | pnpm workspace（`apps/*` + `packages/*`），lockfile 已提交 |
| 语言 | TypeScript 7（`tsc --noEmit` 为门禁） |
| 开发端口 | `3000`（Next.js 默认，`next dev` 未带 `-p`） |
| 许可 | [Apache-2.0](./LICENSE) |

## 与管理台的差异

| 维度 | `netonapi-frontend`（B 端） | `netonapi-client`（C 端） |
|---|---|---|
| 账号体系 | `module-system` 管理员，`/admin` 组 | `module-account` 账号，`/app` 组 |
| 登录端点 | `/admin/system/auth/login` | `/app/auth/login-username` |
| 导航 | 后端菜单驱动（RBAC） | 静态导航 `apps/console/src/config/console.nav.ts` |
| 会话时长 | 取自 `expiresTime`（毫秒时间戳） | 取自 `expiresIn`（秒） |

两侧的 Cookie 都是 HttpOnly + `SameSite=Lax`，`secure` 仅在 `NODE_ENV=production` 打开，
`maxAge` 下限 60s、兜底 8h。

底座的公开路由（匿名可缓存的 SSR 门户页面）契约见 [docs/spec/public-routes.md](docs/spec/public-routes.md)。
本仓装了公开路由：`apps/console/site.config.ts` 设 `consoleBasePath = "/console"`，根路径 `/` 是门户首页、
`/pricing` 是公开价格页（`src/site/pages/`，可被收录）；控制台、登录注册与 `/api/` 在 robots.txt 里不收录。

## 结构

- `apps/console`（`@neton/application-client-console`）—— Next.js 壳：会员登录、门户首页与价格页、
  模块 manifest 驱动的控制台路由
- `packages/client-contract` —— 模块契约（manifest / 贡献点 / 版本协议）
- `packages/client-runtime` —— envelope HTTP client、会员会话、静态导航工具
- `packages/client-kit` —— UI 组件的唯一属地（shadcn / Base UI 只进这里）
- `packages/client-resource` —— 通用 CRUD 资源渲染器：声明字段（`ResourceField[]`）就得到
  列表 / 筛选 / 抽屉表单页，数据走 envelope API

业务页面不在本仓：它们由 canonical 的前端模块仓提供，`apps/console` 只做装配。

## 模块装配

`apps/console/client.modules.ts` 是装配清单的唯一来源，`scripts/generate-registry.mts`
据此生成页面注册表：

```
@neton/application-client-account   # 通用：账号（资料、密码、邮箱、手机）
@neton/application-client-member    # 通用：会员成长（邀请好友）
@neton/application-client-payment   # 通用：充值与账单
@neton/application-client-gateway   # 产品：NetonAPI 的 API 网关自助面（就在本仓 packages/client-gateway）
```

`client-gateway` 以 `workspace:*` 引入；其余三个通用模块都以 `file:../../../../Neton/neton-application-client-*` 引入，所以本仓必须正好落在
持有 `Neton/` 的那层目录的**两层深处**：

```
projects/
├── Neton/
│   └── neton-application-client-{account,member,payment}/
└── <workspace>/
    ├── netonapi-backend/   # 后端
    └── netonapi-client/    # ← 本仓
```

### 安装前提

依赖的通用模块仓（`-account`、`-member`、`-payment` 与底座 `neton-application-front`）都是公开的，
只凭公开源码即可安装构建。

## 开发

```bash
pnpm install
pnpm registry       # 由 client.modules.ts + site.config.ts 生成注册表与路由文件（prebuild 自动跑）
pnpm typecheck      # registry + check:locales + 各包 tsc
pnpm test           # 生成脚本与运行时单测
pnpm e2e            # 端到端：夹具模块 + 模拟后端 + 真实 next build / next start（见 e2e/run.mts）
pnpm dev            # NETON_BACKEND_URL 默认 http://localhost:8080
pnpm budget         # 首屏 JS 预算（postbuild 自动跑）
pnpm lighthouse <url>…        # Lighthouse 门禁：移动端、devtools 节流、预热后 3 次有效测量的中位数（public-routes §10.6）
pnpm vitals:report <日志>…    # 真实用户 Web Vitals 的 p75 报告与门禁，--days 7 / --since / --until 时间窗（§10.7）
pnpm structured-data <url>…   # 本地结构化数据校验：schema.org 词表 + Google 富媒体规则（§6）
pnpm cdn:rules [--text]       # 由站点配置与公开路由生成 CDN 缓存规则（§8.2a）
```

部署配置（环境变量）：`NETON_BACKEND_URL`（浏览器代理与会话校验用的后端地址）、`NETON_BACKEND_INTERNAL_URL`
（公开页服务端取数，内网直连，缺省回落前者）、`NETON_SITE_ORIGIN`（构建期覆盖站点 origin）、
`NETON_SITE_REVALIDATE_SECRET`（失效端点与已删除台账的共享密钥，≥ 32 字节）、`NETON_SITE_INDEXNOW_KEY`、
`NETON_SITE_VITALS_LOG`（Web Vitals 收集端点的样本日志文件，缺省标准输出）、`NETON_SITE_SELF_URL`（热点预热请求本进程用的地址，
缺省 `http://localhost:$PORT`，§8.7）。
`next build` 不连后端（public-routes §1a）：所有公开页面按需渲染，构建机不需要能访问后端。
`next start` 不要以 IP 字面量绑定（`-H 127.0.0.1` / `HOSTNAME=127.0.0.1`）：Next 16 下 proxy 的改写会落空成 404，
绑 `0.0.0.0` 或 `localhost`，内网隔离交给防火墙 / 反代（public-routes §2.3）。

端到端测试（`pnpm e2e`）是密封的：夹具经 `NETON_CLIENT_MODULES_FILE` / `NETON_SITE_CONFIG_FILE` /
`NETON_PUBLIC_ROUTES_FILE` 选用、构建到 `.next-e2e`，夹具模块只在运行期间复制进 shell，结束后按产品自己的配置
重新生成注册表；端口随机，模拟后端在测试进程内。`E2E_SERVE=1 pnpm e2e` 只构建并启动（排查用）。
产品 fork 合并底座后可以照样跑它，验证底座在自己的依赖版本下仍然成立。

两个坑，都踩过：

- **`allowBuilds`**：`pnpm-workspace.yaml` 必须放行 `esbuild`（`pnpm registry` 走 tsx）与
  `sharp`（Next 图片优化）的 postinstall。留着脚手架占位文本，pnpm 11 会报
  `ERR_PNPM_IGNORED_BUILDS` 并以 exit 1 结束 install——CI 第一步就红。
- **`file:` 依赖是拷贝进 store 的**：`node_modules/.pnpm/…@file+…` 里是一份副本，
  拉完 canonical 模块仓的新提交后必须重装（`pnpm install`）才看得到变化。

## 认证与代理

浏览器**拿不到** JWT：`POST /api/auth/login` 把会员令牌写成 HttpOnly Cookie，
所有业务请求走 `/api/backend/<path>`，由 Next 服务端取出 Cookie、加 `Authorization: Bearer …`
后转发到 `NETON_BACKEND_URL`（`cache: no-store`）。没有 Cookie 时代理不带 Authorization 转发，
是否允许匿名由后端接口决定（`@AllowAnonymous`）；写请求一律过 CSRF 检查。

## 已知缺口

- 在线充值：先填金额，点充值后在弹窗里选支付方式 → 下单 → 跳转 / 二维码 / SDK 参数 → 轮询到账。
  端到端只在沙箱通道下验证过，真实支付宝 / 微信商户号接入后要再走一遍；没有可用通道时页面提示联系管理员充值。
  二维码是页内 SVG 编码（已与 python-qrcode 逐位比对到版本 10）。
- `components/workspace-root.tsx` 给工作区外壳传的 `roles` 与 `permissions` 仍是空数组——这是**有意的**：
  用户侧不做前端权限门控，能看什么由后端接口按 identity 隔离，侧栏藏页面不构成安全边界。别去「补」它。
- 公开页：`(public)/(site)` 下的门户首页与价格页（`/pricing`），以及 `(auth)` 下的登录 / 注册 / 找回密码。
- 没有公告、两步验证。

## 许可

Apache-2.0 —— 见 [LICENSE](./LICENSE)。
