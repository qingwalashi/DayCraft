'use client';

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  CalendarIcon,
  TagIcon,
  UsersIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  ChevronDown,
  XIcon
} from "lucide-react";
import { WorkItem } from "@/lib/services/work-breakdown";
import { calculateWorkItemProgress, STATUS_PROGRESS_MAP } from '@/lib/utils/progress-calculator';
import ProgressIndicator from '@/components/work-breakdown/ProgressIndicator';

// 工作进展状态选项（与工作分解页完全一致）
const STATUS_OPTIONS = [
  { value: '未开始', color: 'bg-gray-200 text-gray-800 border-gray-300', progress: STATUS_PROGRESS_MAP['未开始'] },
  { value: '已暂停', color: 'bg-yellow-200 text-yellow-800 border-yellow-300', progress: STATUS_PROGRESS_MAP['已暂停'] },
  { value: '进行中', color: 'bg-blue-200 text-blue-800 border-blue-300', progress: STATUS_PROGRESS_MAP['进行中'] },
  { value: '已完成', color: 'bg-green-200 text-green-800 border-green-300', progress: STATUS_PROGRESS_MAP['已完成'] },
];

interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
}

interface ShareData {
  project: Project;
  available_projects: Project[];
  work_items: WorkItem[];
  share_info: {
    has_password: boolean;
    expires_at: string | null;
    shared_by: string;
    created_at: string;
    project_count: number;
    current_project_id: string;
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
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [expandLevel, setExpandLevel] = useState<number>(4); // 默认展开全部
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [filteredWorkItems, setFilteredWorkItems] = useState<WorkItem[]>([]);

  // 项目切换状态
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false);
  
  // 引用
  const statusFilterRef = useRef<HTMLDivElement>(null);

  // 工具函数
  const getItemProgress = (item: WorkItem): number => {
    return calculateWorkItemProgress(item);
  };

  // 处理状态筛选切换
  const handleStatusFilterToggle = (status: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  // 清除状态筛选
  const clearStatusFilters = () => {
    setSelectedStatuses([]);
  };

  // 处理工作项点击
  const handleWorkItemClick = (item: WorkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedWorkItem?.id === item.id) {
      setSelectedWorkItem(null);
    } else {
      setSelectedWorkItem(item);
    }
  };

  // 渲染成员
  const renderMembers = (members: string, compact: boolean = false) => {
    if (!members) return null;
    
    const memberList = members.split('，').filter(Boolean);
    const displayCount = compact ? 3 : memberList.length;
    const displayMembers = memberList.slice(0, displayCount);
    const remainingCount = memberList.length - displayCount;
    
    return (
      <>
        {displayMembers.map((member, idx) => (
          <span key={`member-${idx}`} className="inline-flex items-center text-xs px-2 py-1 ml-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            <UsersIcon className="h-3 w-3 mr-1" />
            {member}
          </span>
        ))}
        {remainingCount > 0 && (
          <span className="inline-flex items-center text-xs px-2 py-1 ml-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            +{remainingCount}
          </span>
        )}
      </>
    );
  };

