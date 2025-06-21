'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isInitialized: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isInitialized: false,
  signOut: async () => {},
  refreshSession: async () => { return null; },
});

// 节流函数，限制函数调用频率
const throttle = (fn: Function, delay: number) => {
  let lastCall = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn(...args);
    }
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  
  // 使用ref存储上次刷新时间，避免重复刷新
  const lastRefreshTime = useRef<number>(0);
  // 最小刷新间隔（毫秒）
  const MIN_REFRESH_INTERVAL = 60000; // 1分钟
  
  // 使用useCallback确保函数引用稳定
  const refreshSession = useCallback(async () => {
    const now = Date.now();
    // 如果距离上次刷新时间不足最小间隔，且已有会话，则直接返回当前会话
    if (now - lastRefreshTime.current < MIN_REFRESH_INTERVAL && session) {
      return session;
    }
    
    try {
      lastRefreshTime.current = now;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      // 只有当会话真正发生变化时才更新状态
      if (JSON.stringify(currentSession) !== JSON.stringify(session)) {
        setSession(currentSession);
        setUser(currentSession?.user || null);
      }
      
      return currentSession;
    } catch (error) {
      console.error('刷新会话时出错:', error);
      return session; // 出错时返回当前会话，避免状态丢失
    } finally {
      setLoading(false);
    }
  }, [session, supabase.auth]);

  // 节流版本的refreshSession
  const throttledRefreshSession = useCallback(
    throttle(refreshSession, MIN_REFRESH_INTERVAL),
    [refreshSession]
  );

  useEffect(() => {
    let authListener: { subscription: { unsubscribe: () => void } } | null = null;
    
    const initializeAuth = async () => {
      try {
        // 首次加载时获取会话
        await refreshSession();
        setIsInitialized(true);
        
        // 监听认证状态变化
        const { data: listener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          console.log('Auth state changed:', event);
          
          // 只有当会话真正发生变化时才更新状态
          if (JSON.stringify(currentSession) !== JSON.stringify(session)) {
            setSession(currentSession);
            setUser(currentSession?.user || null);
          }
          
          setLoading(false);
          
          // 认证状态变化时的重定向逻辑
          if (event === 'SIGNED_IN') {
            // 如果用户在登录相关页面，登录后直接跳转到仪表盘
            if (pathname?.startsWith('/login') || pathname?.startsWith('/signup') || 
                pathname?.startsWith('/forgot-password') || pathname?.startsWith('/reset-password')) {
              router.push('/dashboard/overview');
            } else {
              router.refresh(); // 仅刷新当前页面
            }
          }
          
          if (event === 'SIGNED_OUT') {
            router.push('/login');
          }
        });
        
        authListener = listener;
      } catch (error) {
        console.error('初始化认证时出错:', error);
        setLoading(false);
        setIsInitialized(true);
      }
    };

    initializeAuth();

    return () => {
      // 确保在组件卸载时取消订阅
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [router, supabase.auth, pathname, refreshSession, session]);

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      // 手动清除状态，避免依赖onAuthStateChange
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('退出登录时出错:', error);
    } finally {
      setLoading(false);
      router.push('/login');
    }
  };

  const value = {
    user,
    session,
    loading,
    isInitialized,
    signOut,
    refreshSession: throttledRefreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext); 