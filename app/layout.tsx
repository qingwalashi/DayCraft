import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import RootLayoutClient from "./layout-client";
import { Toaster } from "sonner";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "DayCraft - 智能日报助手",
  description: "简化日报和周报创建过程的专业工具",
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