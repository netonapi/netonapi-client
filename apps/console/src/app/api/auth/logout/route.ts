import { cookies } from "next/headers";
import { backendJson, csrfRejection, forwardedClientHeaders, SESSION_COOKIE } from "@neton/application-client-runtime/server";

/** 退出：作废后端会话并清 Cookie。门户上退出由页面自己决定留在当前页（public-routes §9.2）。 */
export async function POST(req: Request) {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await backendJson("/app/auth/logout", token, { method: "POST", headers: forwardedClientHeaders(req.headers) });
  store.delete(SESSION_COOKIE);
  return Response.json({ code: 0 });
}
