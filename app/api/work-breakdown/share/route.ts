import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { generateShareToken } from '@/lib/utils/share-cleanup';

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
    const { project_id, password, expires_in_days } = body;

    if (!project_id) {
      return NextResponse.json({ error: '项目ID不能为空' }, { status: 400 });
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

    // 验证用户是否有权限访问该项目
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .eq('user_id', session.user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: '项目不存在或无权限访问' }, { status: 403 });
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

    // 创建分享记录
    const { data: share, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .insert({
        project_id,
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

    // 构建分享链接
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'http://localhost:3000');
    const share_url = `${baseUrl}/share/${share_token}`;

    return NextResponse.json({
      id: share.id,
      share_token,
      share_url,
      project_name: project.name,
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

    // 检查是否请求获取密码
    const url = new URL(request.url);
    const getPasswords = url.searchParams.get('include_passwords') === 'true';

    // 获取用户的所有分享
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
        projects (
          id,
          name,
          code
        )
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (sharesError) {
      console.error('获取分享列表失败:', sharesError);
      return NextResponse.json({ error: '获取分享列表失败' }, { status: 500 });
    }

    // 构建返回数据
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'http://localhost:3000');

    const formattedShares = shares?.map(share => ({
      id: share.id,
      share_token: share.share_token,
      share_url: `${baseUrl}/share/${share.share_token}`,
      project_id: share.projects?.id,
      project_name: share.projects?.name,
      project_code: share.projects?.code,
      has_password: !!share.password_hash,
      expires_at: share.expires_at,
      is_active: share.is_active,
      created_at: share.created_at,
      updated_at: share.updated_at
    })) || [];

    return NextResponse.json({ shares: formattedShares });

  } catch (error) {
    console.error('获取分享列表API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
