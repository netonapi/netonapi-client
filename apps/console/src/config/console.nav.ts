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
 */
export const consoleNav: NavItem[] = [
  { name: "API Key", path: "/gateway/key", icon: "idcard" },
  { name: "模型与价格", path: "/gateway/model", icon: "appstore" },
  { name: "用量与额度", path: "/gateway/usage", icon: "file-text" },
  { name: "充值与流水", path: "/payment/billing", icon: "pay-circle" },
  { name: "个人资料", path: "/member/profile", icon: "user" },
];

/**
 * 二级页面：有入口、但不进侧栏 —— 从别的页面或右上角个人菜单点进去。
 * harness S52 把这里与 consoleNav 一起当作「入口」：漏登记的页面仍然会被判成隐形页，
 * 所以新增一个只从页面内跳转的页面时，要在这里写明它从哪进。
 */
export const consoleSubPages: Array<{ path: string; from: string }> = [
  { path: "/member/password", from: "右上角个人菜单「修改密码」、个人资料 → 登录密码" },
  { path: "/member/email", from: "个人资料 → 邮箱「绑定 / 修改」" },
  { path: "/member/mobile", from: "个人资料 → 手机号「绑定 / 修改」" },
];
