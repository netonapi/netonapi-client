import { connection } from "next/server";
import { goneStore } from "@neton/application-client-runtime/public-server";
import { site } from "@/generated/site.generated";
import { sitemapFileResponse } from "@/site/feeds";

/**
 * sitemap 分片 `/sitemaps/{贡献 id}.{分片 id}.xml`、news sitemap `/sitemaps/news.xml`，以及可选的
 * 死链文件 `/sitemaps/gone.txt`（站点配置 robots.deadLinkFile，§11.5：已删除集合的纯文本列表）。
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (file === "gone.txt") {
    if (!site.robots.deadLinkFile) return new Response("Not found", { status: 404 });
    await connection(); // 已删除集合是进程内状态，逐请求读取
    const paths = await goneStore().list();
    return new Response(paths.map((p) => `${site.origin}${p}`).join("\n") + (paths.length ? "\n" : ""), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=300" },
    });
  }
  return sitemapFileResponse(file);
}
