import type { Metadata } from "next";
import { site } from "@/generated/site.generated";
import { PublicFrame } from "@/site/public-frame";
import { StatusPage, statusTitle } from "@/site/status-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await statusTitle("notFound"), robots: { index: false, follow: true } };
}

/**
 * 没有任何路由匹配的地址。有门户的产品（consoleBasePath ≠ "/"）在门户外壳里显示；只有控制台的产品
 * 显示不带外壳的状态页。
 */
export default function NotFound() {
  if (!site.consoleBasePath) return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><StatusPage kind="notFound" /></main>;
  return <PublicFrame><StatusPage kind="notFound" /></PublicFrame>;
}
