'use client';

import { useState } from "react";
import { toast } from "sonner";
import { 
  XIcon, 
  ShareIcon, 
  LockIcon, 
  CalendarIcon, 
  CopyIcon, 
  CheckIcon,
  EyeIcon,
  EyeOffIcon 
} from "lucide-react";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

interface ShareData {
  id: string;
  share_token: string;
  share_url: string;
  project_name: string;
  has_password: boolean;
  expires_at: string | null;
  created_at: string;
  original_password?: string; // 添加原始密码字段
}

export default function ShareDialog({ isOpen, onClose, projectId, projectName }: ShareDialogProps) {
  const [loading, setLoading] = useState(false);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 创建分享
  const createShare = async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/work-breakdown/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          password: password.trim() || null,
          expires_in_days: expiryDays,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '创建分享失败');
      }

      // 添加原始密码到返回数据中
      const shareDataWithPassword = {
        ...data,
        original_password: password.trim() || null
      };
      setShareData(shareDataWithPassword);
      toast.success('分享链接创建成功');
    } catch (error: any) {
      console.error('创建分享失败:', error);
      const errorMessage = error.message || '创建分享失败';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 复制链接
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
  };

  // 复制分享信息（链接+密码）
  const copyShareInfo = async () => {
    if (!shareData) return;

    let shareInfo = `📋 工作分解分享\n`;
    shareInfo += `项目: ${shareData.project_name}\n`;
    shareInfo += `链接: ${shareData.share_url}`;

    if (shareData.has_password && shareData.original_password) {
      shareInfo += `\n密码: ${shareData.original_password}`;
    } else {
      shareInfo += `\n密码: 无需密码`;
    }

    if (shareData.expires_at) {
      shareInfo += `\n过期: ${new Date(shareData.expires_at).toLocaleString()}`;
    } else {
      shareInfo += `\n过期: 永久有效`;
    }

    shareInfo += `\n\n💡 请妥善保管分享信息`;

    try {
      await navigator.clipboard.writeText(shareInfo);
      toast.success('分享信息已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
  };

  // 重置表单
  const resetForm = () => {
    setPassword('');
    setExpiryDays(null);
    setShareData(null);
    setCopied(false);
    setError(null);
  };

  // 关闭对话框
  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <ShareIcon className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">分享工作分解</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!shareData ? (
            // 配置表单
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">项目信息</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                  {projectName}
                </p>
              </div>

              {/* 密码保护 */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <LockIcon className="w-4 h-4 mr-1" />
                  密码保护（可选）
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="留空表示不设置密码"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* 过期时间 */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  过期时间
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '永久', value: null },
                      { label: '1天', value: 1 },
                      { label: '14天', value: 14 },
                      { label: '30天', value: 30 },
                    ].map((option) => (
                      <button
                        key={option.label}
                        onClick={() => setExpiryDays(option.value)}
                        className={`
                          px-3 py-1 text-sm rounded-md border transition-colors
                          ${expiryDays === option.value
                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                            : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {expiryDays && (
                    <p className="text-xs text-gray-500">
                      将在 {expiryDays} 天后过期
                    </p>
                  )}
                </div>
              </div>

              {/* 错误信息 */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* 创建按钮 */}
              <div className="pt-4">
                <button
                  onClick={createShare}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '创建中...' : '创建分享链接'}
                </button>
              </div>
            </div>
          ) : (
            // 分享结果
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckIcon className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">分享链接已创建</h3>
                <p className="text-sm text-gray-600">任何人都可以通过此链接访问工作分解</p>
              </div>

              {/* 分享信息 */}
              <div className="bg-gray-50 p-4 rounded-md space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    项目名称
                  </label>
                  <p className="text-sm text-gray-900">{shareData.project_name}</p>
                </div>

                {shareData.has_password && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      密码保护
                    </label>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-900 flex items-center">
                        <LockIcon className="w-4 h-4 mr-1" />
                        已启用
                      </p>
                      {shareData.original_password && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">密码:</span>
                          <div className="flex items-center space-x-1">
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                              {showPassword ? shareData.original_password : '••••••••'}
                            </code>
                            <button
                              onClick={() => setShowPassword(!showPassword)}
                              className="p-1 text-gray-500 hover:text-gray-700"
                              title={showPassword ? '隐藏密码' : '显示密码'}
                            >
                              {showPassword ? (
                                <EyeOffIcon className="h-3 w-3" />
                              ) : (
                                <EyeIcon className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(shareData.original_password!)}
                              className="p-1 text-gray-500 hover:text-gray-700"
                              title="复制密码"
                            >
                              <CopyIcon className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {shareData.expires_at && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      过期时间
                    </label>
                    <p className="text-sm text-gray-900 flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      {new Date(shareData.expires_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* 分享链接 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  分享链接
                </label>
                <div className="space-y-2">
                  <div className="flex">
                    <input
                      type="text"
                      value={shareData.share_url}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(shareData.share_url)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      title="复制链接"
                    >
                      {copied ? (
                        <CheckIcon className="w-4 h-4" />
                      ) : (
                        <CopyIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* 快速复制分享信息提示 */}
                  {shareData.has_password && shareData.original_password && (
                    <div className="text-xs text-gray-500 bg-yellow-50 p-2 rounded border border-yellow-200">
                      <span className="flex items-center">
                        💡 提示：使用下方"复制分享信息"按钮可同时复制链接和密码
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="space-y-3 pt-4">
                {/* 复制分享信息按钮 */}
                <button
                  onClick={copyShareInfo}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors flex items-center justify-center"
                >
                  <CopyIcon className="w-4 h-4 mr-2" />
                  {shareData.has_password && shareData.original_password
                    ? '复制链接和密码'
                    : '复制分享信息'
                  }
                </button>

                {/* 其他操作按钮 */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => window.open(shareData.share_url, '_blank')}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
                  >
                    预览
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
