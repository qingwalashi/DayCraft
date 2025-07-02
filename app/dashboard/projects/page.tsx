"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PlusIcon, SearchIcon, PencilIcon, TrashIcon, CheckIcon, XIcon, Loader2Icon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { toast } from "sonner";
import { projectSchema, type ProjectFormValues } from "@/lib/validators/projects";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { usePersistentState } from '@/lib/utils/page-persistence';

interface ProjectFormData {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  
  // 使用持久化状态替代普通状态
  const [projects, setProjects] = usePersistentState<Project[]>('projects-page-projects', []);
  const [searchTerm, setSearchTerm] = usePersistentState<string>('projects-page-search', "");
  const [isAddingProject, setIsAddingProject] = usePersistentState<boolean>('projects-page-adding', false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProjectId, setEditingProjectId] = usePersistentState<string | null>('projects-page-editing-id', null);
  const [editProject, setEditProject] = usePersistentState<ProjectFormData>('projects-page-edit-form', { 
    name: "", 
    code: "",
    description: "", 
    is_active: true 
  });
  
  // 添加数据已加载的引用
  const dataLoadedRef = useRef(false);
  // 添加最后数据加载时间戳
  const lastLoadTimeRef = useRef<number>(0);
  // 数据刷新间隔（毫秒），设置为5分钟
  const DATA_REFRESH_INTERVAL = 5 * 60 * 1000;
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      is_active: true
    }
  });

  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    if (dataLoadedRef.current) {
      console.log('项目数据已加载，跳过重新获取');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
      dataLoadedRef.current = true;
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, setProjects, user]);

  useEffect(() => {
    if (!user) return;
    
    // 检查数据是否需要重新加载
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    
    // 如果数据未加载或超过刷新间隔，则加载数据
    if (!dataLoadedRef.current || timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
      fetchProjects();
      lastLoadTimeRef.current = now;
    } else {
      // 如果数据已加载且未超过刷新间隔，则直接设置加载状态为false
      setIsLoading(false);
    }
  }, [user, fetchProjects]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('项目页面恢复可见，检查数据状态');
          // 只检查数据是否存在，不重新加载
          if (user && projects.length === 0) {
            console.log('项目数据不存在，重新加载');
            dataLoadedRef.current = false;
            fetchProjects();
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, projects, fetchProjects]);

  // 搜索过滤项目
  const filteredProjects = projects.filter(
    project =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 添加新项目
  const onSubmit = async (data: ProjectFormValues) => {
    if (!user) return;
    
    try {
      const newProject = {
        name: data.name,
        code: data.code,
        description: data.description || '',
        is_active: data.is_active,
        user_id: user.id
      };
      
      // 检查项目编号是否已存在
      const { data: existingProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('code', data.code)
        .eq('user_id', user.id);
      
      if (existingProjects && existingProjects.length > 0) {
        toast.error('项目编号已存在，请使用其他编号');
        return;
      }
      
      const { data: insertedProject, error } = await supabase
        .from('projects')
        .insert(newProject)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      setProjects([insertedProject as Project, ...projects]);
      setIsAddingProject(false);
      reset();
      toast.success('项目创建成功');
    } catch (error) {
      console.error('创建项目失败', error);
      toast.error('创建项目失败');
    }
  };

  // 开始编辑项目
  const startEditingProject = (project: Project) => {
    setEditingProjectId(project.id);
    setEditProject({ 
      name: project.name,
      code: project.code, 
      description: project.description || "", 
      is_active: project.is_active 
    });
  };

  // 保存编辑后的项目
  const saveEditedProject = async () => {
    if (!editingProjectId || !user) return;
    
    try {
      // 检查项目编号是否已被其他项目使用
      const { data: existingProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('code', editProject.code)
        .eq('user_id', user.id)
        .neq('id', editingProjectId);
      
      if (existingProjects && existingProjects.length > 0) {
        toast.error('项目编号已被其他项目使用，请更换');
        return;
      }
      
      const { error } = await supabase
        .from('projects')
        .update({
          name: editProject.name,
          code: editProject.code,
          description: editProject.description,
          is_active: editProject.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingProjectId)
        .eq('user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      setProjects(
        projects.map(p =>
          p.id === editingProjectId 
            ? { ...p, ...editProject } 
            : p
        )
      );
      setEditingProjectId(null);
      toast.success('项目更新成功');
    } catch (error) {
      console.error('更新项目失败', error);
      toast.error('更新项目失败');
    }
  };

  // 取消编辑
  const cancelEditing = () => {
    setEditingProjectId(null);
  };

  // 删除项目
  const deleteProject = async (id: string) => {
    if (!user) return;
    
    if (confirm("确定要删除此项目吗？删除后将无法恢复。")) {
      try {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        
        if (error) {
          throw error;
        }
        
        setProjects(projects.filter(p => p.id !== id));
        toast.success('项目已删除');
      } catch (error) {
        console.error('删除项目失败', error);
        toast.error('删除项目失败');
      }
    }
  };

  // 切换项目状态
  const toggleProjectStatus = async (id: string, currentStatus: boolean) => {
    if (!user) return;
    
    try {
      const newStatus = !currentStatus;
      const { error } = await supabase
        .from('projects')
        .update({
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      setProjects(
        projects.map(p =>
          p.id === id 
            ? { ...p, is_active: newStatus } 
            : p
        )
      );
      
      toast.success(`项目已${newStatus ? '激活' : '停用'}`);
    } catch (error) {
      console.error('更新项目状态失败', error);
      toast.error('更新项目状态失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">项目管理</h1>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* 搜索框 */}
          <div className="relative flex-grow sm:flex-grow-0 sm:min-w-[200px]">
            <input
              type="text"
              placeholder="搜索项目..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          {/* 添加项目按钮 */}
          <button
            onClick={() => setIsAddingProject(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            <span>添加项目</span>
          </button>
        </div>
      </div>

      {/* 添加项目表单 */}
      {isAddingProject && (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6 animate-fade-in">
          <h2 className="text-lg font-medium text-gray-900 mb-4">添加新项目</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="输入项目名称"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  项目编号 <span className="text-red-500">*</span>
                </label>
                <input
                  id="code"
                  type="text"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.code ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="输入项目编号"
                  {...register("code")}
                />
                {errors.code && (
                  <p className="mt-1 text-sm text-red-500">{errors.code.message}</p>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                项目描述
              </label>
              <textarea
                id="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="输入项目描述（可选）"
                {...register("description")}
              ></textarea>
            </div>
            <div className="flex items-center">
              <input
                id="is_active"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                {...register("is_active")}
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                项目活跃
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                保存项目
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingProject(false);
                  reset();
                }}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 项目列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">暂无项目数据</p>
            <button
              onClick={() => setIsAddingProject(true)}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              添加第一个项目
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    项目名称
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    项目编号
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    描述
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    状态
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className={!project.is_active ? "bg-gray-50" : undefined}>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">{project.name}</div>
                        {/* 移动端显示项目编号和状态 */}
                        <div className="text-xs text-gray-500 mt-1 sm:hidden">
                          {project.code} · {project.is_active ? "活跃" : "未活跃"}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-gray-900">{project.code}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      <div className="text-sm text-gray-500 line-clamp-2">{project.description || "-"}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          project.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {project.is_active ? "活跃" : "未活跃"}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingProjectId === project.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={saveEditedProject}
                            className="text-green-600 hover:text-green-900"
                          >
                            <CheckIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="text-red-600 hover:text-red-900"
                          >
                            <XIcon className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEditingProject(project)}
                            className="text-blue-600 hover:text-blue-900"
                            title="编辑项目"
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            className="text-red-600 hover:text-red-900"
                            title="删除项目"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => toggleProjectStatus(project.id, project.is_active)}
                            className={`${
                              project.is_active ? "text-gray-600" : "text-green-600"
                            } hover:text-gray-900`}
                            title={project.is_active ? "设为未活跃" : "设为活跃"}
                          >
                            {project.is_active ? (
                              <XIcon className="h-5 w-5" />
                            ) : (
                              <CheckIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 编辑项目弹窗 */}
      {editingProjectId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">编辑项目</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                    项目名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={editProject.name}
                    onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-code" className="block text-sm font-medium text-gray-700 mb-1">
                    项目编号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-code"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={editProject.code}
                    onChange={(e) => setEditProject({ ...editProject, code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">
                    项目描述
                  </label>
                  <textarea
                    id="edit-description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={editProject.description}
                    onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
                  ></textarea>
                </div>
                <div className="flex items-center">
                  <input
                    id="edit-is_active"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={editProject.is_active}
                    onChange={(e) => setEditProject({ ...editProject, is_active: e.target.checked })}
                  />
                  <label htmlFor="edit-is_active" className="ml-2 block text-sm text-gray-900">
                    项目活跃
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEditedProject}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                保存更改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}