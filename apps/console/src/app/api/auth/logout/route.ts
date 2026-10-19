import { cookies } from "next/headers";
import { backendJson, csrfRejection, forwardedClientHeaders, SESSION_COOKIE } from "@neton/application-client-runtime/server";

export async function POST(req: Request) {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await backendJson("/app/auth/logout", token, { method: "POST", headers: forwardedClientHeaders(req.headers) });
  store.delete(SESSION_COOKIE);
  return Response.json({ code: 0 });
}
