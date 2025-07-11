'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// 创建一个单例客户端实例，避免多次创建
let supabaseClient: ReturnType<typeof createClientComponentClient> | null = null;
// 添加请求计数和时间窗口追踪
const requestCounts: {[key: string]: number} = {};
const REQUEST_LIMIT = 10; // 降低每个时间窗口的最大请求数
const TIME_WINDOW = 10000; // 时间窗口大小（毫秒）

// 添加会话缓存
const sessionCache = {
  data: null as any,
  timestamp: 0,
  expiresIn: 60000, // 缓存有效期1分钟
};

// 添加用户信息缓存
const userCache = {
  data: null as any,
  timestamp: 0,
  expiresIn: 60000, // 缓存有效期1分钟
};

// 限制请求频率的装饰器函数
const limitRequests = async (key: string, operation: () => Promise<any>, useCache = false, cache: any = null) => {
  const now = Date.now();
  
  // 如果启用缓存且缓存有效，直接返回缓存数据
  if (useCache && cache && cache.data && (now - cache.timestamp < cache.expiresIn)) {
    return cache.data;
  }
  
  const windowKey = `${key}_${Math.floor(now / TIME_WINDOW)}`;
  
  // 初始化或重置过期的计数器
  Object.keys(requestCounts).forEach(k => {
    if (!k.startsWith(`${key}_`) || parseInt(k.split('_')[1]) < Math.floor(now / TIME_WINDOW) - 1) {
      delete requestCounts[k];
    }
  });
  
  // 检查当前窗口的请求数
  requestCounts[windowKey] = (requestCounts[windowKey] || 0) + 1;
  
  if (requestCounts[windowKey] > REQUEST_LIMIT) {
    console.warn(`请求频率过高: ${key}, 当前窗口请求数: ${requestCounts[windowKey]}`);
    // 对于超过限制的请求，添加指数退避延迟
    const delay = Math.min(200 * Math.pow(1.5, requestCounts[windowKey] - REQUEST_LIMIT), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  const result = await operation();
  
  // 如果启用缓存，更新缓存
  if (useCache && cache && result) {
    cache.data = result;
    cache.timestamp = Date.now();
  }
  
  return result;
};

export const createClient = () => {
  if (supabaseClient) {
    return supabaseClient;
  }

  // 获取当前环境的站点URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  try {
    // 创建客户端
    supabaseClient = createClientComponentClient({
      options: {
        // 添加请求超时设置
        global: {
          fetch: (url, options) => {
            return fetch(url, {
              ...options,
              // 设置较长的超时时间
              signal: options?.signal || (AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined),
            });
          },
        },
        // 这些选项在客户端组件中不可用，移除它们
        // autoRefreshToken: true,
        // persistSession: true,
        // detectSessionInUrl: true,
      },
    });
    
    // 增强原始方法，添加请求限制和缓存
    const originalAuthGetSession = supabaseClient.auth.getSession.bind(supabaseClient.auth);
    supabaseClient.auth.getSession = async function() {
      return limitRequests('auth_getSession', () => originalAuthGetSession(), true, sessionCache);
    };
    
    const originalAuthGetUser = supabaseClient.auth.getUser.bind(supabaseClient.auth);
    supabaseClient.auth.getUser = async function() {
      return limitRequests('auth_getUser', () => originalAuthGetUser(), true, userCache);
    };
    
    // 为所有认证相关操作添加请求限制
    const originalSignIn = supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth);
    supabaseClient.auth.signInWithPassword = async function(credentials) {
      // 登录后清除缓存
      sessionCache.data = null;
      userCache.data = null;
      return limitRequests('auth_signIn', () => originalSignIn(credentials));
    };

    // 添加登出时清除缓存
    const originalSignOut = supabaseClient.auth.signOut.bind(supabaseClient.auth);
    supabaseClient.auth.signOut = async function() {
      // 登出后清除缓存
      sessionCache.data = null;
      userCache.data = null;
      return limitRequests('auth_signOut', () => originalSignOut());
    };
    
    console.log('Supabase 客户端已初始化');
  } catch (error) {
    console.error('创建 Supabase 客户端失败:', error);
    throw error;
  }
  
  return supabaseClient;
};

// 定义通用类型
export type Tenant = {
  id: string;
  name: string;
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

export type DailyReport = {
  id: string;
  user_id: string;
  date: string;
  created_at: string;
  updated_at: string;
};

export type ReportItem = {
  id: string;
  report_id: string;
  project_id: string;
  content: string;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: string[];
};

// 周报类型
export type WeeklyReport = {
  id: string;
  user_id: string;
  year: number;
  week_number: number;
  start_date: string;
  end_date: string;
  content: string;
  status: 'generated' | 'draft';
  created_at: string;
  updated_at: string;
};

// 月报类型
export type MonthlyReport = {
  id: string;
  user_id: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  content: string;
  status: 'generated' | 'draft';
  created_at: string;
  updated_at: string;
};

// 用户AI设置类型
export type UserAISettings = {
  id: string;
  user_id: string;
  api_url: string;
  api_key: string | null;
  model_name: string;
  system_prompt: string;
  user_prompt: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  settings_type?: 'system' | 'custom';
  system_ai_remaining_calls?: number;
  system_ai_total_calls_limit?: number;
  system_ai_calls?: number;
  custom_ai_calls?: number;
};

// 用户钉钉设置类型
export type UserDingTalkSettings = {
  id: string;
  user_id: string;
  ios_url_scheme: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}; 

// 工作分解项类型
export type WorkBreakdownItem = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  level: number;
  position: number;
  is_expanded: boolean;
  status: string;
  tags: string | null;
  members: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}; 