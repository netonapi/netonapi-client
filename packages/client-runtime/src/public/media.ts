/**
 * 公开页的媒体（public-routes §10.4，infra-media §7.3「CDN 地址策略」）。
 *
 * 地址由后端 infra 生成（「只存引用、地址由 infra 生成」）：未开 CDN 鉴权时是稳定地址；开了鉴权时是按时间桶
 * 取整的确定性签名地址——同一桶内所有人拿到同一个地址，缓存的 HTML 照样逐字节一致。图片缩放交给 CDN 的
 * 图片处理参数：后端按固定宽度档给出每一档的完整（已签名）地址 `variants`，网页端只负责拼 `srcset`。
 *
 * 本文件是同构的纯规则（可单测）：属性计算、可替换的加载器、长开标签页的图片兜底脚本。
 * 组件在 media-image.tsx。
 */

/** 后端展开后的媒体（content 等模块的 `ContentMediaVO` 与之同形）。 */
export interface PublicMedia {
  fileId: string;
  /** 原图地址（没有派生规格时就用它） */
  url: string;
  mimeType?: string | null;
  /** 原图像素宽高（infra 上传 / 转存时嗅探得到；旧文件可能没有） */
  width?: number | null;
  height?: number | null;
  /** 派生规格 → 完整地址：`w180` … `w1440`（限宽、保持比例）、`og`（1200×675 裁切）。只有开了 CDN 图片处理才有。 */
  variants?: Record<string, string> | null;
}

/** infra 的固定宽度档（infra-media §7.3）。 */
export const MEDIA_VARIANT_WIDTHS = [180, 360, 720, 1080, 1440] as const;
export type MediaVariantWidth = (typeof MEDIA_VARIANT_WIDTHS)[number];

/** 分享卡片规格（1200×675，16:9）。 */
export const OG_VARIANT = "og";
export const OG_SIZE = { width: 1200, height: 675 } as const;

export function variantKey(width: MediaVariantWidth): string {
  return `w${width}`;
}

/** 常用的固定比例（列表单图 3:2、焦点图 16:9……）；数字 = 宽 / 高。 */
export type MediaAspect = "16:9" | "3:2" | "4:3" | "1:1" | number;

export function aspectRatio(aspect: MediaAspect): number {
  if (typeof aspect === "number") {
    if (!Number.isFinite(aspect) || aspect <= 0) throw new Error(`[media] invalid aspect ratio ${aspect}`);
    return aspect;
  }
  const [w, h] = aspect.split(":").map(Number);
  return w! / h!;
}

export interface MediaLoaderInput {
  media: PublicMedia;
  /** 页面上的最大展示宽度（CSS 像素）：决定 `src` 选哪一档（缺省 720） */
  displayWidth: number;
}

export interface MediaLoaderOutput {
  src: string;
  /** `url 180w, url 360w …`；没有派生规格时省略 */
  srcSet?: string;
  /** `src` 用的规格 key（图片失败时兜底刷新取同一档），原图为 undefined */
  variant?: string;
}

/** 媒体加载器：由媒体与展示宽度决定 `src` / `srcset`。产品可整体替换（[setMediaLoader]）。 */
export type MediaLoader = (input: MediaLoaderInput) => MediaLoaderOutput;

/**
 * 缺省加载器：用后端给的宽度档。`src` 取不小于 2× 展示宽度的最小一档（高分屏清晰、又不过大），
 * 没有就取最大的一档。`srcset` 只列**这张图用得上的**档位：从不小于展示宽度一半的最小一档（小屏上按 `sizes`
 * 缩窄时的 1×）到 `src` 那一档（2×）——列表缩略图（展示 180）只有 180、360 两档，正文图（展示 720）是
 * 360–1440。每个档位都是一条完整的签名地址，全部列出会让 HTML 与 RSC 载荷各多出几百字节一张图，
 * 而且签名几乎不可压缩（一页 60 张卡片就是几十 KB）。没有派生规格时只给原图。
 */
