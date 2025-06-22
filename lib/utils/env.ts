/**
 * 获取当前环境的站点URL
 * @returns 当前环境的完整站点URL
 */
export function getSiteUrl(): string {
  // 首先检查环境变量
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) {
    return envUrl;
  }
  
  // 如果环境变量未设置，则使用浏览器的location.origin（如果在客户端）
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // 如果以上都不可用（例如在服务器端渲染期间），则返回默认值
  return 'http://localhost:3000';
}

/**
 * 获取身份验证回调URL
 * @returns 完整的身份验证回调URL
 */
export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`;
}

/**
 * 检查当前是否为开发环境
 * @returns 如果是开发环境则返回true，否则返回false
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 检查当前是否为生产环境
 * @returns 如果是生产环境则返回true，否则返回false
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
} 