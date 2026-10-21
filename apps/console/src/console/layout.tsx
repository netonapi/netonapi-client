import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMemberProfile, SESSION_COOKIE } from "@neton/application-client-runtime/server";
import { consoleHref, loginHref } from "@neton/application-client-runtime/public";
import { PATHNAME_HEADER } from "@neton/application-client-runtime/public-proxy";
import { memberDisplayName } from "@neton/application-client-runtime/types";
import { Providers } from "@/components/providers";
import { SiteBrandProvider } from "@/components/site-brand";
import { WorkspaceRoot } from "@/components/workspace-root";
import { site } from "@/generated/site.generated";
import { getSiteBrand } from "@/lib/site-brand";
import "@/styles/console.css";

/**
 * 控制台（受保护）布局，生成在 `(console)/<consoleBasePath>/layout.tsx`。
 *
 * C 端**保留服务端渲染**：会话校验在 server component 里完成，未登录直接跳登录页，首屏不会先闪一下
 * 再跳。没有 Cookie 的请求在 proxy 里就 307 到 `/login?next=` 了；这里处理的是 Cookie 还在、会话已失效
 * 的情况，`next` 取 proxy 放进请求头的原地址。
 *
 * 布局跨路由不卸载，工作区根挂在这里，页面实例的寿命才不受宿主路由影响；`children` 被刻意忽略，
 * 内容一律由工作区宿主渲染。
 */
export default async function ConsoleLayout() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const here = headerStore.get(PATHNAME_HEADER) ?? consoleHref("/", site.consoleBasePath);
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect(loginHref(here, site.consoleBasePath));

  const [res, brand] = await Promise.all([getMemberProfile(token), getSiteBrand()]);
  if (res.code !== 0 || !res.data) redirect(loginHref(here, site.consoleBasePath));

  const member = res.data;
  return (
    <Providers>
      <SiteBrandProvider brand={brand}>
        <WorkspaceRoot
          basePath={site.consoleBasePath}
          user={{
            userId: String(member.id),
            username: member.username ?? "",
            nickname: memberDisplayName(member),
            avatar: member.avatar ?? "",
            // NetonAPI 控制台的首页是用量页（fork 增量）
            homePath: "/gateway/usage",
          }}
        />
      </SiteBrandProvider>
    </Providers>
  );
}
