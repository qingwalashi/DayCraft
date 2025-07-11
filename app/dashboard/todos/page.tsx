"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PlusIcon, SaveIcon, TrashIcon, CalendarIcon, ChevronRightIcon, ChevronDownIcon, AlertCircleIcon, MenuIcon, ChevronLeftIcon, Loader2Icon, ClockIcon, PlayIcon, CheckCircleIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { format, addDays, parseISO, isBefore, isEqual } from "date-fns";
import { toast } from "sonner";

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
  inProgressCount?: number; // 新增：进行中的待办数量
  notStartedCount?: number; // 新增：未开始的待办数量
}
interface Todo {
  id?: string;
  content: string;
  priority: string;
  due_date: string;
  status?: string;
  completed_at?: string;
}

// 新增：全部按钮的常量
const ALL_PROJECTS = "ALL_PROJECTS";

// 工具函数：判断截止日期是否为今天或更早
function isPastOrToday(dateStr: string, status?: string) {
  // 如果是已完成状态，不标红
  if (status === 'completed') return false;
  
  if (!dateStr) return false;
  const today = new Date();
  const date = parseISO(dateStr);
  // 只比较年月日
  return isBefore(date, today) || isEqual(date, today);
}

// 获取本周的起止日期
function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7; // 周日为0，转为7
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

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
  // 新增：待办删除确认
  const [todoToDelete, setTodoToDelete] = useState<string | null>(null);
  const [showDeleteTodoConfirm, setShowDeleteTodoConfirm] = useState(false);
  // 新增：全部视图的待办
  const [allTodos, setAllTodos] = useState<(Todo & { projectName: string })[]>([]);
  // 新增：全部视图编辑状态
  const [allTodosEdited, setAllTodosEdited] = useState<(Todo & { projectName: string })[]>([]);
  const [isAllTodosSaving, setIsAllTodosSaving] = useState(false);
  // 新增：全部视图优先级统计
  const [allPriorityCount, setAllPriorityCount] = useState({ 
    high: 0, 
    medium: 0, 
    low: 0,
    inProgress: 0, // 新增：进行中的待办数量
    notStarted: 0  // 新增：未开始的待办数量
  });
  
  // 新增：完成时间确认相关状态
  const [showCompletedConfirm, setShowCompletedConfirm] = useState(false);
  const [completingTodo, setCompletingTodo] = useState<{id: string, index: number} | null>(null);
  const [completedAt, setCompletedAt] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  // 新增：数据加载状态跟踪
  const dataLoadedRef = useRef<boolean>(false);
  const lastLoadTimeRef = useRef<number>(0);
  const DATA_REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟刷新间隔

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

  // 加载项目数据和统计信息
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      (async () => {
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
        
          // 获取所有待办数据（一次性查询所有待办）
          const { data: allTodosData, error: allTodosError } = await supabase
                .from("project_todos")
            .select("id, project_id, priority, status")
                .eq("user_id", user.id)
                .not("status", "eq", "completed");
            
          if (allTodosError) {
            setError("加载待办统计信息失败");
      setIsLoading(false);
          return;
        }
          
          // 处理待办数据，按项目和状态分组
          const todosByProject: Record<string, { 
            high: number, 
            medium: number, 
            low: number,
            inProgress: number,
            notStarted: number
          }> = {};
          
          // 初始化全局计数器
          const allCount = { high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 };
          
          // 遍历所有待办，统计各种数量
          (allTodosData || []).forEach((todo: any) => {
            // 初始化项目计数器
            if (!todosByProject[todo.project_id]) {
              todosByProject[todo.project_id] = { 
                high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 
              };
            }
            
            // 按优先级统计
            if (todo.priority === "high") {
              todosByProject[todo.project_id].high++;
              allCount.high++;
            } else if (todo.priority === "medium") {
              todosByProject[todo.project_id].medium++;
              allCount.medium++;
            } else if (todo.priority === "low") {
              todosByProject[todo.project_id].low++;
              allCount.low++;
            }
            
            // 按状态统计
            if (todo.status === "in_progress") {
              todosByProject[todo.project_id].inProgress++;
              allCount.inProgress++;
            } else if (todo.status === "not_started") {
              todosByProject[todo.project_id].notStarted++;
              allCount.notStarted++;
          }
          });
          
          // 构建项目列表，包含待办统计
          const projectsWithTodoCount = typedProjectsData.map(project => {
            const counts = todosByProject[project.id] || { 
              high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 
            };
            
            return {
              ...project,
              highPriorityCount: counts.high,
              mediumPriorityCount: counts.medium,
              lowPriorityCount: counts.low,
              inProgressCount: counts.inProgress,
              notStartedCount: counts.notStarted,
              totalCount: counts.high + counts.medium + counts.low
            };
          });
          
          setProjects(projectsWithTodoCount);
          setAllPriorityCount(allCount);
          
          // 加载完成后设置标志
          dataLoadedRef.current = true;
          lastLoadTimeRef.current = Date.now();
        } catch (error) {
          console.error("加载项目和待办统计失败:", error);
          setError("加载数据失败");
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [user, supabase]);

  // 加载选中项目的待办
  useEffect(() => {
    if (!user || !selectedProjectId) return;
          
    // 如果是全部项目，加载所有项目的待办
            if (selectedProjectId === ALL_PROJECTS) {
              (async () => {
                setIsLoading(true);
                try {
          // 获取所有活跃项目（如果还没有加载）
          let projectMap: Record<string, string> = {};
          if (projects.length === 0) {
                  const { data: projectsData, error: projectsError } = await supabase
                    .from("projects")
              .select("id, name")
                    .eq("user_id", user.id)
                    .eq("is_active", true);
              
                  if (projectsError) {
                    setError("加载项目失败");
                    setIsLoading(false);
                    return;
                  }
            
            projectMap = (projectsData || []).reduce((acc: Record<string, string>, p: any) => {
                    acc[p.id] = p.name;
                    return acc;
                  }, {});
          } else {
            projectMap = projects.reduce((acc: Record<string, string>, p: Project) => {
              acc[p.id] = p.name;
              return acc;
            }, {});
          }
                  
          // 合并查询：一次性获取所有待办（活跃和已完成）
          const { data: allTodosData, error: todosError } = await supabase
                    .from("project_todos")
                    .select("id, content, priority, due_date, status, completed_at, project_id")
                    .eq("user_id", user.id)
            .or("status.eq.not_started,status.eq.in_progress,status.eq.completed")
                    .order("due_date", { ascending: true });
                    
          if (todosError) {
                    setError("加载待办失败");
                    setIsLoading(false);
                    return;
                  }
                  
          // 处理待办数据
          const activeTodos = allTodosData?.filter(t => t.status !== 'completed') || [];
          const completedTodos = allTodosData?.filter(t => t.status === 'completed') || [];
          
          // 按最近完成时间排序并限制数量
          completedTodos.sort((a, b) => {
            const dateA = a.completed_at ? new Date(a.completed_at as string).getTime() : 0;
            const dateB = b.completed_at ? new Date(b.completed_at as string).getTime() : 0;
            return dateB - dateA;
          });
          const recentCompletedTodos = completedTodos.slice(0, 10);
                  
                  // 合并所有待办并添加项目名称
                  const allTodosWithProject = [
            ...activeTodos,
            ...recentCompletedTodos
                  ].map((t: any) => ({
                    ...t,
                    projectName: projectMap[t.project_id] || "",
                  }));
                  
                  setAllTodos(allTodosWithProject);
                  
          // 统计优先级数量（重用之前计算的数据）
                  dataLoadedRef.current = true;
                  lastLoadTimeRef.current = Date.now();
                } catch (err) {
          console.error("加载全部待办失败:", err);
          setError("加载待办失败");
                } finally {
                  setIsLoading(false);
                }
              })();
    } else {
      // 加载特定项目的待办
              (async () => {
                setIsLoading(true);
                try {
          // 合并查询：一次性获取所有待办（活跃和已完成）
          const { data: allTodosData, error: todosError } = await supabase
                  .from("project_todos")
                  .select("id, content, priority, due_date, status, completed_at")
                  .eq("user_id", user.id)
                  .eq("project_id", selectedProjectId)
            .or("status.eq.not_started,status.eq.in_progress,status.eq.completed")
                  .order("due_date", { ascending: true });
                    
          if (todosError) {
                  setError("加载待办失败");
                    setIsLoading(false);
                  return;
                }
                  
          // 处理待办数据
          const activeTodos = allTodosData?.filter(t => t.status !== 'completed') || [];
          const completedTodos = allTodosData?.filter(t => t.status === 'completed') || [];
          
          // 按最近完成时间排序并限制数量
          completedTodos.sort((a, b) => {
            const dateA = a.completed_at ? new Date(a.completed_at as string).getTime() : 0;
            const dateB = b.completed_at ? new Date(b.completed_at as string).getTime() : 0;
            return dateB - dateA;
          });
          const recentCompletedTodos = completedTodos.slice(0, 10);
                  
                  // 合并所有待办
                  const allTodos = [
            ...activeTodos,
            ...recentCompletedTodos
          ] as Todo[];
                  
          setTodos(allTodos);
      setNewTodos([]);
                  dataLoadedRef.current = true;
                  lastLoadTimeRef.current = Date.now();
                } catch (err) {
          console.error("加载项目待办失败:", err);
                  setError("加载待办失败");
                } finally {
                  setIsLoading(false);
                }
    })();
    }
  }, [user, selectedProjectId, supabase, projects]);
                  
  // 处理页面可见性变化，用于刷新数据
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          const now = Date.now();
          // 如果距离上次加载超过5分钟，刷新数据
          if (now - lastLoadTimeRef.current > DATA_REFRESH_INTERVAL) {
            console.log('页面恢复可见，重新加载数据');
            dataLoadedRef.current = false;
            
            // 根据当前选择的项目决定刷新哪些数据
            if (selectedProjectId === ALL_PROJECTS) {
              // 重置加载标志，触发重新加载
              dataLoadedRef.current = false;
            } else if (selectedProjectId) {
              // 重置加载标志，触发重新加载
              dataLoadedRef.current = false;
                }
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [selectedProjectId]);

  // 添加新待办
  const handleAddTodo = () => {
    // 只统计未开始和进行中的待办数量
    const activeCount = todos.filter(todo => todo.status !== 'completed').length;
    if (newTodos.length + activeCount >= 10) {
      setError("每个项目未开始和进行中的待办最多只能添加10个");
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
    // 如果字段是status且值变为completed，则显示完成时间确认弹窗
    if (field === "status" && value === "completed") {
      const todo = todos[idx];
      if (todo.id) {
        setCompletingTodo({id: todo.id, index: idx});
        setCompletedAt(format(new Date(), "yyyy-MM-dd")); // 默认设置为今天
        setShowCompletedConfirm(true);
        return; // 不立即更新状态，等待确认
      }
    }
    
    // 其他字段或非完成状态直接更新
    setTodos((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      return arr;
    });
  };

  // 新增：确认完成时间
  const handleConfirmCompletedAt = async () => {
    if (!completingTodo || !user) return;
    
    setIsLoading(true);
    try {
      // 获取待办详细信息
      const { data: todoData } = await supabase
        .from("project_todos")
        .select("*, project:project_id(name, code)")
        .eq("id", completingTodo.id)
        .single();
        
      if (!todoData) {
        throw new Error("找不到待办信息");
      }
      
      // 更新待办状态为已完成并设置完成时间
      await supabase.from("project_todos").update({
        status: "completed",
        completed_at: `${completedAt}T00:00:00Z` // 将日期转为ISO格式
      }).eq("id", completingTodo.id);
      
      // 根据当前视图更新相应的状态
      if (selectedProjectId === ALL_PROJECTS) {
        // 更新全部视图状态
        setAllTodosEdited((prev) => {
          const arr = [...prev];
          const todoIndex = arr.findIndex(t => t.id === completingTodo.id);
          if (todoIndex !== -1) {
            arr[todoIndex] = { 
              ...arr[todoIndex], 
              status: "completed",
              completed_at: completedAt
            };
          }
          return arr;
        });
        
        // 同步更新 allTodos 状态
        setAllTodos((prev) => {
          const arr = [...prev];
          const todoIndex = arr.findIndex(t => t.id === completingTodo.id);
          if (todoIndex !== -1) {
            arr[todoIndex] = { 
              ...arr[todoIndex], 
              status: "completed",
              completed_at: completedAt
            };
          }
          return arr;
        });
      } else {
        // 更新单项目视图状态
        setTodos((prev) => {
          const arr = [...prev];
          if (completingTodo) {
            arr[completingTodo.index] = { 
              ...arr[completingTodo.index], 
              status: "completed",
              completed_at: completedAt
            };
          }
          return arr;
        });
      }
      
      // 在对应日期的日报中添加一行工作内容
      try {
        // 1. 检查该日期是否已有日报
        const { data: existingReport } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', completedAt)
          .maybeSingle();
          
        let reportId;
        
        if (existingReport) {
          // 使用现有日报ID
          reportId = existingReport.id;
        } else {
          // 创建新日报
          const { data: newReport, error: createError } = await supabase
            .from('daily_reports')
            .insert({
              user_id: user.id,
              date: completedAt,
              is_plan: false
            })
            .select()
            .single();
            
          if (createError) {
            console.error('创建日报失败:', createError);
            throw createError;
          }
          
          reportId = newReport.id;
        }
        
        // 2. 添加工作项到日报
        const projectInfo = todoData.project;
        const workContent = `${todoData.content}`;
        
        await supabase
          .from('report_items')
          .insert({
            report_id: reportId,
            project_id: todoData.project_id,
            content: workContent
          });
          
        toast.success(`待办已完成，并已添加到 ${completedAt} 的日报中`);
      } catch (err) {
        console.error("添加到日报失败:", err);
        toast.error("待办已完成，但添加到日报失败");
      }
      
      // 关闭确认对话框
      setShowCompletedConfirm(false);
      setCompletingTodo(null);
      
      // 一次性刷新所有统计和视图数据
      await updateAllProjectTodoCounts();
    } catch (err) {
      console.error("更新完成状态失败:", err);
      setError("更新状态失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 取消完成状态确认
  const handleCancelCompleted = () => {
    setShowCompletedConfirm(false);
    setCompletingTodo(null);
  };

  // 显示待办删除确认对话框
  const handleShowTodoDeleteConfirm = (id?: string) => {
    if (!id) return;
    setTodoToDelete(id);
    setShowDeleteTodoConfirm(true);
  };

  // 删除已存在待办
  const handleRemoveTodo = async (id?: string) => {
    if (!user) return;
    if (!id) return;
    if (!selectedProjectId) return;
    setIsLoading(true);
    try {
      // 删除待办
      const { error } = await supabase.from("project_todos").delete().eq("id", id);
      
      if (error) {
        throw error;
      }
      
      // 删除成功后更新前端状态
      setTodos((prev) => prev.filter((t) => t.id !== id));
      
      // 一次性刷新所有统计和视图数据
      await updateAllProjectTodoCounts();
      
      toast.success("待办已删除");
    } catch (err) {
      console.error("删除待办失败:", err);
      setError("删除失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 执行待办删除操作
  const handleConfirmTodoDelete = async () => {
    if (!user) return;
    if (!todoToDelete) return;
    if (!selectedProjectId) return;
    setIsLoading(true);
    try {
      // 删除待办
      const { error } = await supabase.from("project_todos").delete().eq("id", todoToDelete);
      
      if (error) {
        throw error;
      }
      
      // 删除成功后更新前端状态
      setTodos((prev) => prev.filter((t) => t.id !== todoToDelete));
      
      // 一次性刷新所有统计和视图数据
      await updateAllProjectTodoCounts();
      
      // 关闭确认对话框
      setShowDeleteTodoConfirm(false);
      setTodoToDelete(null);
      
      toast.success("待办已删除");
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
      // 获取项目和待办数据（一次性查询）
      const [projectsResult, todosResult] = await Promise.all([
        supabase
        .from("projects")
        .select("id, name, code, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("project_todos")
          .select("id, project_id, priority, status")
          .eq("user_id", user.id)
          .not("status", "eq", "completed")
      ]);
      
      if (projectsResult.error) {
        setError("加载项目失败");
        setIsLoading(false);
        return;
      }
      
      if (todosResult.error) {
        setError("加载待办统计信息失败");
        setIsLoading(false);
        return;
      }
      
      const typedProjectsData = (projectsResult.data || []) as Project[];
      const allTodosData = todosResult.data || [];
      
      // 处理待办数据，按项目和状态分组
      const todosByProject: Record<string, { 
        high: number, 
        medium: number, 
        low: number,
        inProgress: number,
        notStarted: number
      }> = {};
      
      // 初始化全局计数器
      const allCount = { high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 };
      
      // 遍历所有待办，统计各种数量
      allTodosData.forEach((todo: any) => {
        // 初始化项目计数器
        if (!todosByProject[todo.project_id]) {
          todosByProject[todo.project_id] = { 
            high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 
          };
        }
        
        // 按优先级统计
        if (todo.priority === "high") {
          todosByProject[todo.project_id].high++;
          allCount.high++;
        } else if (todo.priority === "medium") {
          todosByProject[todo.project_id].medium++;
          allCount.medium++;
        } else if (todo.priority === "low") {
          todosByProject[todo.project_id].low++;
          allCount.low++;
        }
        
        // 按状态统计
        if (todo.status === "in_progress") {
          todosByProject[todo.project_id].inProgress++;
          allCount.inProgress++;
        } else if (todo.status === "not_started") {
          todosByProject[todo.project_id].notStarted++;
          allCount.notStarted++;
        }
      });
      
      // 构建项目列表，包含待办统计
      const projectsWithTodoCount = typedProjectsData.map(project => {
        const counts = todosByProject[project.id] || { 
          high: 0, medium: 0, low: 0, inProgress: 0, notStarted: 0 
        };
        
          return {
            ...project,
          highPriorityCount: counts.high,
          mediumPriorityCount: counts.medium,
          lowPriorityCount: counts.low,
          inProgressCount: counts.inProgress,
          notStartedCount: counts.notStarted,
          totalCount: counts.high + counts.medium + counts.low
          };
      });
      
      setProjects(projectsWithTodoCount);
      setAllPriorityCount(allCount);
      
      // 如果当前是全部视图，也更新全部视图的数据
      if (selectedProjectId === ALL_PROJECTS) {
        await refreshAllProjectsView();
      } else if (selectedProjectId) {
        // 如果是单项目视图，刷新当前项目的待办
        await refreshSingleProjectView(selectedProjectId);
      }
    } catch (err) {
      console.error("加载项目和待办统计失败:", err);
      setError("加载项目失败");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 新增：刷新全部项目视图的待办
  const refreshAllProjectsView = async () => {
    if (!user) return;
    
    try {
      // 获取项目名称映射
      const projectMap = projects.reduce((acc: Record<string, string>, p: Project) => {
        acc[p.id] = p.name;
        return acc;
      }, {});
      
      // 一次性获取所有待办（活跃和已完成）
      const { data: allTodosData, error: todosError } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status, completed_at, project_id")
        .eq("user_id", user.id)
        .or("status.eq.not_started,status.eq.in_progress,status.eq.completed")
        .order("due_date", { ascending: true });
        
      if (todosError) {
        setError("加载待办失败");
        return;
      }
      
      // 处理待办数据
      const activeTodos = allTodosData?.filter(t => t.status !== 'completed') || [];
      const completedTodos = allTodosData?.filter(t => t.status === 'completed') || [];
      
      // 按最近完成时间排序并限制数量
      completedTodos.sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at as string).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at as string).getTime() : 0;
        return dateB - dateA;
      });
      const recentCompletedTodos = completedTodos.slice(0, 10);
      
      // 合并所有待办并添加项目名称
      const allTodosWithProject = [
        ...activeTodos,
        ...recentCompletedTodos
      ].map((t: any) => ({
        ...t,
        projectName: projectMap[t.project_id] || "",
      }));
      
      setAllTodos(allTodosWithProject);
    } catch (err) {
      console.error("刷新全部待办视图失败:", err);
      setError("刷新数据失败");
    }
  };
  
  // 新增：刷新单项目视图的待办
  const refreshSingleProjectView = async (projectId: string) => {
    if (!user) return;
    
    try {
      // 一次性获取所有待办（活跃和已完成）
      const { data: allTodosData, error: todosError } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status, completed_at")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .or("status.eq.not_started,status.eq.in_progress,status.eq.completed")
        .order("due_date", { ascending: true });
        
      if (todosError) {
        setError("加载待办失败");
        return;
      }
      
      // 处理待办数据
      const activeTodos = allTodosData?.filter(t => t.status !== 'completed') || [];
      const completedTodos = allTodosData?.filter(t => t.status === 'completed') || [];
      
      // 按最近完成时间排序并限制数量
      completedTodos.sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at as string).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at as string).getTime() : 0;
        return dateB - dateA;
      });
      const recentCompletedTodos = completedTodos.slice(0, 10);
      
      // 合并所有待办
      const allTodos = [
        ...activeTodos,
        ...recentCompletedTodos
      ] as Todo[];
      
      setTodos(allTodos);
      setNewTodos([]);
    } catch (err) {
      console.error("刷新项目待办视图失败:", err);
      setError("刷新数据失败");
    }
  };

  // 保存所有待办
  const handleSave = async () => {
    if (!selectedProjectId || !user) return;
    setIsSaving(true);
    setError(null);
    try {
      // 收集所有操作，准备批量执行
      const operations = [];
      
      // 新增待办
      for (const todo of newTodos) {
        if (!todo.content.trim()) continue;
        operations.push(
          supabase.from("project_todos").insert({
          user_id: user.id,
          project_id: selectedProjectId,
          content: todo.content,
          priority: todo.priority,
          due_date: todo.due_date,
          status: todo.status || 'not_started',
          })
        );
      }
      
      // 更新待办
      for (const todo of todos) {
        if (!todo.id) continue;
        operations.push(
          supabase.from("project_todos").update({
          content: todo.content,
          priority: todo.priority,
          due_date: todo.due_date,
          status: todo.status,
          // 如果状态是completed但没有完成时间，自动设置为当前时间
          completed_at: todo.status === 'completed' 
            ? (todo.completed_at ? todo.completed_at : format(new Date(), "yyyy-MM-dd") + "T00:00:00Z")
            : todo.completed_at
          }).eq("id", todo.id)
        );
      }
      
      // 并行执行所有操作
      await Promise.all(operations);
      
      // 一次性刷新所有统计和视图数据
      await updateAllProjectTodoCounts();
      
      toast.success("待办已保存");
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
    // 重置数据加载状态，确保切换项目时重新加载数据
    dataLoadedRef.current = false;
    if (isMobile) {
      setSidebarVisible(false);
    }
  };

  // 同步 allTodos 到 allTodosEdited
  useEffect(() => {
    setAllTodosEdited(allTodos);
  }, [allTodos]);

  // 编辑全部待办内容/完成情况
  const handleAllTodosChange = (idx: number, field: keyof Todo, value: any) => {
    // 如果字段是status且值变为completed，则显示完成时间确认弹窗
    if (field === "status" && value === "completed") {
      const todo = allTodosEdited[idx];
      if (todo.id) {
        setCompletingTodo({id: todo.id, index: idx});
        setCompletedAt(format(new Date(), "yyyy-MM-dd")); // 默认设置为今天
        setShowCompletedConfirm(true);
        return; // 不立即更新状态，等待确认
      }
    }
    
    // 其他字段或非完成状态直接更新
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
      // 收集所有更新操作，准备批量执行
      const updateOperations = [];
      
      for (const todo of allTodosEdited) {
        if (!todo.id) continue;
        updateOperations.push(
          supabase.from("project_todos").update({
          content: todo.content,
          status: todo.status,
          // 如果状态是completed但没有完成时间，自动设置为当前时间
          completed_at: todo.status === 'completed' 
            ? (todo.completed_at ? todo.completed_at : format(new Date(), "yyyy-MM-dd") + "T00:00:00Z")
            : todo.completed_at
          }).eq("id", todo.id)
        );
      }
      
      // 并行执行所有更新操作
      await Promise.all(updateOperations);
        
      // 一次性刷新所有统计和视图数据
      await updateAllProjectTodoCounts();
      
      toast.success("所有待办已保存");
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
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
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
          <ul className="space-y-1">
            {/* 全部按钮 - 特殊样式突出显示 */}
            <li>
              <button
                className={`flex items-center w-full px-2.5 py-1.5 rounded-lg transition font-medium text-sm ${selectedProjectId === ALL_PROJECTS ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"}`}
                onClick={() => handleProjectSelect(ALL_PROJECTS)}
                title="全部项目待办"
              >
                <CalendarIcon className="h-4 w-4 mr-1.5 text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1 text-left">全部</span>
                
                {/* 添加进行中和未开始数量 */}
                <div className="flex flex-shrink-0 gap-1">
                  {allPriorityCount.inProgress > 0 && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                      进行中 {allPriorityCount.inProgress}
                    </span>
                  )}
                  {allPriorityCount.notStarted > 0 && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                      未开始 {allPriorityCount.notStarted}
                    </span>
                  )}
                </div>
              </button>
            </li>
            {/* 项目列表 */}
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  className={`flex items-center w-full px-2.5 py-1.5 rounded-lg transition font-medium text-sm
                    ${selectedProjectId === project.id ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"}`}
                  onClick={() => handleProjectSelect(project.id)}
                  title={project.name}
                >
                  <ChevronRightIcon className="h-4 w-4 mr-1.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{project.name}</span>
                  
                  {/* 添加进行中和未开始数量 */}
                  <div className="flex flex-shrink-0 gap-1">
                    {safeCount(project.inProgressCount) > 0 && (
                      <span className="inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                        进行中 {project.inProgressCount}
                    </span>
                  )}
                    {safeCount(project.notStartedCount) > 0 && (
                      <span className="inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                        未开始 {project.notStartedCount}
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
      <div className={`flex-1 p-3 md:p-6 overflow-y-auto flex flex-col ${!sidebarVisible || !isMobile ? 'block' : 'hidden md:block'}`}>
        {/* 全部视图下，隐藏添加待办和原保存按钮，仅显示全部保存按钮 */}
        {selectedProjectId === ALL_PROJECTS ? null : (
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl md:text-2xl font-bold text-gray-900 ${!sidebarVisible && isMobile ? '' : 'hidden md:block'}`}>待办管理</h2>
            {/* 操作按钮 - 仅非全部视图显示 */}
          <div className="flex gap-2 md:gap-3 ml-auto">
            {selectedProjectId && (
              <>
                <button
                    className="flex items-center px-4 py-2 border rounded-lg text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 transition"
                  onClick={handleAddTodo}
                  disabled={newTodos.length + todos.filter(todo => todo.status !== 'completed').length >= 10}
                >
                  <PlusIcon className="h-5 w-5 mr-2" /> 
                  <span>添加待办</span>
                </button>
                <button
                    className="flex items-center px-4 py-2 border rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition relative"
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
                className="flex items-center px-4 py-2 border rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition relative"
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
              <>
                {/* 桌面端表格视图 */}
                <div className="hidden md:block overflow-x-auto rounded-xl shadow-sm border border-gray-100">
                  <table className="w-full border-collapse bg-white">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">项目</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">优先级</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">截止时间</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* 未开始的待办 */}
                      {allTodosEdited.filter(todo => todo.status === 'not_started').length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                            <div className="flex items-center">
                              <ClockIcon className="h-4 w-4 mr-1.5 text-gray-600" />未开始
                            </div>
                          </td>
                        </tr>
                      )}
                      {allTodosEdited.filter(todo => todo.status === 'not_started').map((todo, idx) => (
                        <tr key={`desktop-not-started-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-gray-700">{todo.projectName}</td>
                          <td className="px-4 py-2">
                            <input
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                              value={todo.content}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block w-full text-center text-xs font-medium rounded-full py-1 ${
                              todo.priority === 'high' 
                                ? 'bg-red-50 text-red-600 border border-red-200' 
                                : todo.priority === 'medium' 
                                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                  : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="relative w-full">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CalendarIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="date"
                                className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                                value={todo.due_date}
                                onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                              } ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                              } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                              value={todo.status || 'not_started'}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      
                      {/* 进行中的待办 */}
                      {allTodosEdited.filter(todo => todo.status === 'in_progress').length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                            <div className="flex items-center">
                              <PlayIcon className="h-4 w-4 mr-1.5 text-blue-600" />进行中
                            </div>
                          </td>
                        </tr>
                      )}
                      {allTodosEdited.filter(todo => todo.status === 'in_progress').map((todo, idx) => (
                        <tr key={`desktop-in-progress-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-gray-700">{todo.projectName}</td>
                          <td className="px-4 py-2">
                            <input
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                              value={todo.content}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block w-full text-center text-xs font-medium rounded-full py-1 ${
                              todo.priority === 'high' 
                                ? 'bg-red-50 text-red-600 border border-red-200' 
                                : todo.priority === 'medium' 
                                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                  : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="relative w-full">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CalendarIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="date"
                                className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                                value={todo.due_date}
                                onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                              } ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                              } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                              value={todo.status || 'not_started'}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      
                      {/* 已完成的待办 */}
                      {allTodosEdited.filter(todo => todo.status === 'completed').length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                            <div className="flex items-center">
                              <CheckCircleIcon className="h-4 w-4 mr-1.5 text-green-600" />已完成（最近10条）
                            </div>
                          </td>
                        </tr>
                      )}
                      {allTodosEdited.filter(todo => todo.status === 'completed').map((todo, idx) => (
                        <tr key={`desktop-completed-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-gray-700">{todo.projectName}</td>
                          <td className="px-4 py-2">
                            <input
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                              value={todo.content}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block w-full text-center text-xs font-medium rounded-full py-1 ${
                              todo.priority === 'high' 
                                ? 'bg-red-50 text-red-600 border border-red-200' 
                                : todo.priority === 'medium' 
                                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                  : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="relative w-full">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CalendarIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="date"
                                className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                                value={todo.due_date}
                                onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                              } ${
                                STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                              } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                              value={todo.status || 'not_started'}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* 移动端卡片视图 */}
                <div className="md:hidden space-y-4">
                  {/* 未开始的待办 */}
                  {allTodosEdited.filter(todo => todo.status === 'not_started').length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                      <ClockIcon className="h-4 w-4 mr-1.5 text-gray-600" />
                      <h3 className="font-medium text-gray-700">未开始</h3>
                    </div>
                  )}
                  {allTodosEdited.filter(todo => todo.status === 'not_started').map((todo, idx) => (
                    <div key={`mobile-not-started-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="p-4 space-y-3">
                        {/* 项目名称和优先级 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{todo.projectName}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            todo.priority === 'high' 
                              ? 'bg-red-50 text-red-600 border border-red-200' 
                              : todo.priority === 'medium' 
                                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                          </span>
                        </div>
                        
                        {/* 内容 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">内容</label>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                            value={todo.content}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                          />
                        </div>
                        
                        {/* 截止时间 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">截止时间</label>
                          <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <CalendarIcon className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                              type="date"
                              className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                              value={todo.due_date}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                            />
                          </div>
                        </div>
                        
                        {/* 状态 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">状态</label>
                          <select
                            className={`w-full text-sm border rounded-lg px-3 py-2 ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                            } ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                            } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                            value={todo.status || 'not_started'}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 进行中的待办 */}
                  {allTodosEdited.filter(todo => todo.status === 'in_progress').length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                      <PlayIcon className="h-4 w-4 mr-1.5 text-blue-600" />
                      <h3 className="font-medium text-gray-700">进行中</h3>
                    </div>
                  )}
                  {allTodosEdited.filter(todo => todo.status === 'in_progress').map((todo, idx) => (
                    <div key={`mobile-in-progress-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="p-4 space-y-3">
                        {/* 项目名称和优先级 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{todo.projectName}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            todo.priority === 'high' 
                              ? 'bg-red-50 text-red-600 border border-red-200' 
                              : todo.priority === 'medium' 
                                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                          </span>
                        </div>
                        
                        {/* 内容 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">内容</label>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                            value={todo.content}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                          />
                        </div>
                        
                        {/* 截止时间 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">截止时间</label>
                          <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <CalendarIcon className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                              type="date"
                              className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                              value={todo.due_date}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                            />
                          </div>
                        </div>
                        
                        {/* 状态 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">状态</label>
                          <select
                            className={`w-full text-sm border rounded-lg px-3 py-2 ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                            } ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                            } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                            value={todo.status || 'not_started'}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 已完成的待办 */}
                  {allTodosEdited.filter(todo => todo.status === 'completed').length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                      <CheckCircleIcon className="h-4 w-4 mr-1.5 text-green-600" />
                      <h3 className="font-medium text-gray-700">已完成（最近10条）</h3>
                    </div>
                  )}
                  {allTodosEdited.filter(todo => todo.status === 'completed').map((todo, idx) => (
                    <div key={`mobile-completed-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="p-4 space-y-3">
                        {/* 项目名称和优先级 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{todo.projectName}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            todo.priority === 'high' 
                              ? 'bg-red-50 text-red-600 border border-red-200' 
                              : todo.priority === 'medium' 
                                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}
                          </span>
                        </div>
                        
                        {/* 内容 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">内容</label>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                            value={todo.content}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "content", e.target.value)}
                          />
                        </div>
                        
                        {/* 截止时间 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">截止时间</label>
                          <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <CalendarIcon className="h-4 w-4 text-gray-400" />
                </div>
                            <input
                              type="date"
                              className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                              value={todo.due_date}
                              onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                            />
                          </div>
                        </div>
                        
                        {/* 状态 */}
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-500">状态</label>
                          <select
                            className={`w-full text-sm border rounded-lg px-3 py-2 ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                            } ${
                              STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                            } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                            value={todo.status || 'not_started'}
                            onChange={e => handleAllTodosChange(allTodosEdited.findIndex(t => t.id === todo.id), "status", e.target.value)}
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {error && <div className="text-xs md:text-sm text-red-500 flex items-center mt-2"><AlertCircleIcon className="h-4 w-4 mr-1" />{error}</div>}
          </>
        ) : selectedProjectId ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-4">
              <span className="text-base md:text-lg font-semibold text-gray-700">{projects.find(p => p.id === selectedProjectId)?.name}</span>
              {(newTodos.length + todos.filter(todo => todo.status !== 'completed').length >= 10) && (
                <span className="text-xs md:text-sm text-red-500 flex items-center"><AlertCircleIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />每个项目未开始和进行中的待办最多只能添加10个</span>
              )}
              {error && <span className="text-xs md:text-sm text-red-500 flex items-center"><AlertCircleIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />{error}</span>}
            </div>
            <div className="hidden md:block overflow-x-auto rounded-xl shadow-sm border border-gray-100">
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">优先级</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">截止时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* 新增待办 */}
              {newTodos.map((todo, idx) => (
                    <tr key={"desktop-new-"+idx} className="bg-blue-50 hover:bg-blue-100 transition-colors duration-150 ease-in-out">
                      <td className="px-4 py-2">
                    <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                      placeholder="输入待办内容"
                      value={todo.content}
                      onChange={e => handleNewTodoChange(idx, "content", e.target.value)}
                    />
                      </td>
                      <td className="px-4 py-2">
                      <select
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                        onChange={e => handleNewTodoChange(idx, "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative w-full">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                          </div>
                      <input
                        type="date"
                            className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                        value={todo.due_date}
                        onChange={e => handleNewTodoChange(idx, "due_date", e.target.value)}
                      />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                          } ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                          } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                          value={todo.status || 'not_started'}
                          onChange={e => handleNewTodoChange(idx, "status", e.target.value)}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleRemoveNewTodo(idx)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                      </td>
                    </tr>
              ))}
                  
                  {/* 未开始的待办 */}
                  {todos.filter(todo => todo.status === 'not_started').length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                        <div className="flex items-center">
                          <ClockIcon className="h-4 w-4 mr-1.5 text-gray-600" />未开始
                        </div>
                      </td>
                    </tr>
                  )}
                  {Array.isArray(todos) && todos.filter(todo => todo.status === 'not_started').map((todo, idx) => (
                    <tr key={`desktop-not-started-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                      <td className="px-4 py-2">
                    <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                      value={todo.content}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                    />
                      </td>
                      <td className="px-4 py-2">
                      <select
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative w-full">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                          </div>
                      <input
                        type="date"
                            className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                        value={todo.due_date}
                            onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                      />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                          } ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                          } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                          value={todo.status || 'not_started'}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {/* 进行中的待办 */}
                  {todos.filter(todo => todo.status === 'in_progress').length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                        <div className="flex items-center">
                          <PlayIcon className="h-4 w-4 mr-1.5 text-blue-600" />进行中
                        </div>
                      </td>
                    </tr>
                  )}
                  {Array.isArray(todos) && todos.filter(todo => todo.status === 'in_progress').map((todo, idx) => (
                    <tr key={`desktop-in-progress-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                      <td className="px-4 py-2">
                        <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                          value={todo.content}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                          value={todo.priority}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                        >
                          {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative w-full">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                            value={todo.due_date}
                            onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                          } ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                          } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                          value={todo.status || 'not_started'}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {/* 已完成的待办 */}
                  {todos.filter(todo => todo.status === 'completed').length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                        <div className="flex items-center">
                          <CheckCircleIcon className="h-4 w-4 mr-1.5 text-green-600" />已完成（最近10条）
                        </div>
                      </td>
                    </tr>
                  )}
                  {Array.isArray(todos) && todos.filter(todo => todo.status === 'completed').map((todo, idx) => (
                    <tr key={`desktop-completed-${todo.id}`} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                      <td className="px-4 py-2">
                        <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                          value={todo.content}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                          value={todo.priority}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                        >
                          {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative w-full">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                            value={todo.due_date}
                            onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`w-full text-xs border rounded-lg px-2.5 py-2 ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                          } ${
                            STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                          } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                          value={todo.status || 'not_started'}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* 移动端卡片视图 */}
            <div className="md:hidden space-y-4">
              {/* 新增待办卡片 */}
              {newTodos.map((todo, idx) => (
                <div key={`mobile-new-${idx}`} className="bg-blue-50 rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                  <div className="p-4 space-y-3">
                    {/* 优先级和删除按钮 */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        todo.priority === 'high' 
                          ? 'bg-red-50 text-red-600 border border-red-200' 
                          : todo.priority === 'medium' 
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}优先级
                      </span>
                      <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleRemoveNewTodo(idx)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                    
                    {/* 内容 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">内容</label>
                          <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        placeholder="输入待办内容"
                        value={todo.content}
                        onChange={e => handleNewTodoChange(idx, "content", e.target.value)}
                      />
                    </div>
                    
                    {/* 优先级 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">优先级</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                        onChange={e => handleNewTodoChange(idx, "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* 截止时间 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">截止时间</label>
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                          value={todo.due_date}
                          onChange={e => handleNewTodoChange(idx, "due_date", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {/* 状态 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">状态</label>
                      <select
                        className={`w-full text-sm border rounded-lg px-3 py-2 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleNewTodoChange(idx, "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 未开始的待办卡片 */}
              {todos.filter(todo => todo.status === 'not_started').length > 0 && (
                <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1.5 text-gray-600" />
                  <h3 className="font-medium text-gray-700">未开始</h3>
                </div>
              )}
              {Array.isArray(todos) && todos.filter(todo => todo.status === 'not_started').map((todo, idx) => (
                <div key={`mobile-not-started-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 space-y-3">
                    {/* 优先级和删除按钮 */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        todo.priority === 'high' 
                          ? 'bg-red-50 text-red-600 border border-red-200' 
                          : todo.priority === 'medium' 
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}优先级
                      </span>
                      <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    
                    {/* 内容 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">内容</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.content}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                      />
                    </div>
                    
                    {/* 优先级 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">优先级</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                  </div>
                    
                    {/* 截止时间 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">截止时间</label>
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                </div>
                        <input
                          type="date"
                          className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                          value={todo.due_date}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {/* 状态 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">状态</label>
                      <select
                        className={`w-full text-sm border rounded-lg px-3 py-2 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 进行中的待办卡片 */}
              {todos.filter(todo => todo.status === 'in_progress').length > 0 && (
                <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                  <PlayIcon className="h-4 w-4 mr-1.5 text-blue-600" />
                  <h3 className="font-medium text-gray-700">进行中</h3>
                </div>
              )}
              {Array.isArray(todos) && todos.filter(todo => todo.status === 'in_progress').map((todo, idx) => (
                <div key={`mobile-in-progress-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 space-y-3">
                    {/* 优先级和删除按钮 */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        todo.priority === 'high' 
                          ? 'bg-red-50 text-red-600 border border-red-200' 
                          : todo.priority === 'medium' 
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}优先级
                      </span>
                      <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                    
                    {/* 内容 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">内容</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.content}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                      />
                    </div>
                    
                    {/* 优先级 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">优先级</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* 截止时间 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">截止时间</label>
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                          value={todo.due_date}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {/* 状态 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">状态</label>
                      <select
                        className={`w-full text-sm border rounded-lg px-3 py-2 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 已完成的待办卡片 */}
              {todos.filter(todo => todo.status === 'completed').length > 0 && (
                <div className="bg-gray-50 rounded-lg p-2 mb-2 flex items-center">
                  <CheckCircleIcon className="h-4 w-4 mr-1.5 text-green-600" />
                  <h3 className="font-medium text-gray-700">已完成（最近10条）</h3>
                </div>
              )}
              {Array.isArray(todos) && todos.filter(todo => todo.status === 'completed').map((todo, idx) => (
                <div key={`mobile-completed-${todo.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 space-y-3">
                    {/* 优先级和删除按钮 */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        todo.priority === 'high' 
                          ? 'bg-red-50 text-red-600 border border-red-200' 
                          : todo.priority === 'medium' 
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {PRIORITY_OPTIONS.find(opt => opt.value === todo.priority)?.label}优先级
                      </span>
                      <button className="p-2 rounded-full hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors" onClick={() => handleShowTodoDeleteConfirm(todo.id)}>
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                    
                    {/* 内容 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">内容</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.content}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "content", e.target.value)}
                      />
                    </div>
                    
                    {/* 优先级 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">优先级</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300"
                        value={todo.priority}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={opt.color}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* 截止时间 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">截止时间</label>
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-gray-300 ${isPastOrToday(todo.due_date, todo.status) ? 'border-red-400 text-red-600 font-bold bg-red-50' : 'border-gray-200'}`}
                          value={todo.due_date}
                          onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "due_date", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {/* 状态 */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500">状态</label>
                      <select
                        className={`w-full text-sm border rounded-lg px-3 py-2 ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.bgColor || 'bg-gray-50'
                        } ${
                          STATUS_OPTIONS.find(opt => opt.value === todo.status)?.color || 'text-gray-700'
                        } font-medium transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-300`}
                        value={todo.status || 'not_started'}
                        onChange={e => handleTodoChange(todos.findIndex(t => t.id === todo.id), "status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className={`${opt.bgColor} ${opt.color}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 添加待办按钮 - 移动端 */}
              <button
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors"
                onClick={handleAddTodo}
                disabled={newTodos.length + todos.filter(todo => todo.status !== 'completed').length >= 10}
              >
                <PlusIcon className="h-5 w-5 mr-2" /> 
                <span>添加待办</span>
              </button>
            </div>
          </>
        ) : (
          <div className="text-gray-400 mt-10 md:mt-20 text-center text-base md:text-lg">请选择左侧项目后进行待办管理</div>
        )}
      </div>
      
      {/* 待办删除确认弹窗 */}
      {showDeleteTodoConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90%] border border-gray-100 transform transition-all">
            <h3 className="text-xl font-bold mb-4 text-gray-800">确认删除待办</h3>
            <p className="mb-6 text-gray-600">确定要删除此待办项目吗？此操作不可恢复。</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium text-sm"
                onClick={() => { setShowDeleteTodoConfirm(false); setTodoToDelete(null); }}
              >取消</button>
              <button
                className="px-5 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium text-sm shadow-sm"
                onClick={handleConfirmTodoDelete}
              >确认删除</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 完成时间确认弹窗 */}
      {showCompletedConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90%] border border-gray-100 transform transition-all">
            <h3 className="text-xl font-bold mb-4 text-gray-800">确认完成时间</h3>
            <p className="mb-5 text-gray-600">请选择任务完成时间：</p>
            <div className="mb-6">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all hover:border-blue-200"
                  value={completedAt}
                  onChange={e => setCompletedAt(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")} // 限制最大日期为今天
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium text-sm"
                onClick={handleCancelCompleted}
              >取消</button>
              <button
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
                onClick={handleConfirmCompletedAt}
              >确认完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 