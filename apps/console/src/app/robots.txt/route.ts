import { cacheControlFor, robotsTxt } from "@neton/application-client-runtime/public";
import { robotsDisallowPaths } from "@/generated/public.generated";
import { site } from "@/generated/site.generated";

/** robots.txt（public-routes §11.1）：构建期常量，预渲染为静态文件。 */
export function GET() {
  return new Response(robotsTxt({ origin: site.origin, disallow: robotsDisallowPaths }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cacheControlFor("static") },
  });
}
