/**
 * 代理到后端时要带上的来源头。
 *
 * 控制台的 Route Handler 替浏览器调后端，后端看到的对端永远是控制台本机：不透传的话，
 * 按 IP 的登录限流、注册防刷、审计 IP 全部落在同一个地址上 —— 一个人刷爆，所有人一起被限。
 *
 * 只原样转发边缘反代写入的 X-Forwarded-For，不自己拼：控制台只监听本机，这个头只可能来自反代；
 * 后端把本机配成可信代理（ratelimit.trusted_proxies），从右往左剥掉可信跳，取到的就是真实客户端。
 *
 * 人机验证凭证（X-Captcha-Token）也在这里一并转发：后端拿它和客户端 IP 一起去供应商核验。
 */
export function forwardedClientHeaders(source: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const xff = source.get("x-forwarded-for")?.trim();
  if (xff) out["X-Forwarded-For"] = xff;
  const ua = source.get("user-agent");
  if (ua) out["User-Agent"] = ua;
  const captcha = source.get("x-captcha-token")?.trim();
  if (captcha) out["X-Captcha-Token"] = captcha;
  return out;
}
