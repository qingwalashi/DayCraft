import type { NextRequest } from 'next/server';

/**
 * 获取正确的基础URL，自动检测协议
 * 本地开发环境使用 HTTP，生产环境使用 HTTPS
 */
export function getBaseUrl(request: NextRequest): string {
  // 如果设置了环境变量，直接使用
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  const host = request.headers.get('host');
  if (!host) {
    return 'http://localhost:3000';
  }
  
  // 检测是否为本地开发环境
  const isLocalDevelopment = 
    host.includes('localhost') || 
    host.includes('127.0.0.1') || 
    host.startsWith('192.168.') || 
    host.startsWith('10.') || 
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.20.') ||
    host.startsWith('172.21.') ||
    host.startsWith('172.22.') ||
    host.startsWith('172.23.') ||
    host.startsWith('172.24.') ||
    host.startsWith('172.25.') ||
    host.startsWith('172.26.') ||
    host.startsWith('172.27.') ||
    host.startsWith('172.28.') ||
    host.startsWith('172.29.') ||
    host.startsWith('172.30.') ||
    host.startsWith('172.31.');
  
  // 本地开发环境使用 HTTP，生产环境使用 HTTPS
  const protocol = isLocalDevelopment ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}

/**
 * 检测是否为本地开发环境
 */
export function isLocalEnvironment(host: string): boolean {
  return (
    host.includes('localhost') || 
    host.includes('127.0.0.1') || 
    host.startsWith('192.168.') || 
    host.startsWith('10.') || 
    host.startsWith('172.')
  );
}
