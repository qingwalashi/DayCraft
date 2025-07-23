import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// 获取用户的项目列表
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    // 获取查询参数
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('active_only') === 'true';

    // 构建查询
    let query = supabase
      .from('projects')
      .select('id, name, code, description, is_active, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    // 如果只要活跃项目
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: projects, error: projectsError } = await query;

    if (projectsError) {
      console.error('获取项目列表失败:', projectsError);
      return NextResponse.json({ error: '获取项目列表失败' }, { status: 500 });
    }

    return NextResponse.json({
      projects: projects || [],
      total: projects?.length || 0
    });

  } catch (error) {
    console.error('项目API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 创建新项目
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const body = await request.json();
    const { name, code, description, is_active = true } = body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });
    }

    // 验证项目名称长度
    if (name.length > 100) {
      return NextResponse.json({ error: '项目名称不能超过100个字符' }, { status: 400 });
    }

    // 验证项目编码（如果提供）
    if (code && code.length > 50) {
      return NextResponse.json({ error: '项目编码不能超过50个字符' }, { status: 400 });
    }

    // 验证描述长度
    if (description && description.length > 500) {
      return NextResponse.json({ error: '项目描述不能超过500个字符' }, { status: 400 });
    }

    // 检查项目名称是否重复
    const { data: existingProject } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', name.trim())
      .single();

    if (existingProject) {
      return NextResponse.json({ error: '项目名称已存在' }, { status: 400 });
    }

    // 如果提供了项目编码，检查是否重复
    if (code && code.trim()) {
      const { data: existingCode } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('code', code.trim())
        .single();

      if (existingCode) {
        return NextResponse.json({ error: '项目编码已存在' }, { status: 400 });
      }
    }

    // 创建项目
    const { data: project, error: createError } = await supabase
      .from('projects')
      .insert({
        user_id: session.user.id,
        name: name.trim(),
        code: code?.trim() || null,
        description: description?.trim() || null,
        is_active
      })
      .select()
      .single();

    if (createError) {
      console.error('创建项目失败:', createError);
      return NextResponse.json({ error: '创建项目失败' }, { status: 500 });
    }

    return NextResponse.json({
      project,
      message: '项目创建成功'
    }, { status: 201 });

  } catch (error) {
    console.error('创建项目API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
