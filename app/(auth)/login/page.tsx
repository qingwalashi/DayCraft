'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { login } = useAuth();
  const loginAttemptRef = useRef<number>(0);
  const lastLoginTimeRef = useRef<number>(0);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // 验证输入
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    
    // 防止快速重复点击
    const now = Date.now();
    if (now - lastLoginTimeRef.current < 2000) {
      setError('请稍候再试');
      return;
    }
    
    // 检查登录尝试次数，实现指数退避
    const attemptCount = loginAttemptRef.current;
    if (attemptCount > 3) {
      const backoffTime = Math.min(Math.pow(2, attemptCount - 3) * 1000, 30000);
      if (now - lastLoginTimeRef.current < backoffTime) {
        setError(`请等待${Math.ceil(backoffTime/1000)}秒后再试`);
        return;
      }
    }
    
    setLoading(true);
    lastLoginTimeRef.current = now;
    
    try {
      console.log('尝试登录...');
      const success = await login(email, password);
      
      if (success) {
        console.log('登录成功，重定向到仪表板');
        loginAttemptRef.current = 0; // 重置尝试次数
        router.push('/dashboard/overview');
      } else {
        // 登录失败由 login 函数内部处理错误提示
        loginAttemptRef.current++; // 增加尝试次数
      }
    } catch (err) {
      console.error('登录过程发生异常:', err);
      setError('登录时出错，请检查网络连接或稍后重试');
      loginAttemptRef.current++; // 增加尝试次数
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-blue-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-center text-blue-600">登录 DayCraft</h2>
          <p className="mt-2 text-sm text-center text-gray-500">
            记录每日工作，高效生成周报月报
          </p>

          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                邮箱地址
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入您的邮箱"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  密码
                </label>
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
                  忘记密码?
                </Link>
              </div>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入您的密码"
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
                {loading ? "登录中..." : "登录"}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">没有账号?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/signup"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                注册新账号
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 