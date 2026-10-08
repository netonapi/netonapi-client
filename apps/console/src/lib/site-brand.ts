import { backendUrl } from "@neton/application-client-runtime/server";

export type SiteBrand = { name: string; tagline: string };

/** 后端不可达（构建期、后端重启中）时的兜底；与 system 模块 SystemSettingKeys 的默认值一致。 */
export const DEFAULT_SITE_BRAND: SiteBrand = { name: "Neton", tagline: "" };

/**
 * 站点品牌来自后台「配置管理」的 system.site.name / system.site.tagline（匿名接口）。
 * 缓存 30 秒：后台改名后半分钟内生效，又不会每次渲染都打一次后端。
 */
export async function getSiteBrand(): Promise<SiteBrand> {
  try {
    const res = await fetch(`${backendUrl()}/admin/system/site/public`, { next: { revalidate: 30 } });
    const body = (await res.json()) as { code?: number; data?: Partial<SiteBrand> };
    if (body.code !== 0 || !body.data?.name) return DEFAULT_SITE_BRAND;
    return { name: body.data.name, tagline: body.data.tagline ?? "" };
  } catch {
    return DEFAULT_SITE_BRAND;
  }
}
