import type { NavItem } from "@neton/application-client-runtime/menu";

/**
 * C 端控制台静态导航（产品 fork 覆盖此文件；与后端菜单/RBAC 无关）。
 *
 * 与管理台不同，用户侧不做权限门控 —— layout 给 AppShell 传的是 `roles={[]} permissions={[]}`，
 * 所以这里的每一项对每个登录用户都可见，不需要也不应该再去查 system_menus。用户能看什么由
 * 后端接口自己按 identity 隔离（用量、流水、Key 都只返回本人的行），侧栏藏页面不构成安全边界。
 *
 * 每一项都对应 console 装配的一个页面（见 src/generated/modules.generated.ts 的 pages 表）。
 * 漏一项，那一页就只剩手敲 URL 一条路 —— 路由仍在、页面仍能渲染，界面上却没有任何入口，
 * 而且不报错。harness S52 断言「每个已装配页面都在这里有条目」，就是为了把这种静默失配变成红。
 *
 * icon 取 app-shell.tsx 里 iconMap 的键名。写错不会报错，resolveIcon 会静默回落到 CircleDot ——
 * 所以新增条目时要对着那张表挑，别凭印象写。
 *
 * name 写 `console` 命名空间里的词条 key（src/messages.ts 的 `menu.*`），由 workspace-root 按当前语言翻译；
 * 找不到对应词条时原样显示，所以直接写字面名称也能用。
 */
export const consoleNav: NavItem[] = [
  { name: "menu.gatewayKey", path: "/gateway/key", icon: "idcard" },
  { name: "menu.gatewayModel", path: "/gateway/model", icon: "appstore" },
  { name: "menu.gatewayUsage", path: "/gateway/usage", icon: "file-text" },
  { name: "menu.paymentBilling", path: "/payment/billing", icon: "pay-circle" },
  { name: "menu.memberInvite", path: "/member/invite", icon: "team" },
  { name: "menu.accountProfile", path: "/account/profile", icon: "user" },
];

/**
 * 二级页面：有入口、但不进侧栏 —— 从别的页面或右上角个人菜单点进去。
 * harness S52 把这里与 consoleNav 一起当作「入口」：漏登记的页面仍然会被判成隐形页，
 * 所以新增一个只从页面内跳转的页面时，要在这里写明它从哪进。
 */
export const consoleSubPages: Array<{ path: string; from: string }> = [
  { path: "/account/password", from: "右上角个人菜单「修改密码」、个人资料 → 登录密码" }, // i18n-exempt: 入口说明给 harness 与开发者看，不上界面
  { path: "/account/email", from: "个人资料 → 邮箱「绑定 / 修改」" }, // i18n-exempt: 入口说明给 harness 与开发者看，不上界面
  { path: "/account/mobile", from: "个人资料 → 手机号「绑定 / 修改」" }, // i18n-exempt: 入口说明给 harness 与开发者看，不上界面
];
