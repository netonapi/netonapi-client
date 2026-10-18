import { backendJson } from "@neton/application-client-runtime/server";

interface ForgotInput { action?: "send" | "reset"; email?: string; code?: string; newPassword?: string }

/** 找回密码：匿名两步（发码 → 重置），都经服务端代理打后端，浏览器不直连后端。 */
export async function POST(req: Request) {
  const input = (await req.json().catch(() => null)) as ForgotInput | null;
  const email = input?.email?.trim().toLowerCase() ?? "";
  if (!email) return Response.json({ code: 10100, message: "VALIDATION_FAILED", errors: [{ field: "email", code: "REQUIRED", message: "REQUIRED" }] }, { status: 400 });
  if (input?.action === "send") {
    const res = await backendJson<unknown>("/app/auth/send-email-code", undefined, { method: "POST", body: JSON.stringify({ email, scene: "reset_password" }) });
    if (res.code !== 0) return Response.json({ code: res.code || 4, message: res.message || "INVALID_RESPONSE", errors: res.errors }, { status: 400 });
    return Response.json({ code: 0 });
  }
  const code = input?.code?.trim() ?? "";
  const newPassword = input?.newPassword ?? "";
  if (!code) return Response.json({ code: 10100, message: "VALIDATION_FAILED", errors: [{ field: "code", code: "REQUIRED", message: "REQUIRED" }] }, { status: 400 });
  if (newPassword.length < 8) return Response.json({ code: 10100, message: "PASSWORD_TOO_SHORT", errors: [{ field: "newPassword", code: "PASSWORD_TOO_SHORT", message: "PASSWORD_TOO_SHORT" }] }, { status: 400 });
  const res = await backendJson<unknown>("/app/auth/reset-password-by-email", undefined, { method: "PUT", body: JSON.stringify({ email, code, newPassword }) });
  if (res.code !== 0) return Response.json({ code: res.code || 4, message: res.message || "INVALID_RESPONSE", errors: res.errors }, { status: 400 });
  return Response.json({ code: 0 });
}
