import { connection } from "next/server";
import { sitemapUrlsetXml } from "@neton/application-client-runtime/public";
import { goneStore } from "@neton/application-client-runtime/public-server";
import { site } from "@/generated/site.generated";
import { sitemapFileResponse } from "@/site/feeds";

/**
 * sitemap 分片 `/sitemaps/{贡献 id}.{分片 id}.xml`、news sitemap `/sitemaps/news.xml`，以及可选的
 * 死链文件（站点配置 robots.deadLinkFile，§11.5）：已删除集合的纯文本列表 `/sitemaps/gone.txt` 与同一内容的
 * sitemap 格式 `/sitemaps/gone.xml`（百度资源平台的死链提交两种都收；Search Console 可单独提交它加快 410 的重抓）。
 * 两者都**不**列进 `/sitemap.xml` 索引：索引只放应当收录的地址。
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (file === "gone.txt" || file === "gone.xml") {
    if (!site.robots.deadLinkFile) return new Response("Not found", { status: 404 });
    await connection(); // 已删除集合是进程内状态，逐请求读取
    const urls = (await goneStore().list()).map((p) => `${site.origin}${p}`);
    if (file === "gone.xml") {
      const { xml, truncated } = sitemapUrlsetXml(urls.map((loc) => ({ loc })));
      if (truncated) console.error("[site] site.sitemap.truncated", { file, urls: urls.length });
      return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=300" } });
    }
    return new Response(urls.join("\n") + (urls.length ? "\n" : ""), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=300" },
    });
  }
  return sitemapFileResponse(file);
}
