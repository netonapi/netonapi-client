import { cookies } from "next/headers";
import { getMemberProfile, SESSION_COOKIE } from "@neton/application-client-runtime/server";
import { memberDisplayName } from "@neton/application-client-runtime/types";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * 公开页水合后的会话状态（public-routes §9.1）。会话失效时清 Cookie 并返回 `authenticated: false`
 * ——不是 401：公开页上不该因为一个过期 Cookie 触发跳转。
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return Response.json({ code: 0, data: { authenticated: false } }, { headers: PRIVATE });
  const res = await getMemberProfile(token);
  if (res.code !== 0 || !res.data) {
    // 只有确定是会话失效才清 Cookie；后端暂时不可用时保留，下次再试
    if (res.code >= 10000 && res.code < 10100) store.delete(SESSION_COOKIE);
    return Response.json({ code: 0, data: { authenticated: false } }, { headers: PRIVATE });
  }
  const member = res.data;
  return Response.json({
    code: 0,
    data: { authenticated: true, user: { userId: String(member.id), nickname: memberDisplayName(member), avatar: member.avatar ?? "" } },
  }, { headers: PRIVATE });
}
