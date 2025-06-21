import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // 为每个请求创建一个新的响应对象
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req: request, res });
  
  // 检查用户会话
  const { data: { session } } = await supabase.auth.getSession();
  const hasSession = !!session;

  const url = request.nextUrl.clone();
  const searchParams = url.searchParams;

  // 定义路径类型
  const authRequiredPaths = ['/dashboard'];
  const isAuthRoute = ['/login', '/signup', '/forgot-password', '/reset-password'].some(
    path => request.nextUrl.pathname.startsWith(path)
  );
  
  // 检查路径是否需要认证
  const requiresAuth = authRequiredPaths.some(
    path => request.nextUrl.pathname.startsWith(path)
  );
  
  // 重定向规则
  if (requiresAuth && !hasSession) {
    // 1. 如果需要认证但没有会话，重定向到登录页
    const redirectUrl = new URL('/login', request.url);
    searchParams.set('redirect_to', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }
  
  if (isAuthRoute && hasSession) {
    // 2. 如果已登录但访问登录相关页面，重定向到仪表板
    return NextResponse.redirect(new URL('/dashboard/overview', request.url));
  }

  // 返回修改后的响应
  return res;
}

// 配置匹配的路径
export const config = {
  matcher: [
    // 需要保护的路由
    '/dashboard/:path*',
    // 登录相关路由
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    // 首页
    '/'
  ],
}; 