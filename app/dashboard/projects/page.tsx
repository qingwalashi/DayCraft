"use client";

import { useState, useEffect } from "react";
import { PlusIcon, SearchIcon, PencilIcon, TrashIcon, CheckIcon, XIcon, Loader2Icon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { toast } from "sonner";
import { projectSchema, type ProjectFormValues } from "@/lib/validators/projects";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

interface ProjectFormData {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<ProjectFormData>({ 
    name: "", 
    code: "",
    description: "", 
    is_active: true 
  });
  
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
  useEffect(() => {
    if (!user) return;
    
    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          throw error;
        }
        
        setProjects(data || []);
      } catch (error) {
        console.error('获取项目失败', error);
        toast.error('获取项目失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [user, supabase]);

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
      
      setProjects([insertedProject, ...projects]);
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">项目管理</h1>
        <button
          onClick={() => setIsAddingProject(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          disabled={isLoading}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          <span>添加项目</span>
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="搜索项目名称、编号或描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 添加项目表单 */}
      {isAddingProject && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">添加新项目</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                项目名称 <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                {...register("name")}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                项目编号 <span className="text-red-500">*</span>
              </label>
              <input
                id="code"
                type="text"
                {...register("code")}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {errors.code && (
                <p className="mt-1 text-sm text-red-600">{errors.code.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                项目描述
              </label>
              <textarea
                id="description"
                rows={3}
                {...register("description")}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>
            <div className="flex items-center">
              <input
                id="is_active"
                type="checkbox"
                {...register("is_active")}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                项目活跃
              </label>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setIsAddingProject(false);
                  reset();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 项目列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h2 className="text-lg font-medium">项目列表</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center items-center p-12">
            <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    项目名称
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    项目编号
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    项目描述
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProjects.length > 0 ? (
                  filteredProjects.map((project) => (
                    <tr key={project.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingProjectId === project.id ? (
                          <input
                            type="text"
                            className="block w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={editProject.name}
                            onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
                          />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{project.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingProjectId === project.id ? (
                          <input
                            type="text"
                            className="block w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={editProject.code}
                            onChange={(e) => setEditProject({ ...editProject, code: e.target.value })}
                          />
                        ) : (
                          <div className="text-sm text-blue-600 font-mono">{project.code}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingProjectId === project.id ? (
                          <textarea
                            rows={2}
                            className="block w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={editProject.description}
                            onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
                          />
                        ) : (
                          <div className="text-sm text-gray-500 line-clamp-2">{project.description || '无描述'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingProjectId === project.id ? (
                          <label className="inline-flex items-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={editProject.is_active}
                              onChange={(e) => setEditProject({ ...editProject, is_active: e.target.checked })}
                            />
                            <span className="ml-2 text-sm text-gray-900">
                              {editProject.is_active ? '活跃' : '未活跃'}
                            </span>
                          </label>
                        ) : (
                          <span 
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              project.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                            onClick={() => toggleProjectStatus(project.id, project.is_active)}
                            style={{ cursor: 'pointer' }}
                          >
                            {project.is_active ? '活跃' : '未活跃'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingProjectId === project.id ? (
                          <div className="flex justify-end space-x-2">
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
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => startEditingProject(project)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => deleteProject(project.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      {searchTerm ? "没有找到匹配的项目" : "暂无项目数据，请点击\"添加项目\"按钮创建新项目"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
} 