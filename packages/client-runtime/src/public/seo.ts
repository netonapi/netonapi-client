/**
 * 公开页面的 SEO 元数据（public-routes §6）：模块给出 [PublicSeo]，底座负责规则——canonical 一律拼站点
 * origin（从不取请求的 Host）、robots 只能收紧不能放宽、描述按字素截断、OG / Twitter 同时生成、
 * JSON-LD 安全序列化。模块不手拼 `<meta>`，也不手拼 schema.org 对象。
 */
import type { Metadata } from "next";

export interface PublicSeoImage { url: string; width?: number; height?: number; alt?: string }

export interface PublicSeo {
  /** 页面自身标题；站点模板「%s · 站点名」由底座套。 */
  title: string;
  /** 首页等不套模板。 */
  titleAbsolute?: boolean;
  /** 截到 160 个字素，换行与连续空白压成一个空格。 */
  description?: string;
  keywords?: string[];
  /** 路径或绝对地址；缺省 = 当前路径 + 白名单内的查询参数（带游标的列表页指向自己）。 */
  canonical?: string;
  robots?: { index?: boolean; follow?: boolean; maxImagePreview?: "large" | "standard" | "none" };
  openGraph?: {
    type: "website" | "article" | "profile";
    images?: PublicSeoImage[];
    article?: { publishedTime?: string; modifiedTime?: string; section?: string; tags?: string[]; authors?: string[] };
  };
  /** schema.org 对象，每个输出为一个 `<script type="application/ld+json">`；用下面的构造器生成。 */
  jsonLd?: object[];
  pagination?: { prev?: string; next?: string };
  alternates?: { languages?: Record<string, string>; feeds?: { title: string; href: string }[] };
}

export interface SeoContext {
  /** 站点 origin（站点配置，已规范化，无尾斜杠） */
  origin: string;
  siteName: string;
  /** BCP 47，如 zh-CN */
  locale: string;
  /** 当前页面的规范路径（不含查询） */
  path: string;
  /** 白名单内、已规范化的查询串（`a=1&b=2`），无则空串 */
  query: string;
  /** 路由 manifest 的 indexable */
  indexable: boolean;
  verification?: { google?: string; baidu?: string; bing?: string };
  /** 站点 feed（有则在所有公开页输出发现链接） */
  siteFeed?: { title: string; href: string };
}

export const DESCRIPTION_MAX = 160;

/** 按字素截断（不会把一个汉字、emoji 或组合字符切成两半），超出时末尾加「…」。 */
export function truncateGraphemes(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(clean)].map((s) => s.segment);
  if (graphemes.length <= max) return clean;
  return `${graphemes.slice(0, max - 1).join("").trimEnd()}…`;
}

/** 站内路径或绝对地址 → 绝对地址；相对路径一律拼站点 origin。 */
export function absoluteUrl(origin: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/")) throw new Error(`[seo] expected a site path or absolute URL: ${pathOrUrl}`);
  return `${origin}${pathOrUrl}`;
}

/**
 * canonical：
 * - 缺省：当前路径 + 白名单查询；
 * - 相对路径：拼 origin，**去掉查询参数**（规范地址不该带模块随手拼的参数）；
 * - 绝对地址：与站点同源时规范成本站地址；异站（编辑指定的外站规范链接，如转载指向原文）原样保留。
 */
export function resolveCanonical(canonical: string | undefined, ctx: Pick<SeoContext, "origin" | "path" | "query">): string {
  if (!canonical) return `${ctx.origin}${ctx.path}${ctx.query ? `?${ctx.query}` : ""}`;
  if (/^https?:\/\//i.test(canonical)) {
    const url = new URL(canonical);
    if (url.origin === ctx.origin) return `${ctx.origin}${url.pathname}${url.search}`;
    return url.toString();
  }
  return `${ctx.origin}${canonical.split(/[?#]/, 1)[0]}`;
}

/** robots：页面值与路由 indexable 取更严的一方。 */
export function resolveRobots(robots: PublicSeo["robots"], indexable: boolean) {
  const index = indexable && robots?.index !== false;
  const follow = robots?.follow !== false;
  return { index, follow, maxImagePreview: robots?.maxImagePreview ?? "large" as const };
}

function ogLocale(locale: string): string {
  return locale.replace("-", "_");
}

/** [PublicSeo] → Next 的 Metadata。 */
export function toNextMetadata(seo: PublicSeo, ctx: SeoContext): Metadata {
  const canonical = resolveCanonical(seo.canonical, ctx);
  const robots = resolveRobots(seo.robots, ctx.indexable);
  const images = (seo.openGraph?.images ?? []).map((img) => ({ ...img, url: absoluteUrl(ctx.origin, img.url) }));
  const description = seo.description ? truncateGraphemes(seo.description, DESCRIPTION_MAX) : undefined;
  const feeds = [...(ctx.siteFeed ? [ctx.siteFeed] : []), ...(seo.alternates?.feeds ?? [])];
  const verificationOther: Record<string, string> = {};
  if (ctx.verification?.baidu) verificationOther["baidu-site-verification"] = ctx.verification.baidu;
  if (ctx.verification?.bing) verificationOther["msvalidate.01"] = ctx.verification.bing;
  const article = seo.openGraph?.type === "article" ? seo.openGraph.article : undefined;

  const metadata: Metadata = {
    title: seo.titleAbsolute ? { absolute: seo.title } : seo.title,
    description,
    keywords: seo.keywords?.length ? seo.keywords : undefined,
    robots: {
      index: robots.index,
      follow: robots.follow,
      ...(robots.index ? { "max-image-preview": robots.maxImagePreview } : {}),
    },
    alternates: {
      canonical,
      languages: seo.alternates?.languages
        ? Object.fromEntries(Object.entries(seo.alternates.languages).map(([lang, href]) => [lang, absoluteUrl(ctx.origin, href)]))
        : undefined,
      types: feeds.length
        ? { "application/rss+xml": feeds.map((f) => ({ url: absoluteUrl(ctx.origin, f.href), title: f.title })) }
        : undefined,
    },
    openGraph: {
      type: seo.openGraph?.type ?? "website",
      url: canonical,
      title: seo.title,
      description,
      siteName: ctx.siteName,
      locale: ogLocale(ctx.locale),
      images: images.length ? images : undefined,
      ...(article
        ? {
          publishedTime: article.publishedTime,
          modifiedTime: article.modifiedTime,
          section: article.section,
          tags: article.tags,
          authors: article.authors,
        }
        : {}),
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: seo.title,
      description,
      images: images.length ? images.map((i) => i.url) : undefined,
    },
  };
  if (ctx.verification?.google || Object.keys(verificationOther).length) {
    metadata.verification = { google: ctx.verification?.google || undefined, other: Object.keys(verificationOther).length ? verificationOther : undefined };
  }
  return metadata;
}

