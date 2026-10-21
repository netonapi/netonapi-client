/**
 * 缓存档位的具体时长（public-routes §8.1）。底座 next.config 把它们注册成 cacheLife 档位；
 * 公开路由的 `cache` 选档位，`load` 的结果类型（not_found / unavailable / gone）选状态档位。
 *
 * CDN 的 `Cache-Control` 由 Next 按整页里**最短**的档位生成：`s-maxage = revalidate`、
 * `stale-while-revalidate = expire - revalidate`。所以 revalidate 同时就是「没有 CDN 主动刷新时
 * CDN 层的新鲜度上限」，刻意取短；事件驱动的失效（site 模块投递标签）才是主路径。
 *
 * 约束（Next 的预渲染规则）：stale ≥ 30 秒、expire ≥ 5 分钟，否则会被排除出预渲染、变成请求期的
 * 动态洞，整页缓存就不成立了。
 */
export interface CacheProfile { stale: number; revalidate: number; expire: number }

export const PUBLIC_CACHE_PROFILES = {
  /** 详情页（文章、作者） */
  object: { stale: 60, revalidate: 60, expire: 7 * 86400 },
  /** 栏目、标签、榜单、首页楼层、sitemap 分片 */
  list: { stale: 30, revalidate: 30, expire: 3600 },
  /** 单页、关于、协议、robots */
  static: { stale: 300, revalidate: 300, expire: 30 * 86400 },
  /** 对象暂时下线（撤回、归档、回收站）：404 + noindex，很快重新确认 */
  unavailable: { stale: 30, revalidate: 60, expire: 600 },
  /** 对象已彻底删除：页面层只能给 404（410 由 proxy 给），缓存一天 */
  gone: { stale: 300, revalidate: 86400, expire: 7 * 86400 },
} as const satisfies Record<string, CacheProfile>;

export type PublicCacheProfileName = keyof typeof PUBLIC_CACHE_PROFILES;

/** 会渲染媒体地址的档位（状态页没有图片，不受签名有效期约束）。 */
const MEDIA_PROFILES: PublicCacheProfileName[] = ["object", "list", "static"];

/**
 * infra 的 CDN 地址策略开启了鉴权（签名有时效，infra-media §7.3）时，缓存的 HTML 不能比签名活得久：
 * 每个会渲染媒体的档位 `revalidate ≤ 签名有效期 / 2`。启动（next.config 加载）时校验，不满足直接失败。
 * 超过 revalidate 之后的 stale-while-revalidate 窗口里给出的旧页面，由客户端的图片兜底刷新（同节）。
 */
export function assertCacheFitsMediaValidity(validitySeconds: number | undefined, profiles: Record<string, CacheProfile> = PUBLIC_CACHE_PROFILES): void {
  if (validitySeconds === undefined) return;
  if (!Number.isFinite(validitySeconds) || validitySeconds <= 0) throw new Error(`[site] media.signedUrlValiditySeconds must be a positive number, got ${validitySeconds}`);
  for (const name of MEDIA_PROFILES) {
    const profile = profiles[name];
    if (profile && profile.revalidate > validitySeconds / 2) {
      throw new Error(`[site] cache profile "${name}" revalidates after ${profile.revalidate}s, longer than half the signed media URL validity (${validitySeconds}s): cached HTML would outlive its image signatures`);
    }
  }
}

const MEDIA_VALIDITY = Symbol.for("neton.client.site.media-validity");
type ValidityHolder = { [MEDIA_VALIDITY]?: number };

/** 进程级共享对象（与已删除集合同理：proxy 与渲染上下文拿到的是同一个 `process`）。 */
function validityHolder(): ValidityHolder {
  return (typeof process === "object" && process ? process : globalThis) as unknown as ValidityHolder;
}

/**
 * 运行期生效的签名有效期（秒）：启动时与后端 `GET /app/infra/media/policy` 交叉校验后设置
 * （public-server/media-policy.ts，取站点配置与后端两者中较短的一个）。undefined = 媒体地址不过期。
 */
export function setEffectiveMediaValidity(seconds: number | undefined): void {
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) throw new Error(`[site] invalid media validity ${seconds}`);
  validityHolder()[MEDIA_VALIDITY] = seconds;
}

export function effectiveMediaValidity(): number | undefined {
  return validityHolder()[MEDIA_VALIDITY];
}

/**
 * 把会渲染媒体的档位收紧到「revalidate ≤ 有效期 / 2」（纯函数）。构建期的 [assertCacheFitsMediaValidity]
 * 保证站点配置与档位一致；这里兜住运行期才发现的不一致（后端的签名有效期比站点配置短）。
 */
export function clampProfileToMedia(name: PublicCacheProfileName, validitySeconds: number | undefined): CacheProfile {
  const profile: CacheProfile = PUBLIC_CACHE_PROFILES[name];
  if (validitySeconds === undefined || !MEDIA_PROFILES.includes(name)) return profile;
  const limit = Math.max(1, Math.floor(validitySeconds / 2));
  return profile.revalidate <= limit ? profile : { ...profile, revalidate: limit };
}

/** 运行期使用的档位：调用 `cacheLife` 与输出 `Cache-Control` 的地方一律经它取（不直接读常量）。 */
export function cacheProfile(name: PublicCacheProfileName): CacheProfile {
  return clampProfileToMedia(name, effectiveMediaValidity());
}

/**
 * Route Handler（sitemap、RSS、robots）自己设的 `Cache-Control`，与 Next 给页面生成的同一形式：
 * `s-maxage = revalidate`、`stale-while-revalidate = expire - revalidate`。
 */
export function cacheControlFor(name: PublicCacheProfileName): string {
  const p = cacheProfile(name);
  return `public, s-maxage=${p.revalidate}, stale-while-revalidate=${p.expire - p.revalidate}`;
}
