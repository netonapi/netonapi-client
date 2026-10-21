import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createPublicProxy } from "@neton/application-client-runtime/public-proxy";
import { proxyConfig } from "@/generated/public-proxy.generated";

/**
 * 底座的请求代理（public-routes §2、§4、§7.2、§13）：控制台的登录拦截、旧 URL 308、410、
 * 查询参数白名单。规则在运行时包里，这里只接上生成的数据。
 */
const publicProxy = createPublicProxy(proxyConfig);

/**
 * NetonAPI 增量：控制台在根路径（consoleBasePath = "/"），除了底座自带的登录注册页等，
 * 公开价格页也要匿名可看，不走控制台的登录拦截。
 */
const ANONYMOUS_PAGES = ["/pricing"];

export function proxy(request: NextRequest) {
  if (ANONYMOUS_PAGES.includes(request.nextUrl.pathname)) return NextResponse.next();
  return publicProxy(request);
}

export const config = {
  // 静态资源与 Next 内部地址不经过 proxy
  matcher: ["/((?!_next/static|_next/image|favicon.ico|neton-icon.png).*)"],
};
