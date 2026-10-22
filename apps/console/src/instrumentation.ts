/**
 * 服务启动钩子：
 * - 媒体地址策略（infra-media §7.3）：读后端 `/app/infra/media/policy`，按后端给的签名有效期收紧会渲染媒体的
 *   缓存档位（有效期的唯一来源是后端，站点配置不重复它）；
 * - 配置了站点发布密钥时：向后端发「失效目标就绪」信号（site-module §6.0：重启期间积压的失效投递立即补投，
 *   不等退避），并启动已删除 URL 集合的同步（public-routes §7.2）；同步从失败恢复时再发一次就绪信号。
 *   没配密钥就没有 410（退化为 404）与失效投递，功能正确，只是更新慢。
 * - 热点页面预热（public-routes §8.7）：本进程开始监听后按站点配置 `warmup.paths` 请求一遍，第一个真实访客不等渲染。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { revalidateSecret, signalSiteReady, siteWarmer, startGoneSync, startMediaPolicyCheck } = await import("@neton/application-client-runtime/public-server");
  const { site } = await import("@/generated/site.generated");
  const { proxyConfig } = await import("@/generated/public-proxy.generated");
  if (!proxyConfig.routes.length) return;
  startMediaPolicyCheck();
  void siteWarmer(site.warmup.paths).warmWhenListening();
  const secret = revalidateSecret();
  if (!secret) {
    console.info("[site] site.revalidate.disabled: NETON_SITE_REVALIDATE_SECRET is not set (or shorter than 32 bytes)");
    return;
  }
  signalSiteReady({ secret });
  if (!proxyConfig.routes.some((r) => r.goneAware)) return;
  startGoneSync({ secret, onRecovered: () => signalSiteReady({ secret }) });
}
