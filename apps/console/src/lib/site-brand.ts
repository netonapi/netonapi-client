import { backendUrl } from "@neton/application-client-runtime/server";
import { NO_CAPTCHA, parseCaptchaConfig, type CaptchaConfig } from "@neton/application-client-runtime/captcha";

export type SiteBrand = { name: string; tagline: string; captcha: CaptchaConfig };

/** 后端不可达（构建期、后端重启中）时的兜底；与 system 模块 SystemSettingKeys 的默认值一致。 */
export const DEFAULT_SITE_BRAND: SiteBrand = { name: "Neton", tagline: "", captcha: NO_CAPTCHA };

/**
 * 站点品牌来自后台「配置管理」的 system.site.name / system.site.tagline（匿名接口），
 * 同一个接口顺带给出人机验证的公开配置（站点 key 与需要验证的动作）。
 * 缓存 30 秒：后台改名后半分钟内生效，又不会每次渲染都打一次后端。
 */
export async function getSiteBrand(): Promise<SiteBrand> {
  try {
    const res = await fetch(`${backendUrl()}/admin/system/site/public`, { next: { revalidate: 30 } });
    const body = (await res.json()) as { code?: number; data?: { name?: string; tagline?: string; captcha?: unknown } };
    if (body.code !== 0 || !body.data?.name) return DEFAULT_SITE_BRAND;
    return { name: body.data.name, tagline: body.data.tagline ?? "", captcha: parseCaptchaConfig(body.data.captcha) };
  } catch {
    return DEFAULT_SITE_BRAND;
  }
}
