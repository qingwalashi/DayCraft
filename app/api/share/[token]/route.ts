import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { isValidShareToken, isShareValid } from '@/lib/utils/share-cleanup';

// 获取公开分享的工作分解数据
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const token = params.token;

    if (!token || !isValidShareToken(token)) {
      return NextResponse.json({ error: '分享链接无效' }, { status: 400 });
    }

    // 查找分享记录及关联的项目
    const { data: share, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .select(`
        id,
        user_id,
        password_hash,
        expires_at,
        is_active,
        created_at,
        work_breakdown_share_projects (
          project_id,
          projects (
            id,
            name,
            code,
            description
          )
        )
      `)
      .eq('share_token', token)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
    }

    // 检查分享是否有效
    if (!isShareValid(share)) {
      if (!share.is_active) {
        return NextResponse.json({ error: '分享已被停用' }, { status: 403 });
      } else {
        return NextResponse.json({ error: '分享链接已过期' }, { status: 403 });
      }
    }

    // 检查是否需要密码验证
    const url = new URL(request.url);
    const providedPassword = url.searchParams.get('password');

    if (share.password_hash) {
      if (!providedPassword) {
        return NextResponse.json({ 
          error: '需要密码',
          requires_password: true 
        }, { status: 401 });
      }

      const isPasswordValid = await bcrypt.compare(providedPassword, share.password_hash);
      if (!isPasswordValid) {
        return NextResponse.json({ 
          error: '密码错误',
          requires_password: true 
        }, { status: 401 });
      }
    }

    // 获取关联的项目列表
    const shareProjects = share.work_breakdown_share_projects || [];
    const validProjects = shareProjects
      .map(sp => sp.projects)
      .filter((p): p is any => p && typeof p === 'object' && 'id' in p && 'name' in p);

    if (validProjects.length === 0) {
      return NextResponse.json({ error: '分享中没有关联的项目' }, { status: 404 });
    }

    // 检查是否指定了特定项目
    const requestedProjectId = url.searchParams.get('project_id');

    let targetProjectId;
    if (requestedProjectId) {
      // 验证请求的项目是否在分享的项目列表中
      const requestedProject = validProjects.find(p => p.id === requestedProjectId);
      if (!requestedProject) {
        return NextResponse.json({ error: '请求的项目不在分享范围内' }, { status: 403 });
      }
      targetProjectId = requestedProjectId;
    } else {
      // 默认使用第一个项目
      targetProjectId = validProjects[0].id;
    }

    // 获取指定项目的工作分解数据
    const { data: workItems, error: workItemsError } = await supabase
      .from('work_breakdown_items')
      .select('*')
      .eq('project_id', targetProjectId)
      .eq('user_id', share.user_id)
      .order('level')
      .order('position');

    if (workItemsError) {
      console.error('获取工作分解数据失败:', workItemsError);
      return NextResponse.json({ error: '获取数据失败' }, { status: 500 });
    }

    // 构建树形结构
    const buildTree = (items: any[]) => {
      const itemMap: { [key: string]: any } = {};
      const rootItems: any[] = [];

      // 创建映射
      items.forEach(item => {
        itemMap[item.id] = {
          id: item.id,
          name: item.name,
          description: item.description,
          level: item.level,
          position: item.position,
          status: item.status,
          tags: item.tags,
          members: item.members,
          progress_notes: item.progress_notes,
          planned_start_time: item.planned_start_time,
          planned_end_time: item.planned_end_time,
          actual_start_time: item.actual_start_time,
          actual_end_time: item.actual_end_time,
          is_milestone: item.is_milestone,
          children: []
        };
      });

      // 构建树形结构
      items.forEach(item => {
        const workItem = itemMap[item.id];
        
        if (item.parent_id && itemMap[item.parent_id]) {
          itemMap[item.parent_id].children.push(workItem);
        } else {
          rootItems.push(workItem);
        }
      });

      // 对每个级别的子项按position排序
      const sortChildren = (items: any[]) => {
        items.sort((a, b) => a.position - b.position);
        items.forEach(item => {
          if (item.children.length > 0) {
            sortChildren(item.children);
          }
        });
      };

      sortChildren(rootItems);
      return rootItems;
    };

    // 获取分享者用户信息
    let sharedBy = '未知用户';

    console.log('开始获取用户信息，user_id:', share.user_id);

    try {
      // 首先尝试从user_profiles表获取用户信息
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', share.user_id)
        .single();

      console.log('user_profiles查询结果:', { userData, userError });

      if (userData && userData.full_name) {
        sharedBy = userData.full_name;
        console.log('使用user_profiles.full_name:', sharedBy);
      } else if (userData && userData.email) {
        sharedBy = userData.email;
        console.log('使用user_profiles.email:', sharedBy);
      } else {
        // 如果user_profiles表没有数据，尝试使用admin API获取用户信息
        try {
          const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(share.user_id);

          console.log('admin.getUserById结果:', { authUser: authUser?.user, authError });

          if (authUser?.user) {
            // 优先使用用户元数据中的名称
            if (authUser.user.user_metadata?.full_name) {
              sharedBy = authUser.user.user_metadata.full_name;
              console.log('使用user_metadata.full_name:', sharedBy);
            } else if (authUser.user.user_metadata?.name) {
              sharedBy = authUser.user.user_metadata.name;
              console.log('使用user_metadata.name:', sharedBy);
            } else if (authUser.user.email) {
              sharedBy = authUser.user.email;
              console.log('使用auth.user.email:', sharedBy);
            }
          }
        } catch (adminError) {
          console.error('Admin API获取用户信息失败:', adminError);
          // 保持默认值
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      // 保持默认值 '未知用户'
    }

    console.log('最终确定的分享者:', sharedBy);

    const workItemsTree = buildTree(workItems || []);

    // 获取当前显示的项目信息
    const currentProject = validProjects.find(p => p.id === targetProjectId) || validProjects[0];

    return NextResponse.json({
      // 当前显示的项目信息
      project: {
        id: currentProject.id,
        name: currentProject.name,
        code: currentProject.code,
        description: currentProject.description
      },
      // 所有可用的项目列表
      available_projects: validProjects.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        description: p.description
      })),
      // 当前项目的工作分解数据
      work_items: workItemsTree,
      // 分享信息
      share_info: {
        has_password: !!share.password_hash,
        expires_at: share.expires_at,
        shared_by: sharedBy,
        created_at: share.created_at,
        project_count: validProjects.length,
        current_project_id: targetProjectId
      }
    });

  } catch (error) {
    console.error('获取公开分享数据API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 验证密码
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const token = params.token;
    const body = await request.json();
    const { password } = body;

    if (!token || !password) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // 查找分享记录
    const { data: share, error: shareError } = await supabase
      .from('work_breakdown_shares')
      .select('id, password_hash, is_active, expires_at')
      .eq('share_token', token)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
    }

    // 检查分享是否已停用
    if (!share.is_active) {
      return NextResponse.json({ error: '分享已被停用' }, { status: 403 });
    }

    // 检查是否已过期
    if (share.expires_at) {
      const expiryDate = new Date(share.expires_at);
      const now = new Date();
      if (now > expiryDate) {
        return NextResponse.json({ error: '分享链接已过期' }, { status: 403 });
      }
    }

    // 验证密码
    if (!share.password_hash) {
      return NextResponse.json({ error: '此分享不需要密码' }, { status: 400 });
    }

    const isPasswordValid = await bcrypt.compare(password, share.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    return NextResponse.json({ message: '密码验证成功' });

  } catch (error) {
    console.error('密码验证API错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
