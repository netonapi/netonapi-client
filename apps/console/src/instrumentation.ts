/**
 * 服务启动钩子：
 * - 媒体地址策略的交叉校验（infra-media §7.3）：读后端 `/app/infra/media/policy`，与站点配置的签名有效期
 *   对账，不一致记错误日志并以较短者为准（会渲染媒体的缓存档位随之收紧）；
 * - 配置了站点发布密钥时，启动已删除 URL 集合的同步（public-routes §7.2）。
 *   没配密钥就没有 410（退化为 404）与失效投递，功能正确，只是更新慢。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { revalidateSecret, startGoneSync, startMediaPolicyCheck } = await import("@neton/application-client-runtime/public-server");
  const { site } = await import("@/generated/site.generated");
  const { proxyConfig } = await import("@/generated/public-proxy.generated");
  if (!proxyConfig.routes.length) return;
  startMediaPolicyCheck({ siteValidity: site.media.signedUrlValiditySeconds });
  const secret = revalidateSecret();
  if (!secret) {
    console.info("[site] site.revalidate.disabled: NETON_SITE_REVALIDATE_SECRET is not set (or shorter than 32 bytes)");
    return;
  }
  if (!proxyConfig.routes.some((r) => r.goneAware)) return;
  startGoneSync({ secret });
}