export const defaultMediaLoader: MediaLoader = ({ media, displayWidth }) => {
  const available = MEDIA_VARIANT_WIDTHS.filter((w) => media.variants?.[variantKey(w)]);
  if (!available.length) return { src: media.url };
  const target = displayWidth * 2;
  const chosen = available.find((w) => w >= target) ?? available[available.length - 1]!;
  const smallest = available.find((w) => w * 2 >= displayWidth) ?? chosen;
  const listed = available.filter((w) => w >= smallest && w <= chosen);
  return {
    src: media.variants![variantKey(chosen)]!,
    srcSet: listed.map((w) => `${media.variants![variantKey(w)]} ${w}w`).join(", "),
    variant: variantKey(chosen),
  };
};

const LOADER = Symbol.for("neton.client.site.media-loader");
type LoaderHolder = { [LOADER]?: MediaLoader };

/** 换掉站点的媒体加载器（fork 的 src/site/media-loader.ts，由 public-runtime 在加载时设置）。 */
export function setMediaLoader(loader: MediaLoader): void {
  (globalThis as LoaderHolder)[LOADER] = loader;
}

export function mediaLoader(): MediaLoader {
  return (globalThis as LoaderHolder)[LOADER] ?? defaultMediaLoader;
}

export interface MediaImageOptions {
  media: PublicMedia;
  alt: string;
  /** `sizes` 属性；缺省 `(max-width: {displayWidth}px) 100vw, {displayWidth}px` */
  sizes?: string;
  /** 最大展示宽度（CSS 像素），缺省 720（正文宽度） */
  displayWidth?: number;
  /** 固定比例占位：没有原图宽高时用它给出 width / height（避免 CLS），有宽高时用 CSS 裁切到该比例 */
  aspect?: MediaAspect;
  /**
   * 页面的 LCP 图（详情首图、焦点图第一张、列表第一张——一页只有一张）：`fetchpriority="high"`、不懒加载、
   * 在 `<head>` 预加载。同一次渲染里第二张 priority 图降级为 [eager]（并在开发环境告警）。
   */
  priority?: boolean;
  /**
   * 首屏内、但不是 LCP 的图（列表前几张）：`loading="eager"`，不提高优先级。React 对不懒加载的 `<img>` 自己会在
   * `<head>` 给一个普通优先级的预加载提示，这里不额外处理。
   */
  eager?: boolean;
  className?: string;
}

/** `<img>` 的全部属性（React 属性名）。 */
export interface MediaImageAttributes {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  width?: number;
  height?: number;
  loading: "eager" | "lazy";
  decoding: "async" | "auto";
  fetchPriority?: "high";
  className?: string;
  style?: { aspectRatio?: string; objectFit?: "cover" };
  "data-neton-media": string;
  "data-neton-variant"?: string;
}

/** 底座的匿名后端代理（`/api/backend/*` → 后端 `/app/*`，public-routes §9.3）。 */
export const BACKEND_PROXY_PREFIX = "/api/backend";

/**
 * 浏览器能取到的媒体地址。后端给的地址有两种：CDN / 对象存储的绝对地址（原样用），以及 infra 中转读取的
 * **站内相对地址** `/app/infra/file/get/…`（CDN 地址策略为 `none` 时，infra-media §7.2）——它相对的是后端，
 * 不是门户；门户上把它改走底座的匿名代理 `/api/backend/app/…`，否则图片在门户域名下 404。
 */
export function browserMediaUrl(url: string): string {
  return url.startsWith("/app/") ? `${BACKEND_PROXY_PREFIX}${url}` : url;
}

/** 没有原图宽高、只有比例时给出的名义宽度（只用来让浏览器算出比例；实际尺寸由 CSS 决定）。 */
const NOMINAL_WIDTH = 1200;

/**
 * 计算 `<img>` 属性（纯函数）。规则（CLIENT_SPEC §7、public-routes §10.4）：
 * - 一律带 `width` / `height`（原图宽高，或按 `aspect` 的名义尺寸），浏览器在下载前就能留出位置（CLS）；
 * - 给了 `aspect` 时用 CSS `aspect-ratio` + `object-fit: cover` 裁到该比例（列表缩略图形状统一）；
 * - `priority`：`loading="eager"` + `fetchpriority="high"`；`eager`：只 `loading="eager"`；其余 `loading="lazy"`；
 *   非 priority 的图一律 `decoding="async"`；
 * - `data-neton-media` / `data-neton-variant` 供长开标签页的图片兜底脚本换取新地址。
 */
