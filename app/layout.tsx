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
  title: "DayCraft - 专业工作管理平台",
  description: "集项目管理、日报撰写、进度跟踪于一体的现代化工作平台，让您的工作更有条理，汇报更加专业",
  generator: "Next.js",
  manifest: "/manifest.webmanifest",
  keywords: ["项目管理", "日报", "周报", "工作分解", "进度跟踪", "工作报告", "效率工具", "PWA"],
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