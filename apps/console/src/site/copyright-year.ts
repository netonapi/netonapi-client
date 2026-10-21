import { PUBLIC_CACHE_PROFILES } from "@neton/application-client-runtime/public";
import { cacheLife } from "next/cache";

/**
 * 版权年份。缓存的页面不能在渲染时读当前时间（每次渲染结果不同，整页缓存就不成立），
 * 所以年份本身是一个缓存单元：static 档，跨年后最多几分钟刷新。
 */
export async function copyrightYear(): Promise<number> {
  "use cache";
  cacheLife(PUBLIC_CACHE_PROFILES.static);
  return new Date().getFullYear();
}
