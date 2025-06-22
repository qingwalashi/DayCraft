'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// 创建一个单例客户端实例，避免多次创建
let supabaseClient: ReturnType<typeof createClientComponentClient> | null = null;

export const createClient = () => {
  if (supabaseClient) {
    return supabaseClient;
  }

  // 获取当前环境的站点URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  // 创建客户端
  supabaseClient = createClientComponentClient();
  
  // 设置身份验证重定向URL
  // 注意：这里我们不能直接在创建客户端时设置auth.redirectTo选项，因为类型定义不支持
  // 但我们可以在使用signUp或signIn方法时指定redirectTo

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
  role: 'admin' | 'user';
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
  created_at: string;
  updated_at: string;
}; 