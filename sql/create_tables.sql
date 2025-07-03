-- =====================
-- 用户资料表（支持多角色）
-- =====================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY, -- 用户ID，关联 auth.users
  email TEXT NOT NULL, -- 用户邮箱
  full_name TEXT, -- 用户姓名
  avatar_url TEXT, -- 头像链接
  role TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[] CHECK (role <@ ARRAY['user','admin']::TEXT[] AND array_length(role, 1) >= 1), -- 角色数组，只允许 'user' 或 'admin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 创建时间
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 更新时间
  last_sign_in_at TIMESTAMP WITH TIME ZONE
);

-- =====================
-- 行级安全策略（RLS）
-- =====================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; -- 启用RLS

-- 用户可以查看自己的资料
CREATE POLICY IF NOT EXISTS "用户可以查看自己的资料" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

-- 管理员可以查看所有用户资料
CREATE POLICY IF NOT EXISTS "管理员可查所有用户资料" ON public.user_profiles
  FOR SELECT USING (
    (auth.uid() = id)
    OR ('admin' = ANY (coalesce(auth.jwt() -> 'roles', ARRAY[]::TEXT[])) )
  );

-- 用户可以更新自己的资料
CREATE POLICY IF NOT EXISTS "用户可以更新自己的资料" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 管理员可以更新所有用户资料
CREATE POLICY IF NOT EXISTS "管理员可更新所有用户资料" ON public.user_profiles
  FOR UPDATE USING (
    'admin' = ANY (coalesce(auth.jwt() -> 'roles', ARRAY[]::TEXT[]))
  );

-- =====================
-- JWT claims 同步角色 Hook
-- =====================
-- 该函数会在用户登录/注册时，将 user_profiles.role 字段同步到 JWT 的 roles 字段（数组）
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_roles TEXT[];
  merged_claims JSONB;
BEGIN
  -- 查询用户角色
  SELECT coalesce(u.role, ARRAY['user']) INTO user_roles
  FROM public.user_profiles u
  WHERE u.id = (event->>'user_id')::uuid;

  -- 合并 claims，保留原有 claims 字段并加入 roles
  merged_claims := (event->'claims') || jsonb_build_object('roles', user_roles);

  RETURN jsonb_build_object('claims', merged_claims);
END;
$$;

-- 授权 authenticator 角色调用该函数
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO authenticator;

-- =====================
-- 触发器：用户注册时自动创建资料
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 创建用户资料
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加触发器，自动为新用户创建资料
CREATE TRIGGER IF NOT EXISTS on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 项目表
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE (code, user_id)
);

-- 日报表
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_plan BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, date)
);

