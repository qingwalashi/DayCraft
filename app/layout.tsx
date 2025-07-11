import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RootLayoutClient from "./layout-client";
import { Toaster } from "sonner";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#35155D" }],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "DayCraft - 智能日报助手",
  description: "简化日报和周报创建过程的专业工具",
  generator: "Next.js",
  manifest: "/manifest.webmanifest",
  keywords: ["日报", "周报", "工作报告", "效率工具", "PWA"],
  authors: [
    {
      name: "DayCraft团队",
    },
  ],
  icons: [
    { rel: "apple-touch-icon", url: "/icons/apple-icon-180x180.png" },
    { rel: "icon", url: "/icons/icon-192x192.png" },
    { rel: "shortcut icon", url: "/favicon.ico" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-theme="light" className="light">
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="application-name" content="DayCraft" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DayCraft" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#35155D" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className={`${inter.className} bg-white text-black`}>
        <RootLayoutClient>
          {children}
          <Toaster position="top-right" />
        </RootLayoutClient>
      </body>
    </html>
  );
} 