export function mediaImageAttributes(options: MediaImageOptions, loader: MediaLoader = mediaLoader()): MediaImageAttributes {
  const displayWidth = options.displayWidth ?? 720;
  const loaded = loader({ media: options.media, displayWidth });
  const src = browserMediaUrl(loaded.src);
  const srcSet = loaded.srcSet?.split(", ").map((entry) => browserMediaUrl(entry)).join(", ");
  const variant = loaded.variant;
  const w = options.media.width ?? undefined;
  const h = options.media.height ?? undefined;
  let width: number | undefined;
  let height: number | undefined;
  if (w && h && w > 0 && h > 0) {
    if (options.aspect) {
      width = w;
      height = Math.round(w / aspectRatio(options.aspect));
    } else {
      width = w;
      height = h;
    }
  } else if (options.aspect) {
    width = NOMINAL_WIDTH;
    height = Math.round(NOMINAL_WIDTH / aspectRatio(options.aspect));
  }
  const attrs: MediaImageAttributes = {
    src,
    alt: options.alt,
    loading: options.priority || options.eager ? "eager" : "lazy",
    decoding: options.priority ? "auto" : "async",
    "data-neton-media": options.media.fileId,
  };
  if (srcSet) {
    attrs.srcSet = srcSet;
    attrs.sizes = options.sizes ?? `(max-width: ${displayWidth}px) 100vw, ${displayWidth}px`;
  }
  if (width !== undefined && height !== undefined) {
    attrs.width = width;
    attrs.height = height;
  }
  if (options.priority) attrs.fetchPriority = "high";
  if (options.className) attrs.className = options.className;
  if (options.aspect) attrs.style = { aspectRatio: String(aspectRatio(options.aspect)), objectFit: "cover" };
  if (variant) attrs["data-neton-variant"] = variant;
  return attrs;
}

/** 分享卡片 / JSON-LD 用的图片地址：有 `og` 规格用它，否则原图。 */
export function shareImageUrl(media: PublicMedia): { url: string; width?: number; height?: number } {
  const og = media.variants?.[OG_VARIANT];
  if (og) return { url: browserMediaUrl(og), ...OG_SIZE };
  return { url: browserMediaUrl(media.url), width: media.width ?? undefined, height: media.height ?? undefined };
}

/** 兜底刷新接口（infra-media §7.3）：经底座的匿名代理 `/api/backend` 访问。 */
export const MEDIA_REFRESH_ENDPOINT = `${BACKEND_PROXY_PREFIX}/app/infra/media/url/`;

/**
 * 长开标签页的图片兜底（infra-media §7.3）：页面缓存比签名短，但标签页可以开很久——签名过期后图片 403。
 * 一段不依赖 React 的内联脚本（公开外框在 `<body>` 开头输出一次，早于任何图片）：在捕获阶段监听
 * `error`，对带 `data-neton-media` 的图片调一次刷新接口（同一张图只重试一次），换上当前桶的新地址。
 * `srcset` 一并去掉：刷新接口只给一档地址，浏览器不能再按旧的 srcset 选到过期的地址。
 */
export const MEDIA_REFRESH_SCRIPT =
  `(function(){var E=${JSON.stringify(MEDIA_REFRESH_ENDPOINT)};document.addEventListener("error",function(e){` +
  `var i=e.target;if(!i||i.tagName!=="IMG")return;var id=i.getAttribute("data-neton-media");` +
  `if(!id||i.hasAttribute("data-neton-retried"))return;i.setAttribute("data-neton-retried","");` +
  `var v=i.getAttribute("data-neton-variant");` +
  `fetch(E+encodeURIComponent(id)+(v?"?variant="+encodeURIComponent(v):""),{credentials:"same-origin",headers:{Accept:"application/json"}})` +
  `.then(function(r){return r.ok?r.json():null}).then(function(b){var u=b&&b.code===0&&b.data&&b.data.url;` +
  `if(typeof u!=="string"||!u)return;if(u.indexOf("/app/")===0)u=${JSON.stringify(BACKEND_PROXY_PREFIX)}+u;i.removeAttribute("srcset");i.removeAttribute("sizes");i.src=u})` +
  `.catch(function(){})},true)})()`;
