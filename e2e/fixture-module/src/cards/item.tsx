import { MediaImage, type CardRendererProps, type PublicMedia } from "@neton/application-client-runtime/public";

interface ItemView { id: string; title: string; cover?: PublicMedia | null }

/** `fixture.item` 的卡片：标题链接 + 缩略图（3:2 占位；首屏前几张不懒加载，第一张可能是页面的 LCP 图）。 */
export default function ItemCard({ card, eager, priority }: CardRendererProps) {
  const view = card.view as ItemView;
  return (
    <article data-testid="card" data-id={view.id}>
      {view.cover && <MediaImage media={view.cover} alt="" aspect="3:2" displayWidth={180} eager={eager} priority={priority} />}
      <h2><a href={`/item/${view.id}`}>{view.title}</a></h2>
    </article>
  );
}
