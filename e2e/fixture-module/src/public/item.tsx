import { definePublicRoute, jsonLd, MediaImage, objTag, shareImageUrl } from "@neton/application-client-runtime/public";
import { ITEM, loadItem, type FixtureItem } from "../data";
import { Byline } from "../views/byline";

/** `/item/:id`：对象页。状态按后端机器码映射；`redirectTo` → 308；标签 `obj:fixture.item:{id}`。 */
export default definePublicRoute<FixtureItem>({
  async load(ctx) {
    const id = ctx.params.id!;
    const tags = [objTag(ITEM, id)];
    const result = await loadItem(ctx.backend, id);
    if (result.kind !== "ok") return { kind: result.kind, tags };
    if (result.item.redirectTo) return { kind: "redirect", to: result.item.redirectTo, permanent: true };
    return { kind: "ok", data: result.item, tags };
  },
  seo(item, ctx) {
    const url = `${ctx.site.origin}/item/${item.id}`;
    const image = item.cover ? shareImageUrl(item.cover) : undefined;
    return {
      title: item.title,
      description: item.summary,
      keywords: ["fixture"],
      openGraph: { type: "article", images: image ? [image] : undefined, article: { publishedTime: item.publishedAt, modifiedTime: item.updatedAt ?? undefined } },
      jsonLd: [
        jsonLd.article({ headline: item.title, url, datePublished: item.publishedAt, dateModified: item.updatedAt ?? undefined, images: image ? [image.url] : undefined, author: item.author ? { name: item.author } : undefined, publisher: { name: ctx.site.name } }),
        jsonLd.breadcrumb([{ name: ctx.site.name, url: `${ctx.site.origin}/` }, { name: item.title, url }]),
      ],
    };
  },
  Page({ data: item }) {
    return (
      <article data-testid="item">
        <h1>{item.title}</h1>
        <Byline text={item.title} />
        {item.cover && <MediaImage media={item.cover} alt={item.title} priority displayWidth={720} />}
        <p data-testid="body">{item.body}</p>
      </article>
    );
  },
});
