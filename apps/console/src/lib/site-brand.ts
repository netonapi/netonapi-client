import { PUBLIC_CACHE_PROFILES } from "@neton/application-client-runtime/public";
import { cacheLife, cacheTag } from "next/cache";
import { NO_CAPTCHA, parseCaptchaConfig, type CaptchaConfig } from "@neton/application-client-runtime/captcha";
import { SITE_CONFIG_TAG } from "@neton/application-client-runtime/public";
import { publicBackendUrl } from "@neton/application-client-runtime/public-server";
import { site } from "@/generated/site.generated";

export type SiteBrand = { name: string; tagline: string; captcha: CaptchaConfig };

/** 后端不可达（构建期、后端重启中）时的兜底：站点配置里的品牌（缺省 Neton），不开人机验证。 */
export const FALLBACK_SITE_BRAND: SiteBrand = { name: site.brand.name, tagline: site.brand.tagline, captcha: NO_CAPTCHA };

/**
 * 站点品牌来自后台「配置管理」的 system.site.name / system.site.tagline（匿名接口），
 * 同一个接口顺带给出人机验证的公开配置（站点 key 与需要验证的动作）。
 *
 * 公开页面与控制台共用一份缓存（`list` 档：30 秒新鲜，后台改名半分钟内生效；标签 `site:config`，
 * 可由失效端点立即刷新）。不带任何会员身份，结果对所有人相同。
 */
export async function getSiteBrand(): Promise<SiteBrand> {
  "use cache";
  cacheLife(PUBLIC_CACHE_PROFILES.list);
  cacheTag(SITE_CONFIG_TAG);
  // 构建期不连后端（public-routes §1a）：构建期预渲染的只有哨兵页与静态的登录注册页、站点 404，
  // 它们按 list 档 30 秒后在运行期重新生成，换上后台配置的品牌
  if (process.env.NEXT_PHASE === "phase-production-build") return FALLBACK_SITE_BRAND;
  try {
    const res = await fetch(`${publicBackendUrl()}/admin/system/site/public`, { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { code?: number; data?: { name?: string; tagline?: string; captcha?: unknown } };
    if (body.code !== 0 || !body.data?.name) return FALLBACK_SITE_BRAND;
    return { name: body.data.name, tagline: body.data.tagline ?? "", captcha: parseCaptchaConfig(body.data.captcha) };
  } catch {
    return FALLBACK_SITE_BRAND;
  }
}
