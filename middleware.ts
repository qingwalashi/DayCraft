import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 添加缓存控制头，防止浏览器刷新页面
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  const supabase = createMiddlewareClient({ req: request, res: response });
  
  // 检查用户会话
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    // 获取当前路径名
    const { pathname } = request.nextUrl;
    
    // 如果用户未登录且访问受保护的路由，则重定向到登录页面
    if (!session && pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // 如果用户已登录且访问登录页面，则重定向到仪表盘
    if (session && (pathname === '/login' || pathname === '/signup' || pathname === '/')) {
      return NextResponse.redirect(new URL('/dashboard/overview', request.url));
    }
  } catch (error) {
    console.error('中间件错误:', error);
  }

  // 返回修改后的响应
  return response;
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