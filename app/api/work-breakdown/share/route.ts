import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { generateShareToken } from '@/lib/utils/share-cleanup';
import { getBaseUrl } from '@/lib/utils/url-helper';

// 创建分享
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const body = await request.json();
    const { project_ids, password, expires_in_days } = body;

    // 支持单项目和多项目
    const projectIds = Array.isArray(project_ids) ? project_ids : [project_ids];

    if (!projectIds || projectIds.length === 0) {
      return NextResponse.json({ error: '至少需要选择一个项目' }, { status: 400 });
    }

    if (projectIds.length > 10) {
      return NextResponse.json({ error: '最多只能同时分享10个项目' }, { status: 400 });
    }

    // 验证过期天数
    if (expires_in_days !== null && expires_in_days !== undefined) {
      if (typeof expires_in_days !== 'number' || expires_in_days < 1 || expires_in_days > 365) {
        return NextResponse.json({ error: '过期天数必须在1-365之间' }, { status: 400 });
      }
    }

    // 验证密码长度
    if (password && password.length > 100) {
      return NextResponse.json({ error: '密码长度不能超过100个字符' }, { status: 400 });
    }

    // 验证用户是否有权限访问所有项目
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id, name, code')
      .in('id', projectIds)
      .eq('user_id', session.user.id);

    if (projectError) {
      console.error('查询项目失败:', projectError);
      return NextResponse.json({ error: '查询项目失败' }, { status: 500 });
    }

    if (!projects || projects.length !== projectIds.length) {
      console.error('项目验证失败:', {
        requestedIds: projectIds,
        foundProjects: projects?.map(p => p.id) || [],
        userId: session.user.id
      });

      const foundIds = projects?.map(p => p.id) || [];
      const missingIds = projectIds.filter(id => !foundIds.includes(id));

      return NextResponse.json({
        error: `部分项目不存在或无权限访问`,
        details: {
          requested: projectIds.length,
          found: projects?.length || 0,
          missing: missingIds
        }
      }, { status: 403 });
    }

    // 生成唯一的分享token
    const share_token = generateShareToken();

    // 处理密码加密
    let password_hash = null;
    if (password && password.trim()) {
      password_hash = await bcrypt.hash(password.trim(), 10);
    }

    // 计算过期时间
    let expires_at = null;
    if (expires_in_days && expires_in_days > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expires_in_days);
      expires_at = expiryDate.toISOString();
    }

    // 创建分享记录（使用新的关联表结构）
    const { data: share, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .insert({
        user_id: session.user.id,
        share_token,
        password_hash,
        expires_at,
        is_active: true
      })
      .select()
      .single();

    if (shareError) {
      console.error('创建分享失败:', shareError);
      return NextResponse.json({ error: '创建分享失败' }, { status: 500 });
    }

    // 创建项目关联记录
    const shareProjectsData = projectIds.map(projectId => ({
      share_id: share.id,
      project_id: projectId
    }));

    const { error: shareProjectsError } = await supabase
      .from('work_breakdown_share_projects')
      .insert(shareProjectsData);

    if (shareProjectsError) {
      console.error('创建项目关联失败:', shareProjectsError);
      // 如果关联创建失败，删除已创建的分享记录
      await supabase.from('work_breakdown_shares').delete().eq('id', share.id);
      return NextResponse.json({ error: '创建分享失败' }, { status: 500 });
    }

    // 构建分享链接
    const baseUrl = getBaseUrl(request);
    const share_url = `${baseUrl}/share/${share_token}`;

    return NextResponse.json({
      id: share.id,
      share_token,
      share_url,
      projects: projects.map(p => ({ id: p.id, name: p.name, code: p.code })),
      has_password: !!password_hash,
      expires_at,
      created_at: share.created_at
    });

  } catch (error) {
    console.error('创建分享API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 获取用户的分享列表
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }



    // 获取用户的所有分享及关联的项目
    const { data: shares, error: sharesError } = await supabase
      .from('work_breakdown_shares')
      .select(`
        id,
        share_token,
        password_hash,
        expires_at,
        is_active,
        created_at,
        updated_at,
        work_breakdown_share_projects (
          project_id,
          projects (
            id,
            name,
            code
          )
        )
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (sharesError) {
      console.error('获取分享列表失败:', sharesError);
      return NextResponse.json({ error: '获取分享列表失败' }, { status: 500 });
    }

    // 构建返回数据
    const baseUrl = getBaseUrl(request);

    const formattedShares = shares?.map(share => {
      // 获取关联的项目列表
      const shareProjects = share.work_breakdown_share_projects || [];
      const projects = shareProjects
        .map(sp => sp.projects)
        .filter((p): p is any => p && typeof p === 'object' && 'id' in p && 'name' in p);

      // 为了向后兼容，如果只有一个项目，保持原有字段
      const primaryProject = projects[0];

      return {
        id: share.id,
        share_token: share.share_token,
        share_url: `${baseUrl}/share/${share.share_token}`,
        // 向后兼容字段
        project_id: primaryProject?.id,
        project_name: primaryProject?.name,
        project_code: primaryProject?.code,
        // 新增多项目字段
        projects: projects,
        project_count: projects.length,
        has_password: !!share.password_hash,
        expires_at: share.expires_at,
        is_active: share.is_active,
        created_at: share.created_at,
        updated_at: share.updated_at
      };
    }) || [];

    return NextResponse.json({ shares: formattedShares });

  } catch (error) {
    console.error('获取分享列表API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
