"use client";

import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";
import { useEffect } from "react";
import { initPageStateManager } from "@/lib/utils/page-state-manager";

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // 添加页面可见性变化监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 初始化页面状态管理器
      const cleanupPageStateManager = initPageStateManager();
      
      return () => {
        // 清理事件监听器
        cleanupPageStateManager?.();
      };
    }
  }, []);

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
} 