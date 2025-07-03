"use client";

import { useState, useEffect } from "react";
import { PlusIcon, SaveIcon, TrashIcon, CalendarIcon, ChevronRightIcon, ChevronDownIcon, AlertCircleIcon, MenuIcon, ChevronLeftIcon, Loader2Icon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高", color: "text-red-600" },
  { value: "medium", label: "中", color: "text-yellow-600" },
  { value: "low", label: "低", color: "text-green-600" },
];

// 新增：待办状态选项
const STATUS_OPTIONS = [
  { value: "not_started", label: "未开始", color: "text-gray-600", bgColor: "bg-gray-100" },
  { value: "in_progress", label: "进行中", color: "text-blue-600", bgColor: "bg-blue-100" },
  { value: "completed", label: "已完成", color: "text-green-600", bgColor: "bg-green-100" },
];

// 类型定义
interface Project {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  todoCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
}
interface Todo {
  id?: string;
  content: string;
  priority: string;
  due_date: string;
  status?: string;
}

// 新增：全部按钮的常量
const ALL_PROJECTS = "ALL_PROJECTS";

export default function TodosPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(ALL_PROJECTS);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodos, setNewTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  // 新增：全部视图的待办
  const [allTodos, setAllTodos] = useState<(Todo & { projectName: string })[]>([]);
  // 新增：全部视图编辑状态
  const [allTodosEdited, setAllTodosEdited] = useState<(Todo & { projectName: string })[]>([]);
  const [isAllTodosSaving, setIsAllTodosSaving] = useState(false);
  // 新增：全部视图优先级统计
  const [allPriorityCount, setAllPriorityCount] = useState({ high: 0, medium: 0, low: 0 });

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
        const typedProjectsData = (projectsData || []) as Project[];
        
        // 获取每个项目的待办数量（按优先级统计）
        const projectsWithTodoCount = await Promise.all(
          (typedProjectsData || []).map(async (project) => {
            // 统计各优先级数量
            const getCount = async (priority: string) => {
              const { count } = await supabase
                .from("project_todos")
                .select("id", { count: 'exact', head: true })
                .eq("user_id", user.id)
                .eq("project_id", project.id)
                .eq("priority", priority)
                .not("status", "eq", "completed");
              return count || 0;
            };
            const [highCount, mediumCount, lowCount] = await Promise.all([
              getCount("high"),
              getCount("medium"),
              getCount("low")
            ]);
            // 总数
            const todoCount = highCount + mediumCount + lowCount;
            return {
              ...project,
              todoCount,
              highCount,
              mediumCount,
              lowCount
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
    if (!user || !selectedProjectId || selectedProjectId === ALL_PROJECTS) return;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status")
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
        status: "not_started",
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
    if (!user) return;
    if (!id) return;
    setIsLoading(true);
    try {
      await supabase.from("project_todos").delete().eq("id", id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      // 检查该项目下是否还有未完成的待办
      const { count } = await supabase
        .from("project_todos")
        .select("id", { count: 'exact', head: true })
        .eq("user_id", user.id)
        .eq("project_id", selectedProjectId)
        .not("status", "eq", "completed");
      if ((count || 0) === 0) {
        setProjectToDelete(selectedProjectId);
        setShowDeleteProjectConfirm(true);
      }
      // 刷新项目统计
      await updateAllProjectTodoCounts();
    } catch (err) {
      console.error("删除待办失败:", err);
      setError("删除失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 修复linter警告，避免undefined
  const safeCount = (count?: number) => typeof count === 'number' ? count : 0;

  // 修改updateProjectTodoCount为刷新所有项目统计
  const updateAllProjectTodoCounts = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
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
      const typedProjectsData = (projectsData || []) as Project[];
      const projectMap = typedProjectsData.reduce((acc: Record<string, string>, p: Project) => {
        acc[p.id] = p.name;
        return acc;
      }, {});
      const projectsWithTodoCount = await Promise.all(
        (typedProjectsData || []).map(async (project) => {
          const getCount = async (priority: string) => {
            const { count } = await supabase
              .from("project_todos")
              .select("id", { count: 'exact', head: true })
              .eq("user_id", user.id)
              .eq("project_id", project.id)
              .eq("priority", priority)
              .not("status", "eq", "completed");
            return count || 0;
          };
          const [highCount, mediumCount, lowCount] = await Promise.all([
            getCount("high"),
            getCount("medium"),
            getCount("low")
          ]);
          const todoCount = highCount + mediumCount + lowCount;
          return {
            ...project,
            todoCount,
            highCount,
            mediumCount,
            lowCount
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
  };

  // 保存所有待办
  const handleSave = async () => {
    if (!selectedProjectId || !user) return;
    setIsSaving(true);
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
          status: todo.status || 'not_started',
        });
      }
      
      // 更新
      for (const todo of todos) {
        if (!todo.id) continue;
        await supabase.from("project_todos").update({
          content: todo.content,
          priority: todo.priority,
          due_date: todo.due_date,
          status: todo.status,
        }).eq("id", todo.id);
      }
      
      // 重新加载
      const { data } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status")
        .eq("user_id", user.id)
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: false });
      
      setTodos((data || []) as Todo[]);
      setNewTodos([]);
      
      // 保存后刷新所有项目统计
      await updateAllProjectTodoCounts();
    } catch (error) {
      console.error("保存待办失败:", error);
      setError("保存失败，请重试");
    } finally {
      setIsSaving(false);
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

  // 新增删除项目函数
  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsLoading(true);
    try {
      await supabase.from("projects").delete().eq("id", projectToDelete).eq("user_id", user.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete));
      if (selectedProjectId === projectToDelete) setSelectedProjectId(null);
      setProjectToDelete(null);
      setShowDeleteProjectConfirm(false);
    } catch (err) {
      console.error("删除项目失败:", err);
      setError("删除项目失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 新增：获取本周的起止日期
  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay() || 7; // 周日为0，转为7
    const start = new Date(now);
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  // 新增：加载全部项目的本周待办
  useEffect(() => {
    if (!user || selectedProjectId !== ALL_PROJECTS) return;
    (async () => {
      setIsLoading(true);
      try {
        const { start, end } = getWeekRange();
        // 获取所有活跃项目
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, code, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true);
        if (projectsError) {
          setError("加载项目失败");
          setIsLoading(false);
          return;
        }
        const typedProjectsData = (projectsData || []) as Project[];
        const projectMap = typedProjectsData.reduce((acc: Record<string, string>, p: Project) => {
          acc[p.id] = p.name;
          return acc;
        }, {});
        // 获取所有本周截止的待办
        const { data: todosData, error: todosError } = await supabase
          .from("project_todos")
          .select("id, content, priority, due_date, status, project_id")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true });
        if (todosError) {
          setError("加载待办失败");
          setIsLoading(false);
          return;
        }
        // 组装带项目名的待办
        const todosWithProject = (todosData || []).map((t: any) => ({
          ...t,
          projectName: projectMap[t.project_id] || "",
        }));
        setAllTodos(todosWithProject);
        // 统计优先级数量
        const count = { high: 0, medium: 0, low: 0 };
        for (const t of todosWithProject) {
          if (t.priority === 'high') count.high++;
          else if (t.priority === 'medium') count.medium++;
          else if (t.priority === 'low') count.low++;
        }
        setAllPriorityCount(count);
      } catch (err) {
        setError("加载全部待办失败");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, selectedProjectId, supabase]);

  // 同步 allTodos 到 allTodosEdited
  useEffect(() => {
    setAllTodosEdited(allTodos);
  }, [allTodos]);

  // 编辑全部待办内容/完成情况
  const handleAllTodosChange = (idx: number, field: keyof Todo, value: any) => {
    setAllTodosEdited((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      return arr;
    });
  };

  // 批量保存全部待办
  const handleAllTodosSave = async () => {
    if (!user) return;
    setIsAllTodosSaving(true);
    setError(null);
    try {
      for (const todo of allTodosEdited) {
        if (!todo.id) continue;
        await supabase.from("project_todos").update({
          content: todo.content,
          status: todo.status,
        }).eq("id", todo.id);
      }
      // 保存后刷新
      const { start, end } = getWeekRange();
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, name, code, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true);
      const typedProjectsData = (projectsData || []) as Project[];
      const projectMap = typedProjectsData.reduce((acc: Record<string, string>, p: Project) => {
        acc[p.id] = p.name;
        return acc;
      }, {});
      const { data: todosData } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status, project_id")
        .eq("user_id", user.id)
        .gte("due_date", start.toISOString().slice(0, 10))
        .lte("due_date", end.toISOString().slice(0, 10))
        .order("due_date", { ascending: true });
      const todosWithProject = (todosData || []).map((t: any) => ({
        ...t,
        projectName: projectMap[t.project_id] || "",
      }));
      setAllTodos(todosWithProject);
      setError(null);
    } catch (err) {
      setError("保存失败，请重试");
    } finally {
      setIsAllTodosSaving(false);
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
          <ul className="space-y-2">
            {/* 全部按钮 - 特殊样式突出显示 */}
            <li>
              <button
                className={`flex items-center w-full px-3 py-2.5 rounded-lg transition font-medium text-sm ${selectedProjectId === ALL_PROJECTS ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"}`}
                onClick={() => handleProjectSelect(ALL_PROJECTS)}
                title="全部项目待办"
              >
                <CalendarIcon className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1 text-left">全部</span>
                <div className="flex flex-shrink-0 gap-1">
                  {/* 优先级统计标签 */}
                  {allPriorityCount.high > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">高 {allPriorityCount.high}</span>
                  )}
                  {allPriorityCount.medium > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700">中 {allPriorityCount.medium}</span>
                  )}
                  {allPriorityCount.low > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">低 {allPriorityCount.low}</span>
                  )}
                </div>
              </button>
            </li>
            {/* 项目列表 */}
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  className={`flex items-center w-full px-3 py-2.5 rounded-lg transition font-medium text-sm
                    ${selectedProjectId === project.id ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"}`}
                  onClick={() => handleProjectSelect(project.id)}
                  title={project.name}
                >
                  <ChevronRightIcon className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{project.name}</span>
                  <div className="flex flex-shrink-0 gap-1">
                    {safeCount(project.highCount) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">
                        高 {project.highCount}
                      </span>
                    )}
                    {safeCount(project.mediumCount) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700">
                        中 {project.mediumCount}
                      </span>
                    )}
                    {safeCount(project.lowCount) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">
                        低 {project.lowCount}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 右侧待办编辑区 - 响应式 */}
      <div className={`flex-1 p-4 md:p-8 overflow-y-auto flex flex-col ${!sidebarVisible || !isMobile ? 'block' : 'hidden md:block'}`}>
        {/* 全部视图下，隐藏添加待办和原保存按钮，仅显示全部保存按钮 */}
        {selectedProjectId === ALL_PROJECTS ? null : (
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl md:text-2xl font-bold text-gray-900 ${!sidebarVisible && isMobile ? '' : 'hidden md:block'}`}>待办管理</h2>
            {/* 操作按钮 - 仅非全部视图显示 */}
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
                    className="flex items-center px-4 py-2 border rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition relative"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2Icon className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <SaveIcon className="h-5 w-5 mr-2" />
                    )}
                    <span>{isSaving ? '保存中...' : '保存'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-500 text-lg">加载中...</span>
          </div>
        ) : selectedProjectId === ALL_PROJECTS ? (
          // 全部视图
          <>
            <div className="flex items-center justify-between mb-6">
              <span className="text-xl md:text-2xl font-bold text-gray-900">全部待办</span>
              <button
                className="flex items-center px-4 py-2 border rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition relative"
                onClick={handleAllTodosSave}
                disabled={isAllTodosSaving}
              >
                {isAllTodosSaving ? (
                  <Loader2Icon className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <SaveIcon className="h-5 w-5 mr-2" />
                )}
                <span>{isAllTodosSaving ? '保存中...' : '保存'}</span>
              </button>
            </div>
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
                <span className="ml-2 text-gray-500 text-lg">加载中...</span>
              </div>
            ) : allTodosEdited.length === 0 ? (
              <div className="text-gray-400 mt-10 md:mt-20 text-center text-base md:text-lg">本周暂无待办</div>
            ) : (
              <div className="space-y-3">
                {allTodosEdited.map((todo, idx) => (
                  <div key={todo.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 bg-white border border-gray-200 rounded-lg px-3 py-3 md:px-4 md:py-3 shadow-sm hover:shadow transition-shadow">
                    <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full">
                      <span className="w-28 text-sm text-gray-700 font-semibold truncate">{todo.projectName}</span>
                      <input
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition hover:border-blue-300"
                        value={todo.content}
                        onChange={e => handleAllTodosChange(idx, "content", e.target.value)}
                      />
                      {/* 优先级显示 */}
                      <span className={`w-16 text-xs font-bold rounded px-1.5 py-0.5 flex items-center justify-center ${
                        todo.priority === 'high' 
                          ? 'bg-red-50 text-red-600 ring-1 ring-red-200' 
                          : todo.priority === 'medium' 
                            ? 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200' 
                            : 'bg-green-50 text-green-700 ring-1 ring-green-200'
                      }`}>
                        {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                      </span>
                      <div className="relative w-40">
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className="w-full border border-gray-300 rounded-lg pl-8 pr-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                          value={todo.due_date}
                          onChange={e => handleAllTodosChange(idx, "due_date", e.target.value)}
                        />
                      </div>
                      <select
                        className={`w-24 text-xs border rounded-lg px-2 py-1.5 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleAllTodosChange(idx, "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <div className="text-xs md:text-sm text-red-500 flex items-center mt-2"><AlertCircleIcon className="h-4 w-4 mr-1" />{error}</div>}
          </>
        ) : selectedProjectId ? (
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
                <div key={"new-"+idx} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 bg-white border border-blue-200 rounded-lg px-3 py-3 md:px-4 md:py-3 shadow-sm hover:shadow transition-shadow">
                  <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full">
                    <input
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition hover:border-blue-300"
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
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                      <div className="relative w-40">
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className="w-full border border-gray-300 rounded-lg pl-8 pr-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                          value={todo.due_date}
                          onChange={e => handleNewTodoChange(idx, "due_date", e.target.value)}
                        />
                      </div>
                      <select
                        className={`w-24 text-xs border rounded-lg px-2 py-1.5 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleNewTodoChange(idx, "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button className="text-red-500 hover:text-red-700 p-2 rounded-lg transition" onClick={() => handleRemoveNewTodo(idx)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {/* 已有待办 */}
              {todos.map((todo, idx) => (
                <div key={todo.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 bg-white border border-gray-200 rounded-lg px-3 py-3 md:px-4 md:py-3 shadow-sm hover:shadow transition-shadow">
                  <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full">
                    <input
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition hover:border-blue-300"
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
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                      <div className="relative w-40">
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className="w-full border border-gray-300 rounded-lg pl-8 pr-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                          value={todo.due_date}
                          onChange={e => handleTodoChange(idx, "due_date", e.target.value)}
                        />
                      </div>
                      <select
                        className={`w-24 text-xs border rounded-lg px-2 py-1.5 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleTodoChange(idx, "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button className="text-red-500 hover:text-red-700 p-2 rounded-lg transition" onClick={() => handleRemoveTodo(todo.id)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
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
      {showDeleteProjectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h3 className="text-lg font-bold mb-4 text-gray-800">确认删除项目</h3>
            <p className="mb-6 text-gray-600">该项目下所有待办已删除，是否同时删除该项目？</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={() => { setShowDeleteProjectConfirm(false); setProjectToDelete(null); }}
              >取消</button>
              <button
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={handleDeleteProject}
              >确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 