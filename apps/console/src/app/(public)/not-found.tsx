import type { Metadata } from "next";
import { StatusPage, statusTitle } from "@/site/status-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await statusTitle("notFound"), robots: { index: false, follow: true } };
}

/** 公开路由的 404（不存在、参数不合法、暂时下线；public-routes §7）。 */
export default function PublicNotFound() {
  return <StatusPage kind="notFound" />;
}
