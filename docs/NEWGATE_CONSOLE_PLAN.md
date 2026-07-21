# newgate-client

NewGate **C 端用户控制台**（含公开页），对标云厂商控制台（阿里云/腾讯云/AWS）与 new-api 用户端的使用体验。

> 设计依据：`../docs/superpowers/specs/2026-07-21-newgate-design.md` §9（双前端决策）
> 里程碑：M4（后端 gateway MVP 与管理台先行）

## 技术栈（与 newgate-front 同构）

- React 19 + Next.js（App Router）
- shadcn/ui + Tailwind
- pnpm + turbo monorepo，模块契约模式沿用 neton-application-front 的架构

## 与 newgate-front（管理台）的三个关键差异

| 维度 | newgate-front（B 端管理台） | newgate-client（C 端控制台） |
|------|---------------------------|----------------------------|
| 账号体系 | module-system 管理员，`/admin` 组 JWT | module-member 会员，`/app` 组 JWT（HttpOnly Cookie） |
| 导航 | 后端菜单驱动（RBAC） | 产品化固定侧边栏（概览/令牌/用量/充值/设置） |
| 路由 | 全部受保护 | 公开路由（首页、模型广场/价目表、关于）+ 登录后控制台 |

## 规划的目录骨架（M4 落地）

```
newgate-client/
├── apps/console          # Next.js 壳：公开页 + 控制台
├── packages/client-kit   # shadcn/ui 组件属地
├── packages/client-runtime  # envelope HTTP client、member 会话
└── packages/client-module-gateway  # 令牌/用量/充值/兑换页面
```

## 页面清单（v1）

- 公开：首页（配置驱动）、模型广场与价目表（读 `gateway_model_prices`）、关于
- 控制台：概览（余额/本月消费/用量曲线）、我的令牌（创建一次性展示/限额/白名单）、
  用量明细、充值（module-payment 收银台 + 兑换码）、个人资料、签到
