'use client';

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, LockIcon, CalendarIcon, TagIcon, UsersIcon, ClockIcon } from "lucide-react";
import { WorkItem } from "@/lib/services/work-breakdown";
import { calculateWorkItemProgress, STATUS_PROGRESS_MAP } from '@/lib/utils/progress-calculator';
import ProgressIndicator from '@/components/work-breakdown/ProgressIndicator';

interface ShareData {
  project: {
    id: string;
    name: string;
    code: string;
    description: string;
  };
  work_items: WorkItem[];
  share_info: {
    has_password: boolean;
    expires_at: string | null;
  };
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  // 筛选状态
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // 加载分享数据
  const loadShareData = async (passwordParam?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = new URL(`/api/share/${token}`, window.location.origin);
      if (passwordParam) {
        url.searchParams.set('password', passwordParam);
      }
      
      const response = await fetch(url.toString());
      const data = await response.json();
      
      if (!response.ok) {
        if (data.requires_password) {
          setRequiresPassword(true);
          setError(data.error);
        } else {
          throw new Error(data.error || '获取数据失败');
        }
        return;
      }
      
      setShareData(data);
      setRequiresPassword(false);
      
      // 默认展开所有项目
      const allIds = new Set<string>();
      const collectIds = (items: WorkItem[]) => {
        items.forEach(item => {
          allIds.add(item.id);
          if (item.children) {
            collectIds(item.children);
          }
        });
      };
      collectIds(data.work_items);
      setExpandedItems(allIds);
      
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 密码验证
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error('请输入密码');
      return;
    }
    
    setPasswordLoading(true);
    try {
      const response = await fetch(`/api/share/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: password.trim() }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '密码验证失败');
      }
      
      // 密码验证成功，重新加载数据
      await loadShareData(password.trim());
      
    } catch (err: any) {
      toast.error(err.message || '密码验证失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 切换展开状态
  const toggleExpand = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // 筛选工作项
  const filterWorkItems = (items: WorkItem[]): WorkItem[] => {
    if (selectedStatuses.length === 0) return items;
    
    return items.filter(item => {
      const matchesStatus = selectedStatuses.includes(item.status || '未开始');
      const hasMatchingChildren = item.children && filterWorkItems(item.children).length > 0;
      return matchesStatus || hasMatchingChildren;
    }).map(item => ({
      ...item,
      children: item.children ? filterWorkItems(item.children) : []
    }));
  };

  useEffect(() => {
    if (token) {
      loadShareData();
    }
  }, [token]);

  // 渲染工作项
  const renderWorkItem = (item: WorkItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const progress = calculateWorkItemProgress(item);
    
    return (
      <div key={item.id} className="mb-2">
        <div
          className="flex items-center p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
          style={{ marginLeft: level > 0 ? `${Math.min(level * 1.5, 6)}rem` : '0' }}
        >
          {/* 展开/收起按钮 */}
          {hasChildren && (
            <button
              onClick={() => toggleExpand(item.id)}
              className="mr-2 p-1 hover:bg-gray-100 rounded"
            >
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )}
          
          {/* 工作项内容 */}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">{item.name}</h3>
              <div className="flex items-center space-x-2">
                {/* 进度指示器 */}
                <ProgressIndicator progress={progress} size="sm" />
                
                {/* 状态标签 */}
                <span className={`
                  px-2 py-1 text-xs rounded-full
                  ${item.status === '已完成' ? 'bg-green-100 text-green-800' :
                    item.status === '进行中' ? 'bg-blue-100 text-blue-800' :
                    item.status === '已暂停' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'}
                `}>
                  {item.status || '未开始'}
                </span>
              </div>
            </div>
            
            {/* 描述 */}
            {item.description && (
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            )}
            
            {/* 标签和成员 */}
            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
              {item.tags && (
                <div className="flex items-center">
                  <TagIcon className="w-3 h-3 mr-1" />
                  <span>{item.tags}</span>
                </div>
              )}
              {item.members && (
                <div className="flex items-center">
                  <UsersIcon className="w-3 h-3 mr-1" />
                  <span>{item.members}</span>
                </div>
              )}
              {item.planned_start_time && (
                <div className="flex items-center">
                  <ClockIcon className="w-3 h-3 mr-1" />
                  <span>{new Date(item.planned_start_time).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            
            {/* 进展备注 */}
            {item.progress_notes && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                {item.progress_notes}
              </div>
            )}
          </div>
        </div>
        
        {/* 子项目 */}
        {hasChildren && isExpanded && (
          <div className="mt-2">
            {item.children?.map(child => renderWorkItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !requiresPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">访问失败</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center mb-6">
              <LockIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">需要密码</h1>
              <p className="text-gray-600">此分享受密码保护，请输入密码访问</p>
            </div>
            
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-4">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    disabled={passwordLoading}
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
                {error && (
                  <p className="mt-1 text-sm text-red-600">{error}</p>
                )}
              </div>
              
              <button
                type="submit"
                disabled={passwordLoading || !password.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordLoading ? '验证中...' : '访问'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-6xl mb-4">📄</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">暂无数据</h1>
          <p className="text-gray-600">分享内容为空</p>
        </div>
      </div>
    );
  }

  const filteredWorkItems = filterWorkItems(shareData.work_items);
  const statusOptions = ['未开始', '进行中', '已暂停', '已完成'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{shareData.project.name}</h1>
              {shareData.project.code && (
                <p className="text-sm text-gray-600">项目编码: {shareData.project.code}</p>
              )}
              {shareData.project.description && (
                <p className="text-sm text-gray-600 mt-1">{shareData.project.description}</p>
              )}
            </div>
            
            <div className="text-right text-sm text-gray-500">
              <div className="flex items-center">
                <EyeIcon className="w-4 h-4 mr-1" />
                <span>只读模式</span>
              </div>
              {shareData.share_info.expires_at && (
                <div className="flex items-center mt-1">
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  <span>过期时间: {new Date(shareData.share_info.expires_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">状态筛选</h3>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(status => (
              <button
                key={status}
                onClick={() => {
                  if (selectedStatuses.includes(status)) {
                    setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                  } else {
                    setSelectedStatuses([...selectedStatuses, status]);
                  }
                }}
                className={`
                  px-3 py-1 text-sm rounded-full border transition-colors
                  ${selectedStatuses.includes(status)
                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                    : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {status}
              </button>
            ))}
            {selectedStatuses.length > 0 && (
              <button
                onClick={() => setSelectedStatuses([])}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

        {/* 工作分解列表 */}
        <div className="space-y-2">
          {filteredWorkItems.length > 0 ? (
            filteredWorkItems.map(item => renderWorkItem(item))
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">暂无匹配的工作项</h3>
              <p className="text-gray-600">尝试调整筛选条件</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
