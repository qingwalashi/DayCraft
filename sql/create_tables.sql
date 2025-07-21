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
  last_sign_in_at TIMESTAMP WITH TIME ZONE,
  last_report_edit_at TIMESTAMP WITH TIME ZONE -- 最近日报编辑时间
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
-- 用户最近日报编辑时间更新函数
-- =====================
CREATE OR REPLACE FUNCTION public.update_user_last_report_edit()
RETURNS TRIGGER AS $$
DECLARE
  user_id_val UUID;
BEGIN
  -- 根据触发器来源表确定用户ID
  IF TG_TABLE_NAME = 'daily_reports' THEN
    -- 如果是日报表，直接使用user_id
    user_id_val := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'report_items' THEN
    -- 如果是日报条目表，需要通过report_id查询对应的user_id
    SELECT user_id INTO user_id_val
    FROM public.daily_reports
    WHERE id = NEW.report_id;
  ELSE
    -- 其他情况不处理
    RETURN NEW;
  END IF;
  
  -- 更新用户最近日报编辑时间
  IF user_id_val IS NOT NULL THEN
    UPDATE public.user_profiles
    SET last_report_edit_at = NOW()
    WHERE id = user_id_val;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- 为日报表添加触发器，在创建或更新日报时更新用户的last_report_edit_at
CREATE TRIGGER update_user_report_edit_time
  AFTER INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE PROCEDURE public.update_user_last_report_edit();

-- 日报条目表
CREATE TABLE public.report_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.daily_reports(id) NOT NULL,
  project_id UUID REFERENCES public.projects(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为日报条目表添加触发器，在创建或更新日报条目时更新用户的last_report_edit_at
CREATE TRIGGER update_user_report_item_edit_time
  AFTER INSERT OR UPDATE ON public.report_items
  FOR EACH ROW EXECUTE PROCEDURE public.update_user_last_report_edit();

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

-- =====================
-- 工作分解表
-- =====================

-- 确保uuid扩展已启用
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建工作分解表
CREATE TABLE public.work_breakdown_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.work_breakdown_items(id),
  level INTEGER NOT NULL CHECK (level >= 0 AND level <= 4), -- 限制最多5级（0-4级）
  position INTEGER NOT NULL DEFAULT 0, -- 同级项目中的排序位置
  is_expanded BOOLEAN DEFAULT true,
  status TEXT DEFAULT '未开始' CHECK (status IN ('未开始', '进行中', '已暂停', '已完成')), -- 工作进展状态
  tags TEXT, -- 工作标签，用逗号分隔
  members TEXT, -- 参与人员，用逗号分隔
  progress_notes TEXT, -- 工作进展备注
  planned_start_time TIMESTAMP WITH TIME ZONE, -- 计划启动时间
  planned_end_time TIMESTAMP WITH TIME ZONE, -- 计划结束时间
  actual_start_time TIMESTAMP WITH TIME ZONE, -- 实际启动时间
  actual_end_time TIMESTAMP WITH TIME ZONE, -- 实际结束时间
  is_milestone BOOLEAN DEFAULT FALSE, -- 是否为里程碑：true表示是里程碑，false表示普通工作项
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX work_breakdown_items_project_id_idx ON public.work_breakdown_items(project_id);
CREATE INDEX work_breakdown_items_parent_id_idx ON public.work_breakdown_items(parent_id);
CREATE INDEX work_breakdown_items_user_id_idx ON public.work_breakdown_items(user_id);
CREATE INDEX work_breakdown_items_level_idx ON public.work_breakdown_items(level);

-- 为工作分解表启用行级安全策略
ALTER TABLE public.work_breakdown_items ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的工作分解项
CREATE POLICY "用户可以查看自己的工作分解项" ON public.work_breakdown_items
  FOR SELECT USING (user_id = auth.uid());

-- 用户可以创建自己的工作分解项
CREATE POLICY "用户可以创建自己的工作分解项" ON public.work_breakdown_items
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 用户可以更新自己的工作分解项
CREATE POLICY "用户可以更新自己的工作分解项" ON public.work_breakdown_items
  FOR UPDATE USING (user_id = auth.uid());

-- 用户可以删除自己的工作分解项
CREATE POLICY "用户可以删除自己的工作分解项" ON public.work_breakdown_items
  FOR DELETE USING (user_id = auth.uid());

-- 管理员可以查看所有工作分解项
CREATE POLICY "管理员可查所有工作分解项" ON public.work_breakdown_items
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (auth.jwt() -> 'roles') ? 'admin'
  );

-- 创建触发器函数，更新updated_at字段
CREATE OR REPLACE FUNCTION public.update_work_breakdown_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加触发器，在更新工作分解项时更新updated_at
CREATE TRIGGER update_work_breakdown_items_timestamp
  BEFORE UPDATE ON public.work_breakdown_items
  FOR EACH ROW EXECUTE PROCEDURE public.update_work_breakdown_items_updated_at();

-- 创建触发器函数，级联删除子工作项
CREATE OR REPLACE FUNCTION public.cascade_delete_work_breakdown_items()
RETURNS TRIGGER AS $$
BEGIN
  -- 递归删除所有子项
  DELETE FROM public.work_breakdown_items
  WHERE parent_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加触发器，在删除工作分解项时级联删除子项
