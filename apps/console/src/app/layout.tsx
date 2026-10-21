import type { Metadata, Viewport } from "next";
import { site } from "@/generated/site.generated";
import { getSiteBrand } from "@/lib/site-brand";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteBrand();
  return {
    metadataBase: new URL(site.origin),
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/**
 * 根布局不导入样式表：门户（PublicFrame → src/site/public.css）与控制台 / 登录注册页
 * （src/styles/console.css）各自加载自己的那一份，门户页面不下载控制台的样式。
 * 根布局只放与身份无关的东西：控制台、登录注册页与门户各自在路由组布局里挂自己的 Provider
 * （门户的语言由服务端决定、不读本地偏好，见 (public)/layout.tsx）。
 * 根布局不读请求、不读会话：公开页面整页缓存的前提。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={site.locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('neton-client-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
