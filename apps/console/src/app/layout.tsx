import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteBrandProvider } from "@/components/site-brand";
import { getSiteBrand } from "@/lib/site-brand";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteBrand();
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `${name} console`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getSiteBrand();
  // lang 先给默认语言，I18nProvider 挂载后按用户选择更新。
  const defaultLocale = process.env.NEXT_PUBLIC_NETON_DEFAULT_LOCALE?.trim() || "zh-CN";
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('neton-client-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <Providers>
          <SiteBrandProvider brand={brand}>{children}</SiteBrandProvider>
        </Providers>
      </body>
    </html>
  );
}