CREATE TRIGGER cascade_delete_work_breakdown_items
  BEFORE DELETE ON public.work_breakdown_items
  FOR EACH ROW EXECUTE PROCEDURE public.cascade_delete_work_breakdown_items(); 

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

-- =====================
-- 项目周报相关表
-- =====================

-- 项目周报主表
CREATE TABLE public.project_weekly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_plan BOOLEAN DEFAULT FALSE, -- 是否为工作计划
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, year, week_number)
);

-- 项目周报条目表
CREATE TABLE public.project_weekly_report_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.project_weekly_reports(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) NOT NULL,
  work_item_id UUID REFERENCES public.work_breakdown_items(id) ON DELETE SET NULL, -- 可为空，支持直接在项目下添加工作
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX project_weekly_reports_user_id_idx ON public.project_weekly_reports(user_id);
CREATE INDEX project_weekly_reports_year_week_idx ON public.project_weekly_reports(year, week_number);
CREATE INDEX project_weekly_report_items_report_id_idx ON public.project_weekly_report_items(report_id);
CREATE INDEX project_weekly_report_items_project_id_idx ON public.project_weekly_report_items(project_id);
CREATE INDEX project_weekly_report_items_work_item_id_idx ON public.project_weekly_report_items(work_item_id);

-- 为项目周报表启用行级安全策略
ALTER TABLE public.project_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_weekly_report_items ENABLE ROW LEVEL SECURITY;

-- 项目周报主表的RLS策略
CREATE POLICY "用户可以查看自己的项目周报" ON public.project_weekly_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "用户可以创建自己的项目周报" ON public.project_weekly_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可以更新自己的项目周报" ON public.project_weekly_reports
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "用户可以删除自己的项目周报" ON public.project_weekly_reports
  FOR DELETE USING (user_id = auth.uid());

-- 项目周报条目表的RLS策略
CREATE POLICY "用户可以查看自己项目周报中的条目" ON public.project_weekly_report_items
  FOR SELECT USING (
    report_id IN (
      SELECT id FROM public.project_weekly_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以创建自己项目周报中的条目" ON public.project_weekly_report_items
  FOR INSERT WITH CHECK (
    report_id IN (
      SELECT id FROM public.project_weekly_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以更新自己项目周报中的条目" ON public.project_weekly_report_items
  FOR UPDATE USING (
    report_id IN (
      SELECT id FROM public.project_weekly_reports WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以删除自己项目周报中的条目" ON public.project_weekly_report_items
  FOR DELETE USING (
    report_id IN (
      SELECT id FROM public.project_weekly_reports WHERE user_id = auth.uid()
    )
  );

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

-- project_weekly_reports
DROP POLICY IF EXISTS "管理员可查所有项目周报" ON public.project_weekly_reports;
CREATE POLICY "管理员可查所有项目周报" ON public.project_weekly_reports
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (auth.jwt() -> 'roles') ? 'admin'
  );

-- project_weekly_report_items
DROP POLICY IF EXISTS "管理员可查所有项目周报条目" ON public.project_weekly_report_items;
CREATE POLICY "管理员可查所有项目周报条目" ON public.project_weekly_report_items
  FOR SELECT USING (
    report_id IN (
      SELECT id FROM public.project_weekly_reports
      WHERE (user_id = auth.uid()) OR (auth.jwt() -> 'roles') ? 'admin'
    )
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
  completed_at TIMESTAMP WITH TIME ZONE,
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

-- =====================
-- 项目周报触发器和注释
-- =====================

-- 创建触发器函数，自动更新updated_at字段
CREATE OR REPLACE FUNCTION public.update_project_weekly_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 为项目周报主表添加触发器
CREATE TRIGGER update_project_weekly_reports_updated_at
  BEFORE UPDATE ON public.project_weekly_reports
  FOR EACH ROW EXECUTE PROCEDURE public.update_project_weekly_reports_updated_at();

-- 为项目周报条目表添加触发器
CREATE TRIGGER update_project_weekly_report_items_updated_at
  BEFORE UPDATE ON public.project_weekly_report_items
  FOR EACH ROW EXECUTE PROCEDURE public.update_project_weekly_reports_updated_at();

-- 添加表注释
COMMENT ON TABLE public.project_weekly_reports IS '项目周报主表';
COMMENT ON TABLE public.project_weekly_report_items IS '项目周报条目表';

COMMENT ON COLUMN public.project_weekly_reports.year IS '年份';
COMMENT ON COLUMN public.project_weekly_reports.week_number IS '周数（1-53）';
COMMENT ON COLUMN public.project_weekly_reports.start_date IS '周开始日期';
COMMENT ON COLUMN public.project_weekly_reports.end_date IS '周结束日期';
COMMENT ON COLUMN public.project_weekly_reports.is_plan IS '是否为工作计划';

COMMENT ON COLUMN public.project_weekly_report_items.work_item_id IS '工作项ID，可为空，支持直接在项目下添加工作';
COMMENT ON COLUMN public.project_weekly_report_items.content IS '工作内容';