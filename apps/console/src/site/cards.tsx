import type { CardRenderOptions, CardRendererProps, PublicSeoContext } from "@neton/application-client-runtime/public";
import { objectRefKey, type PublicCard } from "@neton/application-client-runtime/public";
import { cardRegistry } from "@/generated/public.generated";
import { serverI18n } from "./server-i18n";

/**
 * 卡片分发（public-routes §10.3）：按 `ref.type` 选模块注册的渲染器，没有渲染器的类型用通用卡片。
 * 渲染器是服务端组件，入参 [CardRendererProps]：`eager` = 首屏前几张，图片不懒加载；`priority` = 页面的 LCP 图
 * （只有 `priorityFirst` 时的第一张，一页至多一张）。
 */
export function renderCards(cards: readonly PublicCard[], options: CardRenderOptions | undefined, ctx: PublicSeoContext) {
  const eagerCount = options?.eagerImages ?? 3;
  const priorityFirst = options?.priorityFirst ?? false;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {cards.map((card, index) => {
        const Renderer = cardRegistry[card.ref.type] ?? ObjectSummaryCard;
        return (
          <li key={objectRefKey(card.ref)}>
            <Renderer card={card} style={options?.styles?.[card.ref.type] ?? "auto"} eager={index < eagerCount || (priorityFirst && index === 0)} priority={priorityFirst && index === 0} ctx={ctx} />
          </li>
        );
      })}
    </ul>
  );
}

/** 对象的站内地址：`link.web` 与站点同源时取路径（站内跳转），异站原样保留；没有链接返回 null。 */
export function cardHref(card: PublicCard, origin: string): { href: string; external: boolean } | null {
  const web = card.summary?.link?.web;
  if (!web) return null;
  try {
    const url = new URL(web, origin);
    return url.origin === origin ? { href: `${url.pathname}${url.search}${url.hash}`, external: false } : { href: url.toString(), external: true };
  } catch {
    return null;
  }
}

/** 通用卡片：只用 ObjectSummary（标题、摘要、链接），任何对象类型都能显示。 */
export async function ObjectSummaryCard({ card, ctx }: Pick<CardRendererProps, "card" | "ctx"> & Partial<CardRendererProps>) {
  const target = cardHref(card, ctx.site.origin);
  const t = await serverI18n.getServerT("site", ctx.locale);
  const title = card.summary?.title?.trim() || t("card.untitled");
  return (
    <article className="py-3">
      <h3 className="text-[15px] font-medium leading-6 text-[var(--foreground)]">
        {target
          ? <a href={target.href} className="hover:text-[var(--primary)]" {...(target.external ? { rel: "noopener nofollow", target: "_blank" } : {})}>{title}</a>
          : title}
      </h3>
      {card.summary?.summary && <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">{card.summary.summary}</p>}
    </article>
  );
}
