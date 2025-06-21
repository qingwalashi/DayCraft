'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const supabase = createClient();
  
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        setError(error.message);
      } else {
        setSuccessMessage('重置密码邮件已发送，请检查您的邮箱。');
      }
    } catch (err) {
      setError('发送重置密码邮件时出错，请重试');
      console.error('重置密码错误:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-blue-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-center text-blue-600">找回密码</h2>
          <p className="mt-2 text-sm text-center text-gray-500">
            请输入您的邮箱地址，我们将发送重置密码的链接给您
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
            <form className="mt-8 space-y-6" onSubmit={handleForgotPassword}>
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
                  {loading ? "发送中..." : "发送重置链接"}
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