"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { BarChart3Icon, CalendarIcon, FileTextIcon, FolderIcon, CopyIcon, XIcon, PencilIcon, CheckCircleIcon, ClockIcon, PlayIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, parseISO, getWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Project, UserDingTalkSettings } from "@/lib/supabase/client";
import Link from "next/link";
import { toast } from "sonner";
import { usePersistentState } from '@/lib/utils/page-persistence';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface WorkItem {
  content: string;
  project: Project;
}

interface Report {
  id: string;
  date: string;
  status: string;
  workItems: WorkItem[];
  is_plan?: boolean; // 是否为工作计划
}

interface Stats {
  weeklyReportCount: number;
  pendingWeeklyReports: number;
  projectCount: number;
  monthlyWorkItemCount: number;
}

// 添加待办相关接口
interface Todo {
  id: string;
  content: string;
  priority: string;
  due_date: string;
  status: string;
  completed_at?: string;
  project_id: string;
  projectName?: string;
}

// 添加项目待办接口
interface ProjectWithTodos {
  id: string;
  name: string;
  code: string;
  todos: Todo[];
}

export default function DashboardOverview() {
  const { user: authUser, loading } = useAuth();
  const supabase = createClient();
  
  // 使用持久化状态替代普通状态
  const [user, setUser] = usePersistentState<User | null>('dashboard-overview-user', null);
  const [reports, setReports] = usePersistentState<Report[]>('dashboard-overview-reports', []);
  const [projects, setProjects] = usePersistentState<Project[]>('dashboard-overview-projects', []);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = usePersistentState<Stats>('dashboard-overview-stats', {
    weeklyReportCount: 0,
    pendingWeeklyReports: 0,
    projectCount: 0,
    monthlyWorkItemCount: 0
  });
  
  // 添加报告标签切换状态
  const [activeReportTab, setActiveReportTab] = usePersistentState<'reports' | 'plans' | 'todos'>('dashboard-overview-report-tab', 'reports');
  
  // 添加预览相关状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  
  // 添加钉钉相关状态
  const [dingTalkSettings, setDingTalkSettings] = useState<UserDingTalkSettings | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  // 添加数据已加载的引用
  const dataLoadedRef = useRef(false);
  // 添加最后数据加载时间戳
  const lastLoadTimeRef = useRef<number>(0);
  // 数据刷新间隔（毫秒），设置为5分钟
  const DATA_REFRESH_INTERVAL = 5 * 60 * 1000;

  // 添加待办相关状态
  const [projectsWithTodos, setProjectsWithTodos] = useState<ProjectWithTodos[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);

  // 获取项目数据
  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      setProjects(data as Project[] || []);
      return data;
    } catch (error) {
      console.error("获取项目数据失败", error);
      return [];
    }
  }, [supabase, setProjects]);

  // 获取最近日报
  const fetchRecentReports = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select(`
          id,
          date,
          is_plan,
          report_items (
            id,
            content,
            projects:project_id (
              id,
              name,
              code,
              description
            )
          )
        `)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(6); // 增加获取的数量，以便有足够的日报和计划
      
      if (error) throw error;
      
      // 使用类型断言处理数据
      const formattedReports = (data || []).map(report => ({
        id: report.id as string,
        date: report.date as string,
        status: '已提交',
        is_plan: report.is_plan as boolean,
        workItems: ((report.report_items || []) as unknown as any[]).map((item: any) => ({
          content: item.content as string,
          project: item.projects as Project
        }))
      }));
      
      setReports(formattedReports);
      return formattedReports;
    } catch (error) {
      console.error("获取最近日报失败", error);
      return [];
    }
  }, [supabase, setReports]);

  // 获取统计数据
  const fetchStats = useCallback(async (userId: string) => {
    try {
      // 获取本周日报数量
      const today = new Date();
      const weekStart = format(startOfWeek(today, { locale: zhCN }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(today, { locale: zhCN }), 'yyyy-MM-dd');
      
      const { data: weeklyReports, error: weeklyError } = await supabase
        .from('daily_reports')
        .select('date')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd);
      
      if (weeklyError) throw weeklyError;
      
      // 获取本月工作项数量
      const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
      
      const { data: monthlyItems, error: monthlyError } = await supabase
        .from('daily_reports')
        .select(`
          report_items (id)
        `)
        .eq('user_id', userId)
        .gte('date', monthStart)
        .lte('date', format(today, 'yyyy-MM-dd'));
      
      if (monthlyError) throw monthlyError;
      
      // 计算本月工作项总数
      let monthlyWorkItemCount = 0;
      monthlyItems?.forEach(report => {
        monthlyWorkItemCount += (report.report_items || []).length;
      });
      
      // 获取当前周的周报是否已生成
      const currentYear = today.getFullYear();
      const currentWeek = getWeek(today, { locale: zhCN });
      
      const { data: existingWeeklyReport, error: weeklyReportError } = await supabase
        .from('weekly_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('year', currentYear)
        .eq('week_number', currentWeek)
        .maybeSingle();
      
      if (weeklyReportError && weeklyReportError.code !== 'PGRST116') {
        throw weeklyReportError;
      }
      
      // 只有当本周有日报记录且周报尚未生成时，才显示待生成周报
      const pendingWeeklyReports = (weeklyReports && weeklyReports.length > 0 && !existingWeeklyReport) ? 1 : 0;
      
      // 获取项目数量
      const { count: projectCount, error: projectError } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('user_id', userId);
      
      if (projectError) throw projectError;
      
      setStats({
        weeklyReportCount: weeklyReports?.length || 0,
        pendingWeeklyReports,
        projectCount: projectCount || 0,
        monthlyWorkItemCount
      });
      
    } catch (error) {
      console.error("获取统计数据失败", error);
    }
  }, [supabase, setStats]);

  // 获取所有数据
  const fetchData = useCallback(async (userId: string) => {
    if (dataLoadedRef.current) {
      console.log('数据已加载，跳过重新获取');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      // 并行请求数据
      await Promise.all([
        fetchProjects(),
        fetchRecentReports(userId),
        fetchStats(userId)
      ]);
      
      // 标记数据已加载
      dataLoadedRef.current = true;
    } catch (error) {
      console.error("获取数据失败", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects, fetchRecentReports, fetchStats]);

  useEffect(() => {
    // 使用Supabase的用户信息
    if (authUser && !dataLoadedRef.current) {
      setUser({
        id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '用户',
        email: authUser.email || '',
        role: 'user'
      });
      
      // 检查数据是否需要重新加载
      const now = Date.now();
      const timeSinceLastLoad = now - lastLoadTimeRef.current;
      
      // 如果数据未加载或超过刷新间隔，则加载数据
      if (!dataLoadedRef.current || timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
        fetchData(authUser.id);
        lastLoadTimeRef.current = now;
      } else {
        // 如果数据已加载且未超过刷新间隔，则直接设置加载状态为false
        setIsLoading(false);
      }
    }
  }, [authUser, setUser, fetchData]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('概览页面恢复可见，检查数据状态');
          // 只检查数据是否存在，不重新加载
          if (authUser && (!user || reports.length === 0)) {
            console.log('数据不存在，重新加载');
            dataLoadedRef.current = false;
            fetchData(authUser.id);
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [authUser, user, reports, fetchData]);

  // 检测平台是否为iOS
  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
  }, []);

  // 加载钉钉设置
  useEffect(() => {
    async function loadDingTalkSettings() {
      if (!authUser) return;
      
      try {
        const { data, error } = await supabase
          .from("user_dingtalk_settings")
          .select("*")
          .eq("user_id", authUser.id)
          .single();
          
        if (error && error.code !== 'PGRST116') {
          console.error("加载钉钉设置失败:", error);
          return;
        }
        
        if (data) {
          setDingTalkSettings(data as UserDingTalkSettings);
        }
      } catch (error) {
        console.error("加载钉钉设置时出错:", error);
      }
    }
    
    loadDingTalkSettings();
  }, [authUser, supabase]);

  // 获取报告涉及的所有项目
  const getReportProjects = (report: Report) => {
    const projectMap = new Map<string, Project>();
    
    report.workItems.forEach(item => {
      if (item.project && !projectMap.has(item.project.id)) {
        projectMap.set(item.project.id, item.project);
      }
    });
    
    return Array.from(projectMap.values());
  };

  // 根据项目ID获取该项目的工作项
  const getProjectWorkItems = (report: Report, projectId: string) => {
    return report.workItems.filter(item => item.project?.id === projectId);
  };

  // 生成统计卡片数据
  const generateStatsCards = () => {
    return [
      {
        id: 1,
        name: "本周填写日报",
        value: stats.weeklyReportCount.toString(),
        unit: "天",
        icon: <FileTextIcon className="h-full w-full text-blue-600" />,
        description: `本周已填写${stats.weeklyReportCount}天日报`,
      },
      {
        id: 2,
        name: "待生成周报",
        value: stats.pendingWeeklyReports.toString(),
        unit: "份",
        icon: <CalendarIcon className="h-full w-full text-green-600" />,
        description: `有${stats.pendingWeeklyReports}份周报待生成`,
      },
      {
        id: 3,
        name: "项目数量",
        value: stats.projectCount.toString(),
        unit: "个",
        icon: <FolderIcon className="h-full w-full text-orange-600" />,
        description: `当前共有${stats.projectCount}个项目`,
      },
      {
        id: 4,
        name: "本月工作量",
        value: stats.monthlyWorkItemCount.toString(),
        unit: "项",
        icon: <BarChart3Icon className="h-full w-full text-purple-600" />,
        description: `本月已完成${stats.monthlyWorkItemCount}项工作`,
      },
    ];
  };

  // 复制日报内容为YAML格式
  const handleCopyReport = (e: React.MouseEvent, report: Report) => {
    e.stopPropagation();
    
    // 获取报告中涉及的所有项目
    const reportProjects = getReportProjects(report);
    
    let yamlContent = '';
    
    // 按项目组织工作内容
    reportProjects.forEach(project => {
      yamlContent += `${project.name}:\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectWorkItems(report, project.id);
      projectItems.forEach(item => {
        yamlContent += `  - ${item.content}\n`;
      });
      
      // 移除项目之间的换行
    });
    
    try {
      // 使用异步函数进行复制
      if (navigator.clipboard && window.isSecureContext) {
        // 安全上下文中使用标准 Clipboard API
        navigator.clipboard.writeText(yamlContent)
          .then(() => {
            toast.success('日报内容已复制到剪贴板');
          })
          .catch(err => {
            console.error('复制失败:', err);
            fallbackCopyTextToClipboard(yamlContent);
          });
      } else {
        // 回退方法，适用于非安全上下文
        fallbackCopyTextToClipboard(yamlContent);
      }
    } catch (err) {
      console.error('复制失败:', err);
      toast.error('复制失败，请重试');
    }
  };

  // 回退复制方法
  const fallbackCopyTextToClipboard = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // 避免滚动到底部
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          toast.success('日报内容已复制到剪贴板');
        } else {
          toast.error('复制失败，请重试');
        }
      } catch (err) {
        console.error('复制命令执行失败:', err);
        toast.error('复制失败，请重试');
      }
      
      document.body.removeChild(textArea);
    } catch (err) {
      console.error('回退复制方法失败:', err);
      toast.error('复制失败，请重试');
    }
  };

  // 处理日报选择，显示预览
  const handleReportSelect = (report: Report) => {
    setPreviewReport(report);
    setIsPreviewOpen(true);
  };

  // 关闭预览
  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewReport(null);
  };

  // 获取未完成的待办项目及待办
  const fetchUncompletedTodos = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingTodos(true);
    try {
      // 获取所有活跃项目
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, code, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true);
        
      if (projectsError) throw projectsError;
      
      // 获取所有未完成的待办
      const { data: todosData, error: todosError } = await supabase
        .from("project_todos")
        .select("id, content, priority, due_date, status, completed_at, project_id")
        .eq("user_id", user.id)
        .not("status", "eq", "completed")
        .order("due_date", { ascending: true });
        
      if (todosError) throw todosError;
      
      // 按项目分组待办
      const projectsMap: Record<string, ProjectWithTodos> = {};
      
      // 初始化项目映射
      (projectsData || []).forEach((project: any) => {
        projectsMap[project.id] = {
          id: project.id,
          name: project.name,
          code: project.code,
          todos: []
        };
      });
      
      // 将待办添加到对应项目
      (todosData || []).forEach((todo: any) => {
        if (projectsMap[todo.project_id]) {
          projectsMap[todo.project_id].todos.push(todo);
        }
      });
      
      // 转换为数组并过滤掉没有待办的项目
      const projectsWithTodosArray = Object.values(projectsMap)
        .filter(project => project.todos.length > 0);
        
      setProjectsWithTodos(projectsWithTodosArray);
    } catch (error) {
      console.error('获取未完成待办失败', error);
    } finally {
      setIsLoadingTodos(false);
    }
  }, [user, supabase]);
  
  // 在组件加载时获取未完成待办
  useEffect(() => {
    if (user) {
      fetchUncompletedTodos();
    }
  }, [user, fetchUncompletedTodos]);

  // 根据当前标签过滤报告
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (activeReportTab === 'reports') {
        return !report.is_plan;
      } else if (activeReportTab === 'plans') {
        return !!report.is_plan;
      }
      return false;
    }).slice(0, 3); // 只显示前3条
  }, [reports, activeReportTab]);

  // 检查是否为今天的日报
  const isToday = useCallback((dateString: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return dateString === today;
  }, []);

  // 复制到钉钉
  const handleCopyToDingTalk = () => {
    if (!previewReport || !dingTalkSettings || !dingTalkSettings.is_enabled) return;
    
    // 获取报告中涉及的所有项目
    const reportProjects = getReportProjects(previewReport);
    
    let yamlContent = '';
    
    // 按项目组织工作内容
    reportProjects.forEach(project => {
      yamlContent += `${project.name}:\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectWorkItems(previewReport, project.id);
      projectItems.forEach(item => {
        yamlContent += `  - ${item.content}\n`;
      });
    });
    
    try {
      // 判断是否是iOS设备
      if (isIOS) {
        try {
          // 先尝试复制内容到剪贴板
          fallbackCopyTextToClipboard(yamlContent);
          toast.success('内容已复制到剪贴板');
          
          // 延迟一下再跳转，确保复制操作完成
          setTimeout(() => {
            try {
              // 构建URL Scheme，确保URL编码正确
              const encodedContent = encodeURIComponent(yamlContent);
              
              // 检查URL scheme格式是否正确，确保以正确的格式结尾
              let dingTalkUrl = dingTalkSettings.ios_url_scheme;
              if (!dingTalkUrl.endsWith('=')) {
                // 如果URL不是以=结尾，确保有合适的连接符
                if (!dingTalkUrl.endsWith('/') && !dingTalkUrl.endsWith('=') && !dingTalkUrl.endsWith('?')) {
                  dingTalkUrl += '?url=';
                }
              }
              
              // 构建最终URL
              const finalUrl = `${dingTalkUrl}${encodedContent}`;
              console.log('跳转到钉钉URL:', finalUrl);
              
              // 使用iframe方式跳转，这在iOS上更可靠
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = finalUrl;
              document.body.appendChild(iframe);
              
              // 短暂延迟后移除iframe
              setTimeout(() => {
                document.body.removeChild(iframe);
                
                // 作为备用，也尝试直接跳转
                window.location.href = finalUrl;
              }, 100);
            } catch (err) {
              console.error('钉钉跳转失败:', err);
              toast.error('跳转到钉钉失败，请手动粘贴内容');
            }
          }, 300);
        } catch (err) {
          console.error('复制或跳转失败:', err);
          toast.error('操作失败，请重试');
        }
      } else {
        // 非iOS设备只复制内容并提示
        fallbackCopyTextToClipboard(yamlContent);
        toast.info('内容已复制到剪贴板，此功能仅支持iOS客户端直接跳转到钉钉');
      }
    } catch (err) {
      console.error('操作失败:', err);
      toast.error('操作失败，请重试');
      
      // 作为最后的备用方案，至少尝试复制内容
      try {
        fallbackCopyTextToClipboard(yamlContent);
        toast.info('内容已复制到剪贴板，但跳转失败');
      } catch (e) {
        console.error('备用复制也失败:', e);
      }
    }
  };

  if (loading || isLoading || !user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">欢迎回来，{user.name}</h1>
        <p className="text-xs md:text-sm text-gray-500">
          <span className="hidden md:inline">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="inline md:hidden">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {generateStatsCards().map((stat) => (
          <div
            key={stat.id}
            className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6 flex items-start space-x-2 md:space-x-3"
          >
            <div className="rounded-full p-1.5 md:p-2 lg:p-3 bg-gray-50 flex-shrink-0">
              <div className="w-4 h-4 md:w-5 md:h-5 lg:h-6 lg:w-6">
                {stat.icon}
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs md:text-sm">{stat.name}</p>
              <p className="text-lg md:text-xl lg:text-2xl font-bold">
                {stat.value}
                <span className="text-xs md:text-sm font-normal text-gray-500 ml-1">
                  {stat.unit}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5 md:mt-1 hidden md:block">{stat.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 最近日报 */}
      <div className="bg-white rounded-lg shadow">
        {/* 切换标签 */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 md:space-x-8 px-4 md:px-6">
            <button
              onClick={() => setActiveReportTab("reports")}
              className={`py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm ${
                activeReportTab === "reports"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              最近日报
            </button>
            <button
              onClick={() => setActiveReportTab("plans")}
              className={`py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm ${
                activeReportTab === "plans"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              最近计划
            </button>
            <button
              onClick={() => setActiveReportTab("todos")}
              className={`py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm ${
                activeReportTab === "todos"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              待办计划
            </button>
          </nav>
        </div>
        
        {/* 内容区域 */}
        <div className="p-3 md:p-6">
          {activeReportTab !== 'todos' ? (
            // 日报和计划内容显示
            <>
              <div className="flex justify-end mb-2">
                <Link 
                  href={activeReportTab === 'reports' ? "/dashboard/daily-reports" : "/dashboard/daily-reports?tab=plans"} 
                  className="text-xs md:text-sm text-blue-600 hover:text-blue-800"
                >
                  查看全部
                </Link>
              </div>
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                <div 
                  key={report.id} 
                  className={`p-3 md:p-4 lg:p-6 cursor-pointer hover:bg-gray-50 ${isToday(report.date) ? 'bg-blue-50' : ''}`}
                  onClick={() => handleReportSelect(report)}
                >
                  <div className="flex justify-between items-start">
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm md:text-base font-medium ${isToday(report.date) ? 'text-blue-700' : ''}`}>
                          {format(parseISO(report.date), 'yyyy-MM-dd')}
                          {isToday(report.date) && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                              今日
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center space-x-1 md:space-x-2">
                          <button 
                            onClick={(e) => {e.stopPropagation(); handleCopyReport(e, report);}}
                            className="p-1 md:p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                            title="复制日报内容"
                          >
                            <CopyIcon className="h-3 w-3 md:h-4 md:w-4" />
                          </button>
                          {report.is_plan ? (
                            <span className="px-1.5 md:px-2 py-0.5 md:py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              已计划
                            </span>
                          ) : (
                            <span className="px-1.5 md:px-2 py-0.5 md:py-1 text-xs rounded-full bg-green-100 text-green-800">
                              {report.status}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1">
                        {report.is_plan ? '计划工作内容' : '今日工作内容'}
                      </p>
                      
                      <div className="mt-2 md:mt-3 space-y-2 md:space-y-3">
                        {getReportProjects(report).map(project => (
                          <div key={project.id} className={`border-l-2 ${isToday(report.date) ? 'border-blue-600' : 'border-blue-500'} pl-2 md:pl-3`}>
                            <div className="text-xs md:text-sm font-medium text-blue-600 mb-0.5 md:mb-1">
                              {project.name} ({project.code})
                            </div>
                            <ul className="space-y-0.5 md:space-y-1">
                              {getProjectWorkItems(report, project.id).map((item, idx) => (
                                <li key={idx} className="text-xs md:text-sm text-gray-500 flex items-start">
                                  <span className="mr-1 md:mr-2 text-gray-400">•</span>
                                  <span>{item.content}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 md:p-6 text-center text-xs md:text-sm text-gray-500">
                暂无{activeReportTab === 'reports' ? '日报' : '计划'}记录，<Link href="/dashboard/daily-reports/new" className="text-blue-600 hover:text-blue-800">去创建一个</Link>
              </div>
            )}
          </>
          ) : (
            // 待办计划内容显示
            <div>
              {isLoadingTodos ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : projectsWithTodos.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">
                  暂无未完成待办，<Link href="/dashboard/todos" className="text-blue-600 hover:text-blue-800">去创建一个</Link>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex justify-between items-center">
                    <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                      <div className="flex items-center">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1"></span>
                        <span>高优先级</span>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 mr-1"></span>
                        <span>中优先级</span>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                        <span>低优先级</span>
                      </div>
                    </div>
                    <Link href="/dashboard/todos" className="text-xs md:text-sm text-blue-600 hover:text-blue-800">
                      查看全部
                    </Link>
                  </div>
                  
                  <div className="space-y-4">
                    {projectsWithTodos.map(project => (
                      <div key={project.id} className="border-l-2 border-blue-500 pl-3 py-1">
                        <div className="text-sm font-medium text-blue-600 mb-2 flex items-center">
                          <FileTextIcon className="h-3.5 w-3.5 mr-1.5" />
                          {project.name} ({project.code})
                        </div>
                        <div className="space-y-2">
                          {project.todos.map(todo => (
                            <div key={todo.id} className="flex items-start">
                              {/* 状态图标 */}
                              {todo.status === 'not_started' ? (
                                <ClockIcon className="h-3.5 w-3.5 mr-1.5 text-gray-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <PlayIcon className="h-3.5 w-3.5 mr-1.5 text-blue-600 mt-0.5 flex-shrink-0" />
                              )}
                              
                              {/* 待办内容 */}
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <span className={`mr-2 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                                    todo.priority === 'high' ? 'bg-red-500' : 
                                    todo.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                  }`}></span>
                                  <span className="text-xs md:text-sm text-gray-700">{todo.content}</span>
                                </div>
                                <div className="ml-4 text-xs text-gray-400 mt-0.5">
                                  截止日期: {todo.due_date}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 日报预览弹窗 */}
      {isPreviewOpen && previewReport && (
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 overflow-hidden"
          onClick={closePreview}
        >
          <div 
            className="bg-white rounded-lg p-3 md:p-6 max-w-4xl w-full mx-2 md:mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 md:mb-4">
              <h3 className="text-sm md:text-lg font-medium text-gray-900 truncate pr-2">
                日报详情 - {previewReport.date}
              </h3>
              <button
                onClick={closePreview}
                className="text-gray-400 hover:text-gray-500"
              >
                <XIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>
            
            <div className="flex items-center mb-2 md:mb-4">
              {previewReport.is_plan ? (
                <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  工作计划
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  已提交
                </span>
              )}
            </div>
            
            <div className="flex-grow overflow-auto">
              <div className="space-y-3 md:space-y-4">
                {getReportProjects(previewReport).map(project => (
                  <div key={project.id} className="border-l-2 border-blue-500 pl-2 md:pl-4 py-1 md:py-2">
                    <div className="flex items-center mb-1 md:mb-2">
                      <div className="text-sm font-medium text-blue-600">
                        {project.name}
                      </div>
                      <div className="text-sm text-gray-500 ml-1">
                        ({project.code})
                      </div>
                    </div>
                    <ul className="space-y-1 md:space-y-2">
                      {getProjectWorkItems(previewReport, project.id).map((item, idx) => (
                        <li key={idx} className="text-xs md:text-sm text-gray-600 flex items-start">
                          <span className="mr-1 md:mr-2 text-blue-400 flex-shrink-0">•</span>
                          <span className="break-words">{item.content}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end space-x-1 md:space-x-3 mt-3 md:mt-4">
              <button
                onClick={(e) => {e.stopPropagation(); handleCopyReport(e, previewReport);}}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <CopyIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                复制内容
              </button>
              {dingTalkSettings && dingTalkSettings.is_enabled && (
                <button
                  onClick={(e) => {e.stopPropagation(); handleCopyToDingTalk();}}
                  className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <svg viewBox="0 0 1024 1024" width="16" height="16" className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1 fill-current text-blue-600">
                    <path d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1-5 61.1 33.6 160.5 53.6 182.8 19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8 11.4 61.7 64.9 131.8 107.2 138.4 42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8-33.1 12.5 24 62.6 24 62.6 84.7 76.8 129.7 50.5 129.7 50.5 33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8 17-71.3-114.5-99.4-265.8-154.5z"/>
                  </svg>
                  复制到钉钉
                </button>
              )}
              <Link
                href={`/dashboard/daily-reports/new?date=${previewReport.date}`}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                onClick={(e) => e.stopPropagation()}
              >
                <PencilIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                编辑日报
              </Link>
              <button
                onClick={closePreview}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-transparent text-xs md:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}