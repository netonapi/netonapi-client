import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMemberProfile, SESSION_COOKIE } from "@neton/application-client-runtime/server";
import { WorkspaceRoot } from "@/components/workspace-root";

/**
 * 受保护布局。
 *
 * C 端**保留服务端渲染**：会话校验在 server component 里完成，未登录直接 redirect，
 * 首屏不会先闪一下再跳。这和 admin 后台不同 —— 那边为了三个发行版共用一份静态壳
 * 放弃了 SSR；面向终端用户的产品对首屏和可索引性有要求，这条不跟。
 *
 * 布局跨路由不卸载，工作区根挂在这里，页面实例的寿命才不受宿主路由影响；
 * `children` 被刻意忽略，内容一律由工作区宿主渲染。
 */
export default async function ProtectedLayout() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const res = await getMemberProfile(token);
  if (res.code !== 0 || !res.data) redirect("/login");

  const member = res.data;
  return (
    <WorkspaceRoot
      user={{
        userId: String(member.id),
        username: member.username ?? "",
        nickname: member.nickname ?? member.username ?? `用户${member.id}`,
        avatar: member.avatar ?? "",
        homePath: "/",
      }}
    />
  );
}
