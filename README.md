# NetonAPI 用户控制台

NetonAPI 自助侧前端（仓名 `nanogate-client`）：用户在这里领 API Key、看用量与账单、
用兑换码入账，并查看模型定价。React 19 + Next.js App Router（SSR），pnpm workspace，BFF 代理模式。
与管理台 [`nanogate-admin`](https://github.com/zoujiaqing/nanogate-admin) 同构、同维护模式，
面向的是会员而不是运营人员。

> ⚠️ **在线付款还没接。** 后端那半边是齐的（下单与订单回读都在，harness S32/S33/S53 钉着），
> 但用户侧没有收银台 —— 额度目前只能靠运营手工发放或兑换码进账。详见「已知缺口」。

后端是 [`nanogate-backend`](https://github.com/zoujiaqing/nanogate-backend)（默认
`http://localhost:8800`）；部署与密钥说明见 `nanogate` 仓的
[`DEPLOY.md`](https://github.com/zoujiaqing/nanogate/blob/main/DEPLOY.md)。

| | |
|---|---|
| 前端 | React 19.2 · Next.js 16（App Router，SSR）· Tailwind 4 · TanStack Query 5 |
| 包管理 | pnpm workspace（`apps/*` + `packages/*`），lockfile 已提交 |
| 语言 | TypeScript 5.7（`tsc --noEmit` 为门禁） |
| 开发端口 | `3000`（Next.js 默认，`next dev` 未带 `-p`） |
| 许可 | [Apache-2.0](./LICENSE) |

## 与管理台的差异

| 维度 | `nanogate-admin`（B 端） | `nanogate-client`（C 端） |
|---|---|---|
| 账号体系 | `module-system` 管理员，`/admin` 组 | `module-member` 会员，`/app` 组 |
| 登录端点 | `/admin/system/auth/login` | `/app/auth/login-username` |
| 导航 | 后端菜单驱动（RBAC） | 静态导航 `apps/console/src/config/console.nav.ts` |
| 会话时长 | 取自 `expiresTime`（毫秒时间戳） | 取自 `expiresIn`（秒） |

两侧的 Cookie 都是 HttpOnly + `SameSite=Lax`，`secure` 仅在 `NODE_ENV=production` 打开，
`maxAge` 下限 60s、兜底 8h。

## 结构

- `apps/console`（`@neton/application-client-console`）—— Next.js 壳：会员登录、
  模块 manifest 驱动的 catch-all 路由 `(protected)/[...slug]`
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
@neton/application-client-gateway   # 产品：NetonAPI 的 API 网关自助面
```

四个模块都以 `file:../../../../Neton/neton-application-client-*` 引入，所以本仓必须正好落在
持有 `Neton/` 的那层目录的**两层深处**：

```
projects/
├── Neton/
│   └── neton-application-client-{member,payment,gateway}/
└── <workspace>/
    ├── newgate/          # 后端
    └── newgate-client/   # ← 本仓
```

> ⚠️ **现在从干净 clone 出发装不起来。** `neton-application-client-gateway` 目前是私有仓
> （`-member`、`-payment` 是公开的），而它正是 NetonAPI 自助面的页面所在。没有它的读权限，
> `pnpm install` 会在解析 `file:` 依赖时失败。在它转公开之前，公开本仓只意味着「源码可读」，
> 不意味着「人人可自建」。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm registry      # 由 client.modules.ts 生成页面注册表（predev / prebuild 会自动跑）
pnpm dev           # http://localhost:3000，后端地址用 NETON_BACKEND_URL 覆盖
pnpm typecheck     # 先 registry 再 tsc --noEmit
pnpm build
```

两个坑，都踩过：

- **`allowBuilds`**：`pnpm-workspace.yaml` 必须放行 `esbuild`（`pnpm registry` 走 tsx）与
  `sharp`（Next 图片优化）的 postinstall。留着脚手架占位文本，pnpm 11 会报
  `ERR_PNPM_IGNORED_BUILDS` 并以 exit 1 结束 install——CI 第一步就红。
- **`file:` 依赖是拷贝进 store 的**：`node_modules/.pnpm/…@file+…` 里是一份副本，
  拉完 canonical 模块仓的新提交后必须重装（`pnpm install`）才看得到变化。

## 认证与代理

浏览器**拿不到** JWT：`POST /api/auth/login` 把会员令牌写成 HttpOnly Cookie，
所有业务请求走 `/api/backend/<path>`，由 Next 服务端取出 Cookie、加 `Authorization: Bearer …`
后转发到 `NETON_BACKEND_URL`（`cache: no-store`）。没有 Cookie 时代理直接回 401。

## 已知缺口

- 在线收银台已有（选渠道 → 下单 → 跳转 / 二维码 / SDK 参数 → 轮询到账），但只在沙箱渠道下端到端验证过；
  真实支付宝 / 微信商户号要上线前再走一遍。二维码是页内 SVG 编码（已与 python-qrcode 逐位比对到版本 10）。
- `(protected)/layout.tsx` 给 `AppShell` 传的 `roles` 与 `permissions` 仍是空数组——这是**有意的**：
  用户侧不做前端权限门控，能看什么由后端接口按 identity 隔离，侧栏藏页面不构成安全边界。别去「补」它。
- 公开页只有 `(auth)` 组里的登录 / 注册 / 找回密码；定价页这类不登录也想看的页面要自己加路由组。
- 没有公告、两步验证。

## 许可

Apache-2.0 —— 见 [LICENSE](./LICENSE)。