  // 加载分享数据
  const loadShareData = async (projectId?: string) => {
    try {
      setLoading(true);
      setError(null);

      // 构建URL，如果有密码则添加到查询参数中
      const url = new URL(`/api/share/${token}`, window.location.origin);
      if (password) {
        url.searchParams.set('password', password);
      }
      if (projectId) {
        url.searchParams.set('project_id', projectId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setRequiresPassword(true);
          setError(data.error || '需要密码');
          return;
        }
        throw new Error(data.error || '获取分享数据失败');
      }

      // 设置展开状态到工作项数据中
      const setExpandedInData = (items: WorkItem[]): WorkItem[] => {
        return items.map(item => ({
          ...item,
          isExpanded: true, // 默认展开所有层级
          children: item.children ? setExpandedInData(item.children) : []
        }));
      };

      const dataWithExpanded = {
        ...data,
        work_items: setExpandedInData(data.work_items)
      };

      setShareData(dataWithExpanded);
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
      collectIds(dataWithExpanded.work_items);
      setExpandedItems(allIds);

    } catch (err: any) {
      console.error('加载分享数据失败:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理项目切换
  const handleProjectSwitch = async (projectId: string) => {
    if (projectId === shareData?.project.id) {
      setShowProjectSelector(false);
      return;
    }

    setSwitchingProject(true);
    setShowProjectSelector(false);

    try {
      await loadShareData(projectId);
    } catch (err: any) {
      toast.error(err.message || '切换项目失败');
    } finally {
      setSwitchingProject(false);
    }
  };

  // 处理密码提交
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    
    setPasswordLoading(true);
    setError(null);
    
    try {
      await loadShareData();
    } catch (err: any) {
      setError(err.message || '密码验证失败');
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

    // 同时更新shareData中的isExpanded状态
    if (shareData) {
      const updateExpandedInData = (items: WorkItem[]): WorkItem[] => {
        return items.map(item => ({
          ...item,
          isExpanded: item.id === itemId ? newExpanded.has(itemId) : item.isExpanded,
          children: item.children ? updateExpandedInData(item.children) : []
        }));
      };

      setShareData({
        ...shareData,
        work_items: updateExpandedInData(shareData.work_items)
      });
    }
  };

  // 设置工作项展开层级（与工作分解页逻辑一致）
  const handleExpandLevelChange = (level: number) => {
    setExpandLevel(level);

    if (!shareData) return;

    const newExpanded = new Set<string>();

    // 更新所有工作项的展开状态
    const updateExpandState = (items: WorkItem[], currentLevel: number = 0): WorkItem[] => {
      return items.map(item => {
        const shouldExpand = currentLevel < level;

        if (shouldExpand) {
          newExpanded.add(item.id);
        }

        return {
          ...item,
          isExpanded: shouldExpand,
          children: item.children && item.children.length > 0 ? updateExpandState(item.children, currentLevel + 1) : []
        };
      });
    };

    const updatedWorkItems = updateExpandState(shareData.work_items);

    setExpandedItems(newExpanded);
    setShareData({
      ...shareData,
      work_items: updatedWorkItems
    });
  };

  // 筛选工作项（与工作分解页逻辑完全一致）
  const filterWorkItems = (items: WorkItem[]): WorkItem[] => {
    if (selectedStatuses.length === 0) return items;

    // 只保留符合筛选条件的工作项，不保留父级
    const filterItemsByStatus = (items: WorkItem[]): WorkItem[] => {
      const result: WorkItem[] = [];

      // 遍历每个工作项
      for (const item of items) {
        // 递归筛选子项
        const filteredChildren = filterItemsByStatus(item.children || []);

        // 如果当前项状态符合筛选条件
        if (selectedStatuses.includes(item.status || '未开始')) {
          // 添加当前项（带有筛选后的子项）
          result.push({
            ...item,
            children: filteredChildren
          });
        } else if (filteredChildren.length > 0) {
          // 如果当前项不符合条件但有符合条件的子项
          // 将符合条件的子项直接添加到结果中
          result.push(...filteredChildren);
        }
      }

      return result;
    };

    return filterItemsByStatus(items);
  };

  // 根据选中的状态筛选工作项（与工作分解页逻辑一致）
  useEffect(() => {
    if (!shareData?.work_items) return;

    if (selectedStatuses.length === 0) {
      // 如果没有选择任何状态，显示所有工作项
      setFilteredWorkItems(shareData.work_items);
    } else {
      // 使用与工作分解页相同的筛选逻辑
      const filtered = filterWorkItems(shareData.work_items);
      setFilteredWorkItems(filtered);
    }
  }, [shareData?.work_items, selectedStatuses]);

  // 处理展开层级变化
  useEffect(() => {
    if (shareData?.work_items && expandLevel !== undefined) {
      handleExpandLevelChange(expandLevel);
    }
  }, [expandLevel]);

  // 点击外部关闭筛选菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        statusFilterRef.current && 
        !statusFilterRef.current.contains(event.target as Node)
      ) {
        setShowStatusFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (token) {
      loadShareData();
    }
  }, [token]);

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

  const currentItems = selectedStatuses.length > 0 ? filteredWorkItems : shareData.work_items;

  // 渲染工作项（完全复刻工作分解页的预览模式样式）
  const renderWorkItem = (item: WorkItem, level: number = 0) => {
    const isSelected = selectedWorkItem?.id === item.id;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = item.isExpanded !== undefined ? item.isExpanded : expandedItems.has(item.id);

    return (
      <div key={item.id} className="mb-4">
        <div
          className={`flex items-start p-4 rounded-lg shadow-sm border-l-4 transition-all cursor-pointer ${
            isSelected
              ? 'bg-blue-50 border-l-blue-600 shadow-md ring-2 ring-blue-200'
              : 'bg-white hover:shadow-md hover:bg-gray-50'
          } ${
            level === 0 ? (isSelected ? 'border-l-blue-600' : 'border-l-blue-500') :
            level === 1 ? (isSelected ? 'border-l-green-600' : 'border-l-green-500') :
            level === 2 ? (isSelected ? 'border-l-yellow-600' : 'border-l-yellow-500') :
            level === 3 ? (isSelected ? 'border-l-purple-600' : 'border-l-purple-500') :
            (isSelected ? 'border-l-red-600' : 'border-l-red-500')
          }`}
          onClick={(e) => handleWorkItemClick(item, e)}
        >
          <div className="flex-grow">
            {/* 优化布局：PC端更紧凑，移动端自适应 */}
            <div className="flex flex-col sm:flex-row sm:items-center">
              {/* 第一行/左侧：标题和状态 */}
              <div className="flex items-center flex-grow flex-wrap">
                {hasChildren && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.id);
                    }}
                    className="mr-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                    )}
                  </button>
                )}
                <h3 className="font-medium text-lg">{item.name}</h3>

                {/* 显示里程碑标识 */}
                {item.is_milestone && (
                  <span className="ml-2 text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-medium">
                    🏁 里程碑
                  </span>
                )}

                {/* 显示工作状态徽章 */}
                {item.status && (
                  <span className={`ml-2 text-xs px-3 py-1 rounded-full ${
                    item.status === '未开始' ? 'bg-gray-200 text-gray-800 border border-gray-300' :
                    item.status === '进行中' ? 'bg-blue-200 text-blue-800 border border-blue-300' :
                    item.status === '已暂停' ? 'bg-yellow-200 text-yellow-800 border border-yellow-300' :
                    item.status === '已完成' ? 'bg-green-200 text-green-800 border border-green-300' :
                    'bg-gray-200 text-gray-800 border border-gray-300'
                  }`}>
                    {item.status}
                  </span>
                )}

                {/* 显示工作进度 */}
                <div className="ml-2">
                  <ProgressIndicator
                    progress={getItemProgress(item)}
                    size="sm"
                    showBar={true}
                    showText={true}
                  />
                </div>

                {/* 显示参与人员 - 移到第一行 */}
                {item.members && (
                  <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                    {renderMembers(item.members, true)}
                  </div>
                )}

                {/* 显示工作标签 - 移到第一行 */}
                {item.tags && (
                  <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                    <TagIcon className="h-3 w-3 text-gray-500 mr-1" />
                    {item.tags.split('，').filter(Boolean).map((tag, idx) => (
                      <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-1.5 py-0.5 ml-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 描述区域 */}
            <div className="mt-2">
              {/* 描述 */}
              {item.description && (
                <div className="text-sm text-gray-600 leading-relaxed">
                  {item.description}
                </div>
              )}
            </div>

            {/* 工作进展备注 */}
            {item.progress_notes && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                  <ClockIcon className="h-3.5 w-3.5" />
                  <span>工作进展备注:</span>
                </div>
                <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md border border-gray-100 whitespace-pre-wrap">
                  {item.progress_notes}
                </div>
              </div>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className={`pl-8 mt-3 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
            {item.children?.map(child => renderWorkItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex-1 min-w-0">
              {/* 项目标题和标签 - 移动端自适应 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words leading-tight">
                    {shareData.project.name}
                  </h1>

                  {/* 项目切换按钮 - 仅在多项目时显示 */}
                  {shareData.available_projects.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={() => setShowProjectSelector(!showProjectSelector)}
                        disabled={switchingProject}
                        className="inline-flex items-center px-2 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                        title="切换项目"
                      >
                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${showProjectSelector ? 'rotate-180' : ''}`} />
                      </button>

                      {showProjectSelector && (
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                          <div className="p-2 border-b border-gray-100">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              选择项目 ({shareData.available_projects.length})
                            </div>
                          </div>
                          {shareData.available_projects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => handleProjectSwitch(project.id)}
                              className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                                project.id === shareData.project.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                              }`}
                            >
                              <div className="font-medium truncate">{project.name}</div>
                              {project.code && (
                                <div className="text-xs text-gray-500 truncate">{project.code}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* 多项目标签 */}
                  {shareData.available_projects.length > 1 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                      {shareData.available_projects.length} 个项目
                    </span>
                  )}

                  {/* 只读模式标签 */}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    <EyeIcon className="w-3 h-3 mr-1" />
                    只读模式
                  </span>
                </div>
              </div>

              {/* 项目信息 */}
              <div className="space-y-1 mb-3">
                {shareData.project.code && (
                  <p className="text-sm text-gray-600 break-words">
                    项目编码: {shareData.project.code}
                  </p>
                )}
                {shareData.project.description && (
                  <p className="text-sm text-gray-600 break-words whitespace-pre-wrap leading-relaxed">
                    {shareData.project.description}
                  </p>
                )}
              </div>

              {/* 分享来源信息 - 移动端垂直布局 */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 text-sm text-gray-500">
                <div className="flex items-center min-w-0">
                  <UsersIcon className="w-4 h-4 mr-1 shrink-0" />
                  <span className="truncate">
                    来自 <span className="font-medium text-gray-700">{shareData.share_info.shared_by}</span> 的分享
                  </span>
                </div>
                <div className="flex items-center min-w-0">
                  <ClockIcon className="w-4 h-4 mr-1 shrink-0" />
                  <span className="truncate">
                    分享于 {new Date(shareData.share_info.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center min-w-0">
                  <CalendarIcon className="w-4 h-4 mr-1 shrink-0" />
                  <span className="truncate">
                    截止时间: {
                      shareData.share_info.expires_at
                        ? new Date(shareData.share_info.expires_at).toLocaleDateString()
                        : <span className="font-medium text-green-600">永久</span>
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 项目切换加载状态 */}
        {switchingProject && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <div className="animate-spin h-4 w-4 border-2 border-t-transparent border-blue-600 rounded-full mr-3"></div>
              <span className="text-blue-700 text-sm font-medium">正在切换项目...</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* 项目进度统计概览 */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <TrendingUpIcon className="h-5 w-5 mr-2 text-blue-600" />
                {selectedWorkItem ? `${selectedWorkItem.name} 工作项进度概览` : '项目进度概览'}
              </h3>
              <div className="flex items-center gap-2">
                {!selectedWorkItem && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                    💡 点击工作项查看详细进度
                  </span>
                )}
                {selectedWorkItem && (
                  <button
                    onClick={() => setSelectedWorkItem(null)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    返回项目概览
                  </button>
                )}
              </div>
            </div>

            {(() => {
              // 根据选中的工作项确定要统计的数据范围和计算进度
              let itemsToAnalyze: WorkItem[];
              let overallProgress: number;

              if (selectedWorkItem) {
                // 如果选中了工作项，直接使用该工作项的计算进度
                overallProgress = getItemProgress(selectedWorkItem);

                // 统计该工作项及其所有子项的状态分布
                const collectAllChildren = (item: WorkItem): WorkItem[] => {
                  const result = [item];
                  if (item.children && Array.isArray(item.children) && item.children.length > 0) {
                    item.children.forEach(child => {
                      if (child) {
                        result.push(...collectAllChildren(child));
                      }
                    });
                  }
                  return result;
                };
                itemsToAnalyze = collectAllChildren(selectedWorkItem);
              } else {
                // 如果没有选中工作项，计算项目整体进度
                const currentItems = selectedStatuses.length > 0 ? filteredWorkItems : shareData.work_items;
                itemsToAnalyze = Array.isArray(currentItems) ? currentItems : [];

                // 计算顶级工作项的加权平均进度（复用各工作项的进度计算逻辑）
                if (itemsToAnalyze.length > 0) {
                  const totalProgress = itemsToAnalyze.reduce((sum, item) => {
                    return sum + getItemProgress(item);
                  }, 0);
                  overallProgress = totalProgress / itemsToAnalyze.length;
                } else {
                  overallProgress = 0;
                }
              }

              // 统计状态分布（用于显示各状态的数量）
              const statusCounts = STATUS_OPTIONS.reduce((acc, option) => {
                acc[option.value] = 0;
                return acc;
              }, {} as Record<string, number>);

              // 统计工作项状态（不需要递归，因为itemsToAnalyze已经包含了所有需要统计的项）
              if (Array.isArray(itemsToAnalyze)) {
                itemsToAnalyze.forEach(item => {
                  if (item && typeof item === 'object') {
                    if (item.status && statusCounts.hasOwnProperty(item.status)) {
                      statusCounts[item.status]++;
                    } else {
                      statusCounts['未开始']++;
                    }
                  }
                });
              }
              const totalCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  {/* 整体进度 */}
                  <div className="col-span-2 sm:col-span-4 lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-700 mb-1">
                      {selectedWorkItem ? '工作项进度' : '整体进度'}
                    </div>
                    <ProgressIndicator
                      progress={overallProgress}
                      size="md"
                      showBar={true}
                      showText={true}
                    />
                    <div className="text-xs text-blue-600 mt-1">
                      共 {totalCount} 个工作项
                    </div>
                  </div>

                  {/* 各状态统计 */}
                  {STATUS_OPTIONS.map(option => (
                    <div key={option.value} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-700 mb-1">{option.value}</div>
                      <div className="text-2xl font-bold text-gray-900">{statusCounts[option.value]}</div>
                      <div className="text-xs text-gray-500">
                        {totalCount > 0 ? Math.round((statusCounts[option.value] / totalCount) * 100) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 控制栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-4">
                {/* 层级展开控制 */}
                <div className="flex items-center">
                  <select
                    value={expandLevel}
                    onChange={(e) => handleExpandLevelChange(parseInt(e.target.value))}
                    className="px-4 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md transition-colors"
                  >
                    <option value="0">仅展开1级</option>
                    <option value="1">展开到2级</option>
                    <option value="2">展开到3级</option>
                    <option value="3">展开到4级</option>
                    <option value="4">展开全部</option>
                  </select>
                </div>

                {/* 工作状态筛选下拉菜单 */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusFilter(!showStatusFilter)}
                    className="px-4 py-2 text-sm font-medium flex items-center bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md transition-colors"
                  >
                    <ClockIcon className="h-4 w-4 mr-1" />
                    工作状态筛选
                    {selectedStatuses.length > 0 && (
                      <span className="ml-1 bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                        {selectedStatuses.length}
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </button>

                  {showStatusFilter && (
                    <div
                      ref={statusFilterRef}
                      className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-1 py-1 w-52 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                    >
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-xs font-medium text-gray-500">选择工作状态</p>
                      </div>

                      {STATUS_OPTIONS.map(option => (
                        <div key={option.value} className="px-3 py-2 flex items-center">
                          <input
                            type="checkbox"
                            id={`status-filter-${option.value}`}
                            checked={selectedStatuses.includes(option.value)}
                            onChange={() => handleStatusFilterToggle(option.value)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                          />
                          <label
                            htmlFor={`status-filter-${option.value}`}
                            className="ml-2 flex items-center cursor-pointer"
                          >
                            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${option.color.split(' ')[0]}`}></span>
                            <span className="text-sm text-gray-700">{option.value}</span>
                          </label>
                        </div>
                      ))}

                      <div className="border-t border-gray-100 mt-1 pt-1 px-3 py-2">
                        <button
                          onClick={clearStatusFilters}
                          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          清除筛选条件
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 显示已选筛选条件 */}
            {selectedStatuses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 bg-blue-50 p-2 rounded-md border border-blue-100">
                <span className="text-xs text-blue-700">已筛选:</span>
                {selectedStatuses.map(status => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white text-blue-700 rounded-md border border-blue-200 text-xs"
                  >
                    {status}
                    <button
                      onClick={() => handleStatusFilterToggle(status)}
                      className="rounded-full p-0.5 hover:bg-blue-100 text-blue-500"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={clearStatusFilters}
                  className="text-xs text-blue-600 hover:text-blue-800 ml-2"
                >
                  清除全部
                </button>
                <span className="text-xs text-blue-700 ml-auto">
                  注意：仅显示符合筛选条件的工作项
                </span>
              </div>
            )}

          {/* 工作分解列表 */}
          <div className="space-y-2">
            {currentItems.length > 0 ? (
              currentItems.map(item => renderWorkItem(item, 0))
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <div className="text-gray-400 text-6xl mb-4">📋</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">暂无匹配的工作项</h3>
                <p className="text-gray-600">尝试调整筛选条件</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