-- 日报条目表
CREATE TABLE public.report_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.daily_reports(id) NOT NULL,
  project_id UUID REFERENCES public.projects(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户可以查看自己的项目
CREATE POLICY "用户可以查看自己的项目" ON public.projects
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的项目" ON public.projects
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的项目" ON public.projects
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的项目" ON public.projects
  FOR DELETE USING (user_id = auth.uid());

-- 用户可以查看自己的日报
CREATE POLICY "用户可以查看自己的日报" ON public.daily_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的日报" ON public.daily_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的日报" ON public.daily_reports
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的日报" ON public.daily_reports
  FOR DELETE USING (user_id = auth.uid());

-- 用户可以查看和编辑自己日报中的条目
CREATE POLICY "用户可以查看自己日报中的条目" ON public.report_items
  FOR SELECT USING (
    report_id IN (
      SELECT id FROM public.daily_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以创建自己日报中的条目" ON public.report_items
  FOR INSERT WITH CHECK (
    report_id IN (
      SELECT id FROM public.daily_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以更新自己日报中的条目" ON public.report_items
  FOR UPDATE USING (
    report_id IN (
      SELECT id FROM public.daily_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以删除自己日报中的条目" ON public.report_items
  FOR DELETE USING (
    report_id IN (
      SELECT id FROM public.daily_reports WHERE user_id = auth.uid()
    )
  );

-- 周报表
CREATE TABLE public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'draft')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, year, week_number)
);

-- 月报表
CREATE TABLE public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'draft')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

-- 为周报和月报启用行级安全策略
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

-- 周报的RLS策略
CREATE POLICY "用户可以查看自己的周报" ON public.weekly_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的周报" ON public.weekly_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的周报" ON public.weekly_reports
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的周报" ON public.weekly_reports
  FOR DELETE USING (user_id = auth.uid());

-- 月报的RLS策略
CREATE POLICY "用户可以查看自己的月报" ON public.monthly_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的月报" ON public.monthly_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的月报" ON public.monthly_reports
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的月报" ON public.monthly_reports
  FOR DELETE USING (user_id = auth.uid());

-- 用户AI设置表
CREATE TABLE public.user_ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  api_url TEXT DEFAULT 'https://api.deepseek.com/v1',
  api_key TEXT,
  model_name TEXT DEFAULT 'deepseek-chat',
  system_prompt TEXT DEFAULT '你是一个智能助手，可以帮助用户生成日报、周报和月报。请根据用户提供的信息，生成专业、简洁的报告内容。',
  user_prompt TEXT DEFAULT '请根据我的工作内容，生成一份专业的日报。',
  is_enabled BOOLEAN DEFAULT TRUE,
  settings_type TEXT DEFAULT 'system' CHECK (settings_type IN ('system', 'custom')),
  system_ai_remaining_calls INTEGER DEFAULT 10,
  system_ai_total_calls_limit INTEGER DEFAULT 10,
  system_ai_calls INTEGER DEFAULT 0,
  custom_ai_calls INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为settings_type字段添加注释
COMMENT ON COLUMN public.user_ai_settings.settings_type IS '设置类型：system表示使用系统环境变量配置，custom表示使用用户自定义配置';
COMMENT ON COLUMN public.user_ai_settings.system_ai_remaining_calls IS '系统AI剩余调用次数';
COMMENT ON COLUMN public.user_ai_settings.system_ai_total_calls_limit IS '系统AI总调用次数限制';
COMMENT ON COLUMN public.user_ai_settings.system_ai_calls IS '系统AI累计调用次数';
COMMENT ON COLUMN public.user_ai_settings.custom_ai_calls IS '自定义AI累计调用次数';

-- 为用户AI设置表启用行级安全策略
ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;

-- 用户AI设置的RLS策略
CREATE POLICY "用户可以查看自己的AI设置" ON public.user_ai_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的AI设置" ON public.user_ai_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的AI设置" ON public.user_ai_settings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的AI设置" ON public.user_ai_settings
  FOR DELETE USING (user_id = auth.uid());

-- 创建触发器函数，在创建用户资料时自动创建默认AI设置
CREATE OR REPLACE FUNCTION public.handle_new_user_ai_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- 创建用户AI设置（如果系统环境变量已配置，则默认使用系统设置）
  INSERT INTO public.user_ai_settings (
    user_id,
    is_enabled,
    settings_type
  )
  VALUES (
    NEW.id,
    TRUE,
    'system'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加触发器，自动为新用户创建AI设置
CREATE TRIGGER on_user_profile_created
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_ai_settings();

-- 用户钉钉设置表
CREATE TABLE public.user_dingtalk_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  ios_url_scheme TEXT DEFAULT 'dingtalk://dingtalkclient/page/link?url=https://landray.dingtalkapps.com/alid/app/report/home.html',
  is_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为用户钉钉设置表启用行级安全策略
ALTER TABLE public.user_dingtalk_settings ENABLE ROW LEVEL SECURITY;

-- 用户钉钉设置的RLS策略
CREATE POLICY "用户可以查看自己的钉钉设置" ON public.user_dingtalk_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的钉钉设置" ON public.user_dingtalk_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的钉钉设置" ON public.user_dingtalk_settings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的钉钉设置" ON public.user_dingtalk_settings
  FOR DELETE USING (user_id = auth.uid());

-- 创建触发器函数，在创建用户资料时自动创建默认钉钉设置
CREATE OR REPLACE FUNCTION public.handle_new_user_dingtalk_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- 创建用户钉钉设置
  INSERT INTO public.user_dingtalk_settings (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加触发器，自动为新用户创建钉钉设置
CREATE TRIGGER on_user_profile_created_dingtalk
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_dingtalk_settings();

-- =====================
-- RLS 策略：支持 admin 角色读取所有数据
-- =====================
-- projects
DROP POLICY IF EXISTS "管理员可查所有项目" ON public.projects;
CREATE POLICY "管理员可查所有项目" ON public.projects
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (auth.jwt() -> 'roles') ? 'admin'
  );

-- daily_reports
DROP POLICY IF EXISTS "管理员可查所有日报" ON public.daily_reports;
CREATE POLICY "管理员可查所有日报" ON public.daily_reports
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (auth.jwt() -> 'roles') ? 'admin'
  );

-- user_ai_settings
DROP POLICY IF EXISTS "管理员可查所有AI设置" ON public.user_ai_settings;
CREATE POLICY "管理员可查所有AI设置" ON public.user_ai_settings
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (auth.jwt() -> 'roles') ? 'admin'
  );

-- 先创建待办状态枚举类型
CREATE TYPE todo_status AS ENUM ('not_started', 'in_progress', 'completed');

-- 待办表
CREATE TABLE public.project_todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  project_id UUID REFERENCES public.projects(id) NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  due_date DATE NOT NULL,
  status todo_status NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.project_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可以查看自己的待办" ON public.project_todos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的待办" ON public.project_todos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的待办" ON public.project_todos
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的待办" ON public.project_todos
  FOR DELETE USING (user_id = auth.uid());