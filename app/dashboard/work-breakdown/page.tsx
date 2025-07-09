"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { toast } from "sonner";
import { PlusIcon, ChevronDownIcon, ChevronRightIcon, XIcon, PencilIcon, TrashIcon } from "lucide-react";

// 工作项类型
interface WorkItem {
  id: string;
  name: string;
  description: string;
  children: WorkItem[];
  isExpanded?: boolean;
  isEditing?: boolean;
}

export default function WorkBreakdownPage() {
  const { user } = useAuth();
  const supabase = createClient();
  
  // 状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  
  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
      
      // 如果有活跃项目，默认选择第一个
      if (data && data.length > 0) {
        setSelectedProject(data[0] as Project);
      }
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // 初始加载
  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // 添加根级工作项
  const addRootWorkItem = () => {
    const newItem: WorkItem = {
      id: `temp-${Date.now()}`,
      name: "新工作项",
      description: "",
      children: [],
      isExpanded: true,
      isEditing: true
    };
    
    setWorkItems([...workItems, newItem]);
  };
  
  // 添加子工作项
  const addChildWorkItem = (parentId: string) => {
    const newItem: WorkItem = {
      id: `temp-${Date.now()}`,
      name: "新子工作项",
      description: "",
      children: [],
      isEditing: true
    };
    
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        if (item.id === parentId) {
          return {
            ...item,
            isExpanded: true,
            children: [...item.children, newItem]
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    setWorkItems(updateWorkItems(workItems));
  };
  
  // 切换展开/折叠
  const toggleExpand = (id: string) => {
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return {
            ...item,
            isExpanded: !item.isExpanded
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    setWorkItems(updateWorkItems(workItems));
  };
  
  // 切换编辑模式
  const toggleEdit = (id: string) => {
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return {
            ...item,
            isEditing: !item.isEditing
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    setWorkItems(updateWorkItems(workItems));
  };
  
  // 更新工作项
  const updateWorkItem = (id: string, name: string, description: string) => {
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return {
            ...item,
            name,
            description,
            isEditing: false
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    setWorkItems(updateWorkItems(workItems));
  };
  
  // 删除工作项
  const deleteWorkItem = (id: string) => {
    const removeWorkItem = (items: WorkItem[]): WorkItem[] => {
      return items.filter(item => {
        if (item.id === id) {
          return false;
        }
        if (item.children.length > 0) {
          item.children = removeWorkItem(item.children);
        }
        return true;
      });
    };
    
    setWorkItems(removeWorkItem(workItems));
  };
  
  // 渲染工作项组件
  const renderWorkItem = (item: WorkItem, level: number) => {
    // 限制最多5级
    const canAddChildren = level < 5;
    
    return (
      <div key={item.id} className="mb-2">
        <div className={`flex items-start p-3 bg-white rounded-lg shadow border-l-4 ${
          level === 0 ? 'border-l-blue-500' :
          level === 1 ? 'border-l-green-500' :
          level === 2 ? 'border-l-yellow-500' :
          level === 3 ? 'border-l-purple-500' :
          'border-l-red-500'
        }`}>
          <div className="flex-grow">
            {item.isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue={item.name}
                  placeholder="工作项名称"
                  id={`name-${item.id}`}
                />
                <textarea
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue={item.description}
                  placeholder="工作描述（可选）"
                  rows={3}
                  id={`desc-${item.id}`}
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => updateWorkItem(
                      item.id,
                      (document.getElementById(`name-${item.id}`) as HTMLInputElement).value,
                      (document.getElementById(`desc-${item.id}`) as HTMLTextAreaElement).value
                    )}
                    className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => toggleEdit(item.id)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center">
                  {item.children.length > 0 && (
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="mr-2 p-1 rounded-md hover:bg-gray-100"
                    >
                      {item.isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <h3 className="font-medium">{item.name}</h3>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                )}
                <div className="flex space-x-2 mt-2">
                  {canAddChildren && (
                    <button
                      onClick={() => addChildWorkItem(item.id)}
                      className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center"
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      添加子工作
                    </button>
                  )}
                  <button
                    onClick={() => toggleEdit(item.id)}
                    className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 flex items-center"
                  >
                    <PencilIcon className="h-3 w-3 mr-1" />
                    编辑
                  </button>
                  <button
                    onClick={() => deleteWorkItem(item.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center"
                  >
                    <TrashIcon className="h-3 w-3 mr-1" />
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {item.children.length > 0 && item.isExpanded && (
          <div className={`pl-6 mt-2 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
            {item.children.map(child => renderWorkItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">工作分解</h1>
        
        {/* 项目选择器 */}
        <div className="w-full sm:w-64">
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedProject?.id || ""}
            onChange={(e) => {
              const project = projects.find(p => p.id === e.target.value);
              setSelectedProject(project || null);
            }}
          >
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">加载中...</span>
        </div>
      ) : (
        <div>
          {selectedProject ? (
            <div>
              <div className="bg-white p-4 rounded-lg shadow mb-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">
                    {selectedProject.name} 工作分解
                  </h2>
                  <button
                    onClick={addRootWorkItem}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    添加工作项
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedProject.description || '无项目描述'}
                </p>
              </div>
              
              {workItems.length > 0 ? (
                <div className="space-y-4">
                  {workItems.map(item => renderWorkItem(item, 0))}
                </div>
              ) : (
                <div className="bg-white p-8 rounded-lg shadow text-center">
                  <p className="text-gray-500 mb-4">当前项目没有工作分解项</p>
                  <button
                    onClick={addRootWorkItem}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    添加工作项
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <p className="text-gray-500 mb-4">没有可用的活跃项目</p>
              <a
                href="/dashboard/projects"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                创建新项目
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 