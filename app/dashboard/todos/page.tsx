"use client";

import { useState, useEffect } from "react";
import { PlusIcon, SaveIcon, TrashIcon, CalendarIcon, ChevronRightIcon, ChevronDownIcon, AlertCircleIcon, MenuIcon, ChevronLeftIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高", color: "text-red-600" },
  { value: "medium", label: "中", color: "text-yellow-600" },
  { value: "low", label: "低", color: "text-green-600" },
];

// 类型定义
interface Project {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  todoCount?: number; // 添加待办数量字段
}
interface Todo {
  id?: string;
  content: string;
  priority: string;
  due_date: string;
  is_completed?: boolean;
}

export default function TodosPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodos, setNewTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // 在移动设备上默认隐藏侧边栏
      if (window.innerWidth < 768) {
        setSidebarVisible(false);
      } else {
        setSidebarVisible(true);
      }
    };
    
    // 初始检查
    checkMobile();
    
    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载活跃项目和每个项目的待办数量
  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      try {
        // 获取所有活跃项目
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, code, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        
        if (projectsError) {
          setError("加载项目失败");
          setIsLoading(false);
          return;
        }
        
        // 确保 projectsData 有正确的类型
        const typedProjectsData = projectsData as unknown as Project[];
        
        // 获取每个项目的待办数量
        const projectsWithTodoCount = await Promise.all(
          (typedProjectsData || []).map(async (project) => {
            const { count, error: countError } = await supabase
              .from("project_todos")
              .select("id", { count: 'exact', head: true })
              .eq("user_id", user.id)
              .eq("project_id", project.id);
            
            return {
              ...project,
              todoCount: count || 0
            };
          })
        );
        
        setProjects(projectsWithTodoCount);
      } catch (err) {
        console.error("加载项目和待办数量失败:", err);
        setError("加载项目失败");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, supabase]);

  // 加载选中项目的待办
  useEffect(() => {
    if (!user || !selectedProjectId) return;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, is_completed")
        .eq("user_id", user.id)
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: true });
      setIsLoading(false);
      if (error) {
        setError("加载待办失败");
        return;
      }
      setTodos((data || []) as Todo[]);
      setNewTodos([]);
    })();
  }, [user, selectedProjectId, supabase]);

  // 添加新待办
  const handleAddTodo = () => {
    if (newTodos.length + todos.length >= 10) {
      setError("每个项目最多只能添加10个待办");
      return;
    }
    setNewTodos([
      ...newTodos,
      {
        content: "",
        priority: "medium",
        due_date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
        is_completed: false,
      },
    ]);
    setError(null);
  };

  // 编辑新待办内容
  const handleNewTodoChange = (idx: number, field: keyof Todo, value: any) => {
    setNewTodos((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      return arr;
    });
  };

  // 删除新待办
  const handleRemoveNewTodo = (idx: number) => {
    setNewTodos((prev) => prev.filter((_, i) => i !== idx));
  };

  // 编辑已存在待办
  const handleTodoChange = (idx: number, field: keyof Todo, value: any) => {
    setTodos((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      return arr;
    });
  };

  // 删除已存在待办
  const handleRemoveTodo = async (id?: string) => {
    if (!id) return;
    setIsLoading(true);
    try {
      await supabase.from("project_todos").delete().eq("id", id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      
      // 更新项目待办数量
      await updateProjectTodoCount();
    } catch (err) {
      console.error("删除待办失败:", err);
      setError("删除失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 保存后更新项目列表中的待办数量
  const updateProjectTodoCount = async () => {
    if (!user || !selectedProjectId) return;
    
    try {
      const { count } = await supabase
        .from("project_todos")
        .select("id", { count: 'exact', head: true })
        .eq("user_id", user.id)
        .eq("project_id", selectedProjectId);
      
      setProjects(prev => prev.map(project => 
        project.id === selectedProjectId 
          ? { ...project, todoCount: count || 0 } 
          : project
      ));
    } catch (err) {
      console.error("更新待办数量失败:", err);
    }
  };

  // 保存所有待办
  const handleSave = async () => {
    if (!selectedProjectId || !user) return;
    setIsLoading(true);
    setError(null);
    
    try {
      // 新增
      for (const todo of newTodos) {
        if (!todo.content.trim()) continue;
        await supabase.from("project_todos").insert({
          user_id: user.id,
          project_id: selectedProjectId,
          content: todo.content,
          priority: todo.priority,
          due_date: todo.due_date,
        });
      }
      
      // 更新
      for (const todo of todos) {
        if (!todo.id) continue;
        await supabase.from("project_todos").update({
          content: todo.content,
          priority: todo.priority,
          due_date: todo.due_date,
          is_completed: todo.is_completed,
        }).eq("id", todo.id);
      }
      
      // 重新加载 - 修改排序为降序，使新添加的显示在最前面
      const { data } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, is_completed")
        .eq("user_id", user.id)
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: false });
      
      setTodos((data || []) as Todo[]);
      setNewTodos([]);
      
      // 更新项目待办数量
      await updateProjectTodoCount();
    } catch (error) {
      console.error("保存待办失败:", error);
      setError("保存失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    if (isMobile) {
      setSidebarVisible(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[600px] bg-gray-50 rounded-lg shadow border overflow-hidden">
      {/* 移动端项目选择按钮 - 只保留一个汉堡按钮 */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b">
        <h2 className="text-lg font-bold text-gray-800">待办管理</h2>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          {sidebarVisible ? <ChevronLeftIcon size={20} /> : <MenuIcon size={20} />}
        </button>
      </div>

      {/* 左侧项目树 - 响应式 */}
      <div className={`
        ${sidebarVisible ? 'block' : 'hidden'} 
        md:block w-full md:w-80 border-r bg-white overflow-y-auto flex-shrink-0
        ${isMobile ? 'absolute z-10 top-16 left-0 right-0 bottom-0 bg-white' : ''}
      `}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">项目列表</h2>
            {isMobile && (
              <button
                onClick={toggleSidebar}
                className="p-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <ChevronLeftIcon size={18} />
              </button>
            )}
          </div>
          <ul>
            {projects.map((project) => (
              <li key={project.id} className="mb-2">
                <button
                  className={`flex items-center w-full px-3 py-2 rounded-lg transition font-medium text-sm
                    ${selectedProjectId === project.id ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"}`}
                  onClick={() => handleProjectSelect(project.id)}
                  title={project.name}
                >
                  <ChevronRightIcon className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-left max-w-[160px]">{project.name}</span>
                  <div className="flex items-center">
                    {project.todoCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-1 mr-2 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                        {project.todoCount}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 flex-shrink-0">({project.code})</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 右侧待办编辑区 - 响应式 */}
      <div className={`flex-1 p-4 md:p-8 overflow-y-auto flex flex-col ${!sidebarVisible || !isMobile ? 'block' : 'hidden md:block'}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl md:text-2xl font-bold text-gray-900 ${!sidebarVisible && isMobile ? '' : 'hidden md:block'}`}>待办管理</h2>
          
          {/* 操作按钮 - 改为类似日报编辑页面的样式 */}
          <div className="flex gap-2 md:gap-3 ml-auto">
            {selectedProjectId && (
              <>
                <button
                  className="flex items-center px-4 py-2 border rounded-md text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 transition"
                  onClick={handleAddTodo}
                  disabled={newTodos.length + todos.length >= 10}
                >
                  <PlusIcon className="h-5 w-5 mr-2" /> 
                  <span>添加待办</span>
                </button>
                <button
                  className="flex items-center px-4 py-2 border rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
                  onClick={handleSave}
                  disabled={isLoading}
                >
                  <SaveIcon className="h-5 w-5 mr-2" /> 
                  <span>保存</span>
                </button>
              </>
            )}
          </div>
        </div>
        {selectedProjectId ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-4">
              <span className="text-base md:text-lg font-semibold text-gray-700">{projects.find(p => p.id === selectedProjectId)?.name}</span>
              {(newTodos.length + todos.length >= 10) && (
                <span className="text-xs md:text-sm text-red-500 flex items-center"><AlertCircleIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />每个项目最多只能添加10个待办</span>
              )}
              {error && <span className="text-xs md:text-sm text-red-500 flex items-center"><AlertCircleIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />{error}</span>}
            </div>
            <div className="space-y-3">
              {/* 新增待办 - 显示在第一行，宽度与已保存待办一致 */}
              {newTodos.map((todo, idx) => (
                <div key={"new-"+idx} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 bg-white border border-blue-200 rounded-lg px-3 py-3 md:px-4 md:py-3 shadow-sm">
                  <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full">
                    <input
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                      placeholder="输入待办内容"
                      value={todo.content}
                      onChange={e => handleNewTodoChange(idx, "content", e.target.value)}
                    />
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                      <select
                        className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        value={todo.priority}
                        onChange={e => handleNewTodoChange(idx, "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="w-32 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        value={todo.due_date}
                        onChange={e => handleNewTodoChange(idx, "due_date", e.target.value)}
                      />
                      <button className="text-red-500 hover:text-red-700 p-2 rounded-lg transition" onClick={() => handleRemoveNewTodo(idx)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {/* 已有待办 */}
              {todos.map((todo, idx) => (
                <div key={todo.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 bg-white border border-gray-200 rounded-lg px-3 py-3 md:px-4 md:py-3 shadow-sm">
                  <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full">
                    <input
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                      value={todo.content}
                      onChange={e => handleTodoChange(idx, "content", e.target.value)}
                    />
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                      <select
                        className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        value={todo.priority}
                        onChange={e => handleTodoChange(idx, "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="w-32 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        value={todo.due_date}
                        onChange={e => handleTodoChange(idx, "due_date", e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center text-xs text-gray-600 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="mr-1 accent-blue-500"
                            checked={todo.is_completed}
                            onChange={e => handleTodoChange(idx, "is_completed", e.target.checked)}
                          /> 完成
                        </label>
                        <button className="text-red-500 hover:text-red-700 p-2 rounded-lg transition" onClick={() => handleRemoveTodo(todo.id)}>
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-gray-400 mt-10 md:mt-20 text-center text-base md:text-lg">请选择左侧项目后进行待办管理</div>
        )}
      </div>
    </div>
  );
} 