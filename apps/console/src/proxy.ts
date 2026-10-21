import { createPublicProxy } from "@neton/application-client-runtime/public-proxy";
import { proxyConfig } from "@/generated/public-proxy.generated";

/**
 * 底座的请求代理（public-routes §2、§4、§7.2、§13）：控制台的登录拦截、旧 URL 308、410、
 * 查询参数白名单。规则在运行时包里，这里只接上生成的数据。
 */
export const proxy = createPublicProxy(proxyConfig);

export const config = {
  // 静态资源与 Next 内部地址不经过 proxy
  matcher: ["/((?!_next/static|_next/image|favicon.ico|neton-icon.png).*)"],
};