/** 状态页（404 / 410 / 暂时下线）的元数据：恒为 noindex。 */
export function statusMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true } };
}

/**
 * JSON-LD 的安全序列化：`<`、`>`、`&` 与行分隔符转义，保证内容里出现 `</script>` 也闭合不了脚本标签。
 * 结果直接作为 `<script type="application/ld+json">` 的内容。
 */
export function serializeJsonLd(value: object): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ---------------------------------------------------------------------------
// schema.org 构造器：字段规则写在这里，模块不手拼

type Thing = Record<string, unknown>;

function compact<T extends Thing>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))) as T;
}

export const HEADLINE_MAX = 110;

export const jsonLd = {
  organization(input: { name: string; url: string; logo?: string }): Thing {
    return compact({ "@context": "https://schema.org", "@type": "Organization", name: input.name, url: input.url, logo: input.logo });
  },

  /** 站点：有搜索路由时带站内搜索（`searchUrl` 含 `{search_term_string}` 占位）。 */
  webSite(input: { name: string; url: string; inLanguage: string; searchUrl?: string }): Thing {
    return compact({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: input.name,
      url: input.url,
      inLanguage: input.inLanguage,
      potentialAction: input.searchUrl
        ? { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: input.searchUrl }, "query-input": "required name=search_term_string" }
        : undefined,
    });
  },

  breadcrumb(items: { name: string; url: string }[]): Thing {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
    };
  },

  itemList(urls: string[]): Thing {
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: urls.map((url, i) => ({ "@type": "ListItem", position: i + 1, url })),
    };
  },

  collectionPage(input: { name: string; url: string; description?: string }): Thing {
    return compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: input.name, url: input.url, description: input.description });
  },

  webPage(input: { name: string; url: string; description?: string }): Thing {
    return compact({ "@context": "https://schema.org", "@type": "WebPage", name: input.name, url: input.url, description: input.description });
  },

  person(input: { name: string; url?: string; image?: string }): Thing {
    return compact({ "@context": "https://schema.org", "@type": "Person", name: input.name, url: input.url, image: input.image });
  },

  /**
   * 新闻 / 文章（client-content §4.1 的 NewsArticle 字段表）。`headline` 按字素截到 110；`mainEntityOfPage` = canonical；
   * `isBasedOn` 署名转载 / 综合的来源；`isAccessibleForFree: false` 标会员可见内容。`headline` 超过 110 字符截断；`dateModified` 只在给出「线上版本更新时间」时输出——
   * 不用行的 updatedAt 冒充（计数回写也会改它）。
   */
  article(input: {
    type?: "NewsArticle" | "Article" | "BlogPosting";
    headline: string;
    url: string;
    datePublished: string;
    dateModified?: string;
    /** 封面与正文图片（地址，或带宽高的 ImageObject）；Google 建议 16:9、4:3、1:1 各一张 */
    images?: (string | { url: string; width?: number; height?: number })[];
    description?: string;
    author?: { name: string; url?: string };
    publisher: { name: string; logo?: string };
    section?: string;
    keywords?: string[];
    commentCount?: number;
    isAccessibleForFree?: boolean;
    basedOn?: { url: string; publisherName?: string };
  }): Thing {
    return compact({
      "@context": "https://schema.org",
      "@type": input.type ?? "NewsArticle",
      headline: truncateGraphemes(input.headline, HEADLINE_MAX),
      mainEntityOfPage: input.url,
      datePublished: input.datePublished,
      dateModified: input.dateModified,
      description: input.description ? truncateGraphemes(input.description, DESCRIPTION_MAX) : undefined,
      image: input.images?.map((img) => (typeof img === "string" ? img : compact({ "@type": "ImageObject", url: img.url, width: img.width, height: img.height }))),
      author: input.author ? compact({ "@type": "Person", name: input.author.name, url: input.author.url }) : undefined,
      publisher: compact({
        "@type": "Organization",
        name: input.publisher.name,
        logo: input.publisher.logo ? { "@type": "ImageObject", url: input.publisher.logo } : undefined,
      }),
      articleSection: input.section,
      keywords: input.keywords?.length ? input.keywords.join(",") : undefined,
      commentCount: input.commentCount,
      isAccessibleForFree: input.isAccessibleForFree,
      isBasedOn: input.basedOn
        ? compact({ "@type": "CreativeWork", url: input.basedOn.url, publisher: input.basedOn.publisherName ? { "@type": "Organization", name: input.basedOn.publisherName } : undefined })
        : undefined,
    });
  },
};
