/**
 * 站点发布通道的共享密钥签名（public-routes §8.4、site-module §6）。
 *
 * 头：`X-Neton-Signature: t=<epoch 秒>,v1=<hex>`，`v1 = HMAC-SHA256(secret, t + "." + payload)`：
 * - 失效端点（后端 → 网页服务）：payload = 原始请求体；
 * - 已删除台账（网页服务 → 后端）：payload = 请求路径与查询串。
 * 时间偏差超过 300 秒拒绝（防重放窗口）；比较用常数时间。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "X-Neton-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** 密钥至少 32 字节；更短的密钥视为未配置（端点关闭），避免弱密钥上线。 */
export const MIN_SECRET_BYTES = 32;

export type SignatureFailure = "SIGNATURE_INVALID" | "SIGNATURE_EXPIRED";

export function revalidateSecret(): string | null {
  const secret = process.env.NETON_SITE_REVALIDATE_SECRET ?? "";
  return Buffer.byteLength(secret, "utf8") >= MIN_SECRET_BYTES ? secret : null;
}

export function sign(secret: string, timestamp: number, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

export function signatureHeader(secret: string, payload: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${sign(secret, t, payload)}`;
}

function parseHeader(header: string): { t: number; v1: string } | null {
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value && /^\d{1,12}$/.test(value)) t = Number(value);
    if (key === "v1" && value && /^[0-9a-f]{64}$/.test(value)) v1 = value;
  }
  return t === undefined || v1 === undefined ? null : { t, v1 };
}

/** 校验签名；通过返回 null，否则返回失败原因（机器码）。 */
export function verifySignature(header: string | null, payload: string, secret: string, now = Date.now()): SignatureFailure | null {
  const parsed = header ? parseHeader(header) : null;
  if (!parsed) return "SIGNATURE_INVALID";
  const expected = Buffer.from(sign(secret, parsed.t, payload), "hex");
  const actual = Buffer.from(parsed.v1, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "SIGNATURE_INVALID";
  if (Math.abs(Math.floor(now / 1000) - parsed.t) > SIGNATURE_TOLERANCE_SECONDS) return "SIGNATURE_EXPIRED";
  return null;
}
