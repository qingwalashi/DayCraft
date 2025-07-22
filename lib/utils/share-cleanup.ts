import { createClient } from '@/lib/supabase/client';

/**
 * 清理过期的分享记录
 * 这个函数可以在后台定期运行，或者在用户访问时触发
 */
export async function cleanupExpiredShares() {
  try {
    const supabase = createClient();
    
    // 删除已过期的分享记录
    const { data, error } = await supabase
      .from('work_breakdown_shares')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);

    if (error) {
      console.error('清理过期分享失败:', error);
      return { success: false, error: error.message };
    }

    console.log(`已清理 ${data?.length || 0} 个过期分享`);
    return { success: true, count: data?.length || 0 };
  } catch (error: any) {
    console.error('清理过期分享异常:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 检查分享是否有效（未过期且已启用）
 */
export function isShareValid(share: {
  is_active: boolean;
  expires_at: string | null;
}): boolean {
  if (!share.is_active) {
    return false;
  }

  if (share.expires_at) {
    const expiryDate = new Date(share.expires_at);
    const now = new Date();
    if (now > expiryDate) {
      return false;
    }
  }

  return true;
}

/**
 * 生成安全的分享token
 */
export function generateShareToken(): string {
  // 使用crypto.randomBytes生成32位随机字符串
  if (typeof window === 'undefined') {
    // 服务端环境
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  } else {
    // 客户端环境（虽然通常不会在客户端生成token）
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * 验证分享token格式
 */
export function isValidShareToken(token: string): boolean {
  // 检查是否为32位十六进制字符串
  return /^[a-f0-9]{32}$/i.test(token);
}
