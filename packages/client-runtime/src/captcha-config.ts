/**
 * 人机验证的公开配置，来自 system 模块的 `/admin/system/site/public`（spec auth-abuse-protection §6.1）。
 *
 * 要不要验证由后端决定：前端只按这里的 actions 渲染组件、把凭证放进 [CAPTCHA_HEADER] 发回去，
 * 真正的核验在后端。前端不渲染、不带凭证，后端照样拒绝 —— 关掉前端开关绕不过去。
 */
export interface CaptchaConfig {
  /** 空串 = 未启用。 */
  provider: string;
  siteKey: string;
  /** 需要验证的动作：login / register / send_code / admin_login。 */
  actions: string[];
}

/** 凭证随请求放在这个头里，不进请求体：各接口的 DTO 不用为验证码改字段。 */
export const CAPTCHA_HEADER = "X-Captcha-Token";

export const NO_CAPTCHA: CaptchaConfig = { provider: "", siteKey: "", actions: [] };

export function captchaRequired(config: CaptchaConfig | null | undefined, action: string): boolean {
  return !!config && config.provider === "turnstile" && !!config.siteKey && config.actions.includes(action);
}

/** 只认已知字段，其余丢弃；解析不出来按未启用处理（后端仍会拒绝缺凭证的请求）。 */
export function parseCaptchaConfig(raw: unknown): CaptchaConfig {
  if (!raw || typeof raw !== "object") return NO_CAPTCHA;
  const r = raw as Record<string, unknown>;
  return {
    provider: typeof r.provider === "string" ? r.provider : "",
    siteKey: typeof r.siteKey === "string" ? r.siteKey : "",
    actions: Array.isArray(r.actions) ? r.actions.filter((a): a is string => typeof a === "string") : [],
  };
}
