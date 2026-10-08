import type { Metadata } from "next";
import "./globals.css";
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
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('neton-client-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <SiteBrandProvider brand={brand}>{children}</SiteBrandProvider>
      </body>
    </html>
  );
}
