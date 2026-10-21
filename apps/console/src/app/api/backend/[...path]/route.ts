import { cookies } from "next/headers";
import { backendUrl, csrfRejection, forwardedClientHeaders, SESSION_COOKIE } from "@neton/application-client-runtime/server";

/**
 * 浏览器 → 后端的代理：有会话 Cookie 时换成 Authorization 头；**没有时不带身份照样转发**，
 * 是否允许匿名由后端接口自己决定（`@AllowAnonymous`），门户上的收藏数、评论翻页、发验证码都走这里
 * （public-routes §9.3）。
 *
 * 透传边缘反代的 X-Forwarded-For，后端按可信代理剥跳后拿到真实客户端 IP（限流、审计都靠它）。
 *
 * 透传边缘反代的 X-Forwarded-For，后端按可信代理剥跳后拿到真实客户端 IP（限流、审计都靠它）。
 *
 * 只转发 `/app/...`：用户端的会话只属于账号身份域，代理不该替浏览器访问后台或其他路由组
 * （后端的身份域隔离也会拒绝，这里是纵深防御）。写请求先过 CSRF 检查。
 */
async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] !== "app") return Response.json({ code: 10004, message: "FORBIDDEN_PATH" }, { status: 403 });
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  const url = new URL(req.url);
  const target = `${backendUrl()}/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const res = await fetch(target, {
    method: req.method,
    headers: {
      ...forwardedClientHeaders(req.headers),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });
  const headers = new Headers({ "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "private, no-store" });
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return new Response(await res.arrayBuffer(), { status: res.status, headers });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
