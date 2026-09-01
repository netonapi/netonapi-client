# neton-application-client

通用 **C 端用户控制台** base distribution（React 19 + Next.js App Router，SSR），对标云厂商控制台
（阿里云/腾讯云/AWS）的产品形态；与 `neton-application-front`（B 端管理台底座）同构、同维护模式。

与 front 底座的三个关键差异：

| 维度 | neton-application-front（B 端） | neton-application-client（C 端） |
|------|------|------|
| 账号体系 | module-system 管理员，`/admin` 组 | module-member 会员，`/app` 组（HttpOnly Cookie） |
| 导航 | 后端菜单驱动（RBAC） | 静态导航 `apps/console/src/config/console.nav.ts` |
| 路由 | 全部受保护 | 受保护控制台 + `(public)` 公开路由组（产品 fork 自行添加） |

- `apps/console` — Next.js 壳：member 登录、模块 manifest 驱动的 catch-all 路由
- `packages/client-contract` — 模块契约（manifest / 贡献点 / 版本协议）
- `packages/client-runtime` — envelope HTTP client、member 会话、静态导航工具
- `packages/client-kit` — UI 组件唯一属地（shadcn/Base UI 只进这里）

模块装配：产品 fork 在 `apps/console/client.modules.ts` 登记 `@neton/application-client-xxx` 模块
（file: 引 canonical sibling 仓，形态同 front 底座）。

```bash
pnpm install
pnpm registry   # 由 apps/console/client.modules.ts 生成页面注册表（prebuild 自动跑）
pnpm dev        # NETON_BACKEND_URL 默认 http://localhost:7080
```
