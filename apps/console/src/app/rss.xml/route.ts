import { connection } from "next/server";
import { siteFeedResponse } from "@/site/feeds";

/**
 * 站点 feed（public-routes §11.3）：没有站点 feed 贡献时 404。按请求生成（内容是 `"use cache"` 单元），
 * 构建期不预渲染、不连后端（§1a）。
 */
export async function GET() {
  await connection();
  return siteFeedResponse();
}
