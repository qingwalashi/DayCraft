'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  
  useEffect(() => {
    // 检查用户是否已经登录
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('无效或已过期的密码重置会话');
      }
    };
    
    checkSession();
  }, [supabase.auth]);
  
  const validateForm = () => {
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }
    if (password.length < 6) {
      setError('密码长度至少为6个字符');
      return false;
    }
    return true;
  };
  
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const { error } = await supabase.auth.updateUser({ 
        password
      });
      
      if (error) {
        setError(error.message);
      } else {
        setSuccessMessage('密码重置成功！');
        // 5秒后重定向到登录页
        setTimeout(() => {
          router.push('/login');
        }, 5000);
      }
    } catch (err) {
      setError('重置密码时出错，请重试');
      console.error('重置密码错误:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-blue-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-center text-blue-600">重设密码</h2>
          <p className="mt-2 text-sm text-center text-gray-500">
            请输入您的新密码
          </p>

          {successMessage ? (
            <div className="mt-8">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{successMessage}</span>
                <p className="mt-2 text-sm">5秒后将自动跳转到登录页面...</p>
              </div>
              <div className="mt-6 text-center">
                <Link href="/login" className="text-blue-600 hover:text-blue-500">
                  立即前往登录页面
                </Link>
              </div>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  新密码
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入新密码（至少6个字符）"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  确认新密码
                </label>
                <div className="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请再次输入新密码"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                  <span className="block sm:inline">{error}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "提交中..." : "重设密码"}
                </button>
              </div>

              <div className="mt-4 text-center text-sm">
                <Link href="/login" className="text-blue-600 hover:text-blue-500">
                  返回登录页面
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
} 