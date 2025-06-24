'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();
  const { signup } = useAuth();
  const signupAttemptRef = useRef<number>(0);
  const lastSignupTimeRef = useRef<number>(0);
  
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    // 防止快速重复点击
    const now = Date.now();
    if (now - lastSignupTimeRef.current < 3000) {
      setError('请稍候再试');
      return;
    }
    
    // 检查注册尝试次数，实现指数退避
    const attemptCount = signupAttemptRef.current;
    if (attemptCount > 2) {
      const backoffTime = Math.min(Math.pow(2, attemptCount - 2) * 1000, 60000);
      if (now - lastSignupTimeRef.current < backoffTime) {
        setError(`请等待${Math.ceil(backoffTime/1000)}秒后再试`);
        return;
      }
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    lastSignupTimeRef.current = now;
    
    try {
      const success = await signup(email, password, name);
      
      if (success) {
        setSuccessMessage('注册成功！请检查您的邮箱并点击确认链接。');
        signupAttemptRef.current = 0; // 重置尝试次数
      } else {
        // 注册失败由 signup 函数内部处理错误提示
        signupAttemptRef.current++; // 增加尝试次数
      }
    } catch (err) {
      setError('注册时出错，请重试');
      console.error('注册错误:', err);
      signupAttemptRef.current++; // 增加尝试次数
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-blue-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-center text-blue-600">注册 DayCraft</h2>
          <p className="mt-2 text-sm text-center text-gray-500">
            创建账号，开始您的日报管理之旅
          </p>

          {successMessage ? (
            <div className="mt-8">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{successMessage}</span>
              </div>
              <div className="mt-6 text-center">
                <Link href="/login" className="text-blue-600 hover:text-blue-500">
                  返回登录页面
                </Link>
              </div>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={handleSignup}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  姓名
                </label>
                <div className="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入您的姓名"
                  />
                </div>
              </div>

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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  密码
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
                    placeholder="请输入密码（至少6个字符）"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  确认密码
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
                    placeholder="请再次输入密码"
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
                  {loading ? "注册中..." : "注册"}
                </button>
              </div>
            </form>
          )}

          {!successMessage && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                已有账号? <Link href="/login" className="text-blue-600 hover:text-blue-500">登录</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 