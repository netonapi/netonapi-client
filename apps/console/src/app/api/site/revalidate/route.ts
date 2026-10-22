import { revalidateTag } from "next/cache";
import { reservedPrefixes } from "@neton/application-client-runtime/public";
import {
  goneStore,
  parseRevalidateRequest,
  recentEvents,
  revalidateSecret,
  siteWarmer,
  SIGNATURE_HEADER,
  verifySignature,
} from "@neton/application-client-runtime/public-server";
import { site } from "@/generated/site.generated";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * 失效端点（public-routes §8.4）：服务端 site 模块在对象可见性变化时调用。
 *
 * - 鉴权：`X-Neton-Signature: t=…,v1=HMAC-SHA256(secret, t + "." + 原始 body)`，偏差 > 300 秒拒绝；
 * - `refresh` = 先给旧的、后台刷新（上线与更新）；`expire` = 立即过期（下线：撤回的内容不能再被任何人看到）；
 * - `gone` / `revived` 增删已删除集合（410）；按 `eventId` 幂等；
 * - 不访问后端、不渲染页面（有 expire 时稍后由预热器重新请求热点页面，不在本请求里）。部署时只对内网开放（签名是第二道门）。
 */
export async function POST(request: Request) {
  const secret = revalidateSecret();
  if (!secret) return Response.json({ code: 3, message: "REVALIDATE_DISABLED" }, { status: 503, headers: PRIVATE });

  const raw = await request.text();
  const failure = verifySignature(request.headers.get(SIGNATURE_HEADER), raw, secret);
  if (failure) return Response.json({ code: 10001, message: failure }, { status: 401, headers: PRIVATE });

  const parsed = parseRevalidateRequest(raw, reservedPrefixes(site));
  if (!parsed.ok) {
    const code = parsed.message === "REVALIDATE_TOO_LARGE" ? 10106 : 10100;
    return Response.json({ code, message: parsed.message, errors: parsed.errors.map((e) => ({ field: e.field, code: e.code, message: e.code })) }, { status: 400, headers: PRIVATE });
  }
  const { eventId, items, gone, revived } = parsed.request;
  if (!recentEvents().remember(eventId)) return Response.json({ code: 0, data: { applied: 0, duplicate: true } }, { headers: PRIVATE });

  for (const { tag, mode } of items) revalidateTag(tag, mode === "expire" ? { expire: 0 } : "max");
  // expire 之后下一个请求要等完整渲染：让服务自己先把热点页面渲染好（§8.7；refresh 走 stale-while-revalidate，不需要）
  if (items.some((i) => i.mode === "expire")) siteWarmer(site.warmup.paths).scheduleRewarm();
  const store = goneStore();
  if (gone.length) await store.add(gone);
  if (revived.length) await store.delete(revived);
  return Response.json({ code: 0, data: { applied: items.length + gone.length + revived.length } }, { headers: PRIVATE });
}
