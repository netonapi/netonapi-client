import { connection } from "next/server";

/**
 * IndexNow 密钥文件（public-routes §11.4）：环境变量 NETON_SITE_INDEXNOW_KEY 有值时输出密钥本身，
 * 否则 404。运行期读取（同一份构建可以在不同部署里换密钥）。
 */
export async function GET() {
  await connection();
  const key = process.env.NETON_SITE_INDEXNOW_KEY?.trim();
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=300" } });
}
