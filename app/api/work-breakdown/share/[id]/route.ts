import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

// 更新分享配置
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const body = await request.json();
    const { password, expires_in_days, is_active, get_password } = body;
    const shareId = params.id;

    // 验证分享是否存在且属于当前用户
    const { data: existingShare, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .select('id, user_id, password_hash')
      .eq('id', shareId)
      .eq('user_id', session.user.id)
      .single();

    if (shareError || !existingShare) {
      return NextResponse.json({ error: '分享不存在或无权限访问' }, { status: 403 });
    }

    // 如果只是获取密码，直接返回
    if (get_password) {
      return NextResponse.json({
        has_password: !!existingShare.password_hash,
        // 注意：出于安全考虑，我们不返回实际密码，只返回是否有密码
        message: existingShare.password_hash ? '此分享已设置密码保护' : '此分享未设置密码'
      });
    }

    // 准备更新数据
    const updateData: any = {};

    // 处理密码更新
    if (password !== undefined) {
      if (password && password.trim()) {
        updateData.password_hash = await bcrypt.hash(password.trim(), 10);
      } else {
        updateData.password_hash = null;
      }
    }

    // 处理过期时间更新
    if (expires_in_days !== undefined) {
      if (expires_in_days && expires_in_days > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expires_in_days);
        updateData.expires_at = expiryDate.toISOString();
      } else {
        updateData.expires_at = null;
      }
    }

    // 处理启用状态更新
    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    // 更新分享记录
    const { data: updatedShare, error: updateError } = await supabase
      .from('work_breakdown_shares')
      .update(updateData)
      .eq('id', shareId)
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
      .single();

    if (updateError) {
      console.error('更新分享失败:', updateError);
      return NextResponse.json({ error: '更新分享失败' }, { status: 500 });
    }

    // 构建返回数据
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
      (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'http://localhost:3000');

    // 确保projects是单个对象而不是数组
    const project = Array.isArray(updatedShare.projects) ? updatedShare.projects[0] : updatedShare.projects;

    return NextResponse.json({
      id: updatedShare.id,
      share_token: updatedShare.share_token,
      share_url: `${baseUrl}/share/${updatedShare.share_token}`,
      project_id: project?.id,
      project_name: project?.name,
      project_code: project?.code,
      has_password: !!updatedShare.password_hash,
      expires_at: updatedShare.expires_at,
      is_active: updatedShare.is_active,
      created_at: updatedShare.created_at,
      updated_at: updatedShare.updated_at
    });

  } catch (error) {
    console.error('更新分享API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 删除分享
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户身份
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const shareId = params.id;

    // 验证分享是否存在且属于当前用户
    const { data: existingShare, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .select('id, user_id')
      .eq('id', shareId)
      .eq('user_id', session.user.id)
      .single();

    if (shareError || !existingShare) {
      return NextResponse.json({ error: '分享不存在或无权限访问' }, { status: 403 });
    }

    // 删除分享记录
    const { error: deleteError } = await supabase
      .from('work_breakdown_shares')
      .delete()
      .eq('id', shareId);

    if (deleteError) {
      console.error('删除分享失败:', deleteError);
      return NextResponse.json({ error: '删除分享失败' }, { status: 500 });
    }

    return NextResponse.json({ message: '分享已删除' });

  } catch (error) {
    console.error('删除分享API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
