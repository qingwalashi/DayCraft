"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { PlusIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, CopyIcon, XIcon, AlertCircleIcon, CalendarIcon, FileTextIcon, ClipboardListIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, DailyReport, ReportItem, UserDingTalkSettings } from "@/lib/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, getWeek, getMonth, getYear, addWeeks, subWeeks, isSameDay, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePersistentState } from "@/lib/utils/page-persistence";

interface ReportWithItems {
  id: string;
  date: string;
  day: string;
  status: string;
  items: ReportItemWithProject[];
  is_plan?: boolean; // 是否为工作计划
}

interface ReportItemWithProject {
  id: string;
  content: string;
  project: Project;
}

// 添加接口定义
interface DailyReportData {
  id: string;
  date: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_plan?: boolean; // 是否为工作计划
}

interface ReportItemData {
  id: string;
  content: string;
  projects: Project | Project[];
}

// 新增日期项接口
interface DayItem {
  date: string;
  formattedDate: string;
  day: string;
  hasReport: boolean;
  report: ReportWithItems | null;
}

// 新增周数据接口
interface WeekData {
  weekNumber: number;
  year: number;
  startDate: Date;
  endDate: Date;
  formattedPeriod: string;
  days: DayItem[];
}

// 面包屑组件
interface BreadcrumbsProps {
  year: number;
  month: number;
  weekNumber: number;
  onWeekChange: (weekIndex: number) => void;
  currentWeekIndex: number;
  maxWeekIndex: number;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ 
  year, 
  month, 
  weekNumber, 
  onWeekChange,
  currentWeekIndex,
  maxWeekIndex
}) => {
  return (
    <div className="flex items-center text-xs md:text-sm text-gray-500 mb-2 md:mb-4">
      <button 
        onClick={() => onWeekChange(currentWeekIndex + 1)}
        disabled={currentWeekIndex >= maxWeekIndex}
        className="mr-1 md:mr-2 p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="上一周"
      >
        <ChevronLeftIcon className="h-3 w-3 md:h-4 md:w-4" />
      </button>
      <span className="font-medium text-gray-700 whitespace-nowrap">{year}年{month}月<span className="hidden md:inline"> (第{weekNumber}周)</span></span>
      <button 
        onClick={() => onWeekChange(currentWeekIndex - 1)}
        disabled={currentWeekIndex <= 0}
        className="ml-1 md:ml-2 p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="下一周"
      >
        <ChevronRightIcon className="h-3 w-3 md:h-4 md:w-4" />
      </button>
    </div>
  );
};

// 添加待办相关接口
interface Todo {
  id: string;
  content: string;
  priority: string;
  due_date: string;
  status: string;
  completed_at?: string;
  project_id: string;
}

interface ProjectWithTodos {
  id: string;
  name: string;
  code: string;
  todos: Todo[];
}

export default function DailyReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dingTalkSettings, setDingTalkSettings] = useState<UserDingTalkSettings | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  
  // 使用持久化状态替代普通状态
  const [reports, setReports] = usePersistentState<ReportWithItems[]>('daily-reports-reports', []);
  const [projects, setProjects] = usePersistentState<Project[]>('daily-reports-projects', []);
  const [previewReport, setPreviewReport] = usePersistentState<ReportWithItems | null>('daily-reports-preview', null);
  const [weekData, setWeekData] = usePersistentState<WeekData[]>('daily-reports-week-data', []);
  const [currentWeekIndex, setCurrentWeekIndex] = usePersistentState<number>('daily-reports-current-week', 0);
  const [isPreviewOpen, setIsPreviewOpen] = usePersistentState<boolean>('daily-reports-preview-open', false);
  const [todayReportReminder, setTodayReportReminder] = usePersistentState<{
    date: string;
    hasReport: boolean;
  } | null>('daily-reports-today-reminder', null);
  
  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const weekDataLoadedRef = useRef<Record<string, boolean>>({});
  // 添加最后数据加载时间戳
  const lastLoadTimeRef = useRef<number>(0);
  // 数据刷新间隔（毫秒），设置为5分钟
  const DATA_REFRESH_INTERVAL = 5 * 60 * 1000;
  // 添加请求状态跟踪，避免重复请求
  const isRequestingRef = useRef<Record<string, boolean>>({});
  // 防抖延迟
  const DEBOUNCE_DELAY = 300;

  // 当前选中的周数据
  const currentWeekData = useMemo(() => {
    return weekData[currentWeekIndex] || null;
  }, [weekData, currentWeekIndex]);

  // 获取当前月份和年份
  const currentMonth = useMemo(() => {
    if (!currentWeekData) return new Date().getMonth() + 1;
    return getMonth(currentWeekData.startDate) + 1;
  }, [currentWeekData]);

  const currentYear = useMemo(() => {
    if (!currentWeekData) return new Date().getFullYear();
    return getYear(currentWeekData.startDate);
  }, [currentWeekData]);

  // 初始化周数据结构 - 使用useCallback
  const initWeekData = useCallback(() => {
    // 检查是否已经初始化过
    if (dataLoadedRef.current) {
      console.log('周数据已初始化，跳过');
      return;
    }
    
    console.log('初始化周数据结构');
    const today = new Date();
    const weeks: WeekData[] = [];
    
    // 生成最近12周的数据结构
    for (let i = 0; i < 12; i++) {
      const weekStartDate = startOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 7), { locale: zhCN });
      const weekEndDate = endOfWeek(weekStartDate, { locale: zhCN });
      const weekNumber = getWeek(weekStartDate, { locale: zhCN });
      const year = getYear(weekStartDate);
      
      // 获取这一周的所有日期
      const weekDates = eachDayOfInterval({ start: weekStartDate, end: weekEndDate });
      
      // 创建每天的初始数据
      const days: DayItem[] = weekDates.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const day = format(date, 'EEEE', { locale: zhCN });
        
        return {
          date: dateStr,
          formattedDate: format(date, 'yyyy-MM-dd'),
          day,
          hasReport: false,
          report: null
        };
      });
      
      weeks.push({
        weekNumber,
        year,
        startDate: weekStartDate,
        endDate: weekEndDate,
        formattedPeriod: `${format(weekStartDate, 'yyyy-MM-dd')} 至 ${format(weekEndDate, 'yyyy-MM-dd')}`,
        days
      });
    }
    
    setWeekData(weeks);
    dataLoadedRef.current = true;
  }, [setWeekData]);

  // 检查今天的日报状态 - 使用useCallback
  const checkTodayReport = useCallback(async () => {
    if (!user) return;
    
    console.log('检查今日日报状态');
    try {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      
      // 查询今天的日报
      const { data: todayReport, error } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', todayStr)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.error('检查今日日报失败', error);
        return;
      }
      
      // 设置今日日报提醒状态
      setTodayReportReminder({
        date: todayStr,
        hasReport: !!todayReport
      });
      
    } catch (error) {
      console.error('检查今日日报失败', error);
    }
  }, [user, supabase, setTodayReportReminder]);

  // 更新周数据中的日报信息 - 使用useCallback
  const updateWeekData = useCallback((week: WeekData, reports: ReportWithItems[]) => {
    setWeekData(prevWeeks => {
      const updatedWeeks = [...prevWeeks];
      const weekIndex = updatedWeeks.findIndex(w => 
        w.year === week.year && w.weekNumber === week.weekNumber
      );
      
      if (weekIndex !== -1) {
        const updatedDays = [...updatedWeeks[weekIndex].days];
        
        // 更新每一天的日报状态
        updatedDays.forEach((day, index) => {
          const report = reports.find(r => r.date === day.date);
          updatedDays[index] = {
            ...day,
            hasReport: !!report,
            report: report || null
          };
          
          // 如果是今天，更新今日日报提醒状态
          if (isToday(parseISO(day.date))) {
            setTodayReportReminder({
              date: day.date,
              hasReport: !!report
            });
          }
        });
        
        updatedWeeks[weekIndex] = {
          ...updatedWeeks[weekIndex],
          days: updatedDays
        };
      }
      
      return updatedWeeks;
    });
    
    // 更新全局reports状态，用于预览等功能
    setReports(reports);
  }, [setWeekData, setTodayReportReminder, setReports]);

  // 获取指定周的日报数据 - 使用useCallback
  const fetchWeekReports = useCallback(async (week: WeekData, forceUpdate: boolean = false) => {
    if (!user || !week) return;
    
    // 创建周的唯一标识符
    const weekKey = `${week.year}-${week.weekNumber}`;
    
    // 检查是否正在请求中，避免重复请求
    if (isRequestingRef.current[weekKey]) {
      console.log(`周 ${weekKey} 正在请求中，跳过重复请求`);
      return;
    }
    
    // 检查该周的数据是否已经加载过，如果强制更新则忽略此检查
    if (!forceUpdate && weekDataLoadedRef.current[weekKey]) {
      console.log(`周 ${weekKey} 的数据已加载，跳过重新获取`);
      setIsLoading(false);
      return;
    }
    
    // 检查是否超过刷新间隔，如果强制更新则忽略此检查
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    if (!forceUpdate && lastLoadTimeRef.current > 0 && timeSinceLastLoad < DATA_REFRESH_INTERVAL) {
      console.log(`数据加载间隔小于${DATA_REFRESH_INTERVAL/1000}秒，跳过重新获取`);
      setIsLoading(false);
      return;
    }
    
    console.log(`加载周 ${weekKey} 的日报数据${forceUpdate ? '(强制刷新)' : ''}`);
    
    // 设置请求状态
    isRequestingRef.current[weekKey] = true;
    setIsLoading(true);
    try {
      // 获取项目数据（只需获取一次）
      if (projects.length === 0) {
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id);
        
        if (projectsError) {
          throw projectsError;
        }
        
        setProjects(projectsData as Project[] || []);
      }
      
      // 获取该周日期范围内的日报数据
      const startDateStr = format(week.startDate, 'yyyy-MM-dd');
      const endDateStr = format(week.endDate, 'yyyy-MM-dd');
      
      const { data: reportsData, error: reportsError } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);
      
      if (reportsError) {
        throw reportsError;
      }
      
      const reportsWithItems: ReportWithItems[] = [];
      
      // 获取每个日报的工作项
      for (const report of (reportsData as unknown as DailyReportData[]) || []) {
        // 获取该日报的所有工作项
        const { data: reportItemsData, error: reportItemsError } = await supabase
          .from('report_items')
          .select(`
            id,
            content,
            projects:project_id (
              id, name, code, description
            )
          `)
          .eq('report_id', report.id);
        
        if (reportItemsError) {
          console.error('获取日报项目失败', reportItemsError);
          continue;
        }
        
        // 格式化日期和星期
        const reportDate = parseISO(report.date);
        const day = format(reportDate, 'EEEE', { locale: zhCN });
        const formattedDate = format(reportDate, 'yyyy-MM-dd');
        
        const items = (reportItemsData as unknown as ReportItemData[] || []).map(item => {
          // 确保projects是单个Project对象而不是数组
          const project = Array.isArray(item.projects) ? item.projects[0] : item.projects;
          return {
            id: item.id as string,
            content: item.content as string,
            project: project as Project
          };
        });
        
        reportsWithItems.push({
          id: report.id,
          date: formattedDate,
          day,
          status: '已提交', // 日报状态，目前只有一种状态
          items,
          is_plan: report.is_plan
        });
      }
      
      // 更新当前周的日报数据
      updateWeekData(week, reportsWithItems);
      
      // 标记该周数据已加载
      weekDataLoadedRef.current[weekKey] = true;
      lastLoadTimeRef.current = now;
      
    } catch (error) {
      console.error('加载数据失败', error);
      toast.error('加载数据失败');
    } finally {
      // 清除请求状态
      isRequestingRef.current[weekKey] = false;
      setIsLoading(false);
    }
  }, [user, supabase, setProjects, updateWeekData]);

  // 加载项目和日报数据
  useEffect(() => {
    if (!user) return;
    
    // 初始化周数据结构
    initWeekData();
    
    // 检查今天的日报状态
    checkTodayReport();
  }, [user]);

  // 仅在首次加载和没有强制刷新的情况下加载该周的日报数据
  const isFirstLoadRef = useRef<Record<number, boolean>>({});

  // 当周索引变化时，加载该周的日报数据（避免与强制刷新冲突）
  useEffect(() => {
    if (user && weekData.length > 0) {
      // 如果是首次加载该周的数据，正常获取
      if (!isFirstLoadRef.current[currentWeekIndex]) {
        isFirstLoadRef.current[currentWeekIndex] = true;
        fetchWeekReports(weekData[currentWeekIndex]);
      }
    }
  }, [user, currentWeekIndex, weekData.length]);

  // 在页面可见性变化时的处理逻辑
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && user) {
          console.log('日报页面恢复可见，检查数据状态');
          
          // 检查是否需要重新加载数据
          const now = Date.now();
          const timeSinceLastLoad = now - lastLoadTimeRef.current;
          
          // 检查今日日报状态 - 这个功能保留，因为它很重要
          checkTodayReport();
          
          // 如果超过刷新间隔，重新加载数据
          if (timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
            console.log('数据超过刷新间隔，重新加载');
            if (currentWeekData) {
              fetchWeekReports(currentWeekData, true);
            }
          } else {
            console.log('数据在刷新间隔内，保持现有数据');
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, currentWeekData, checkTodayReport, fetchWeekReports]);

  // 处理周切换
  const handleWeekChange = (weekIndex: number) => {
    if (weekIndex >= 0 && weekIndex < weekData.length) {
      setCurrentWeekIndex(weekIndex);
      
      // 在周切换后强制刷新数据
      if (user && weekData[weekIndex]) {
        // 延迟一点执行，确保状态已更新
        setTimeout(() => {
          fetchWeekReports(weekData[weekIndex], true);
        }, 10);
      }
    }
  };

  // 强制刷新当前周数据
  const handleRefreshData = () => {
    if (user && currentWeekData) {
      toast.info('正在刷新数据...');
      // 强制刷新当前周数据
      fetchWeekReports(currentWeekData, true);
    }
  };

  // 切换到上一周
  const handlePreviousWeek = () => {
    if (currentWeekIndex < weekData.length - 1) {
      const newIndex = currentWeekIndex + 1;
      setCurrentWeekIndex(newIndex);
      
      // 强制刷新数据
      if (user && weekData[newIndex]) {
        setTimeout(() => {
          fetchWeekReports(weekData[newIndex], true);
        }, 10);
      }
    }
  };

  // 切换到下一周
  const handleNextWeek = () => {
    if (currentWeekIndex > 0) {
      const newIndex = currentWeekIndex - 1;
      setCurrentWeekIndex(newIndex);
      
      // 强制刷新数据
      if (user && weekData[newIndex]) {
        setTimeout(() => {
          fetchWeekReports(weekData[newIndex], true);
        }, 10);
      }
    }
  };

  // 显示删除确认对话框
  const handleDeleteClick = (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    setReportToDelete(reportId);
    setConfirmDeleteOpen(true);
  };

  // 取消删除操作
  const handleCancelDelete = () => {
    setReportToDelete(null);
    setConfirmDeleteOpen(false);
  };

  // 确认删除日报
  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    
    setIsDeletingReport(true);
    try {
      console.log(`正在删除日报 ID: ${reportToDelete}`);
      
      // 获取要删除的日报内容，用于调试
      const { data: reportToDeleteData, error: checkError } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('id', reportToDelete)
        .single();
      
      if (checkError) {
        console.error('获取要删除的日报数据失败', checkError);
      } else {
        console.log('将删除的日报详情:', reportToDeleteData);
      }

      // 获取要删除的日报项目数量，用于调试
      const { data: reportItemsToDelete, error: itemsCheckError } = await supabase
        .from('report_items')
        .select('id')
        .eq('report_id', reportToDelete);
      
      if (itemsCheckError) {
        console.error('获取要删除的日报项目失败', itemsCheckError);
      } else {
        console.log(`该日报有 ${reportItemsToDelete?.length || 0} 个工作项将被删除`);
      }
      
      // 首先删除该日报的所有工作项
      const { error: deleteItemsError } = await supabase
        .from('report_items')
        .delete()
        .eq('report_id', reportToDelete);
      
      if (deleteItemsError) {
        console.error('删除日报工作项失败', deleteItemsError);
        throw new Error(`删除日报工作项失败: ${deleteItemsError.message}`);
      }
      
      // 验证工作项是否已删除
      const { data: remainingItems, error: verifyError } = await supabase
        .from('report_items')
        .select('id')
        .eq('report_id', reportToDelete);
      
      if (verifyError) {
        console.error('验证删除结果失败', verifyError);
      } else {
        console.log(`删除后还剩余 ${remainingItems?.length || 0} 个工作项`);
        if (remainingItems && remainingItems.length > 0) {
          console.warn('警告：部分工作项未被删除');
        } else {
          console.log('所有工作项已成功删除');
        }
      }
      
      // 等待工作项删除完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 删除日报本身
      const { data: deleteResult, error: deleteReportError } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', reportToDelete)
        .select();
      
      if (deleteReportError) {
        console.error('删除日报失败', deleteReportError);
        throw new Error(`删除日报失败: ${deleteReportError.message}`);
      }
      
      console.log('删除操作返回结果:', deleteResult);
      
      // 验证日报是否已被删除
      const { data: checkReportDeleted, error: checkDeleteError } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('id', reportToDelete);
      
      if (checkDeleteError) {
        console.error('验证日报删除失败', checkDeleteError);
      } else {
        if (checkReportDeleted && checkReportDeleted.length > 0) {
          console.warn('警告：日报记录仍然存在！', checkReportDeleted);
        } else {
          console.log('日报记录已成功删除');
        }
      }
      
      // 从状态中移除被删除的日报
      setReports(prev => prev.filter(report => report.id !== reportToDelete));
      toast.success('日报删除成功');
      
      // 立即刷新当前周的数据，确保UI显示正确
      if (currentWeekData) {
        // 重置该周的加载状态，确保重新获取数据
        const weekKey = `${currentWeekData.year}-${currentWeekData.weekNumber}`;
        weekDataLoadedRef.current[weekKey] = false;
        
        // 强制刷新数据
        fetchWeekReports(currentWeekData, true);
      }
      
    } catch (error) {
      console.error('删除日报时出错', error);
      toast.error(`删除日报失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsDeletingReport(false);
      setReportToDelete(null);
      setConfirmDeleteOpen(false);
    }
  };

  // 编辑日报
  const handleEditClick = (e: React.MouseEvent, date: string) => {
    e.stopPropagation();
    router.push(`/dashboard/daily-reports/new?date=${date}`);
  };

  // 复制日报内容为YAML格式
  const handleCopyReport = (e: React.MouseEvent, report: ReportWithItems) => {
    e.stopPropagation();
    
    // 获取报告中涉及的所有项目
    const reportProjects = getReportProjects(report);
    
    let yamlContent = '';
    
    // 按项目组织工作内容
    reportProjects.forEach(project => {
      yamlContent += `${project.name}:\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectItems(report, project.id);
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

  // 获取特定项目下的工作项
  const getProjectItems = (report: ReportWithItems, projectId: string) => {
    return report.items.filter(item => item.project.id === projectId);
  };

  // 获取报告中涉及的所有项目
  const getReportProjects = (report: ReportWithItems) => {
    const projectMap = new Map<string, Project>();
    
    report.items.forEach(item => {
      if (item.project && !projectMap.has(item.project.id)) {
        projectMap.set(item.project.id, item.project);
      }
    });
    
    return Array.from(projectMap.values());
  };

  // 处理日报选择，显示预览
  const handleReportSelect = (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (report) {
      setPreviewReport(report);
      setIsPreviewOpen(true);
    }
  };

  // 关闭预览
  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewReport(null);
  };

  // 在预览中复制日报内容
  const handlePreviewCopy = () => {
    if (!previewReport) return;
    
    // 获取报告中涉及的所有项目
    const reportProjects = getReportProjects(previewReport);
    
    let yamlContent = '';
    
    // 按项目组织工作内容
    reportProjects.forEach(project => {
      yamlContent += `${project.name}:\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectItems(previewReport, project.id);
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

  // 检测平台是否为iOS
  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
  }, []);

  // 加载钉钉设置
  useEffect(() => {
    async function loadDingTalkSettings() {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from("user_dingtalk_settings")
          .select("*")
          .eq("user_id", user.id)
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
  }, [user, supabase]);

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
      const projectItems = getProjectItems(previewReport, project.id);
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

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
        <h1 className="text-xl md:text-2xl font-bold">日报管理</h1>
      </div>

      {/* 今日日报提醒 */}
      {todayReportReminder && !todayReportReminder.hasReport && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircleIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                您今天还没有填写日报，
                <Link 
                  href={`/dashboard/daily-reports/new?date=${todayReportReminder.date}`}
                  className="font-medium underline text-blue-700 hover:text-blue-600"
                >
                  立即填写
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 日报列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-base md:text-lg font-medium">日报列表</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshData}
                disabled={isLoading}
                className="px-2 py-1 rounded hover:bg-blue-100 text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center border border-blue-200"
                aria-label="刷新数据"
                title="刷新当前周数据"
              >
                <svg 
                  className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isLoading ? 'animate-spin' : ''}`} 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="ml-1 text-xs md:text-sm">刷新</span>
              </button>
              {currentWeekData && (
                <Breadcrumbs 
                  year={currentYear}
                  month={currentMonth}
                  weekNumber={currentWeekData.weekNumber}
                  onWeekChange={handleWeekChange}
                  currentWeekIndex={currentWeekIndex}
                  maxWeekIndex={weekData.length - 1}
                />
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center p-6 md:p-12">
            <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm md:text-base text-gray-500">加载中...</span>
          </div>
        ) : weekData.length === 0 ? (
          <div className="p-4 md:p-8 text-center">
            <p className="text-sm md:text-base text-gray-500">暂无日报数据</p>
          </div>
        ) : (
          <div>
            <ul className="divide-y divide-gray-200">
                {currentWeekData && currentWeekData.days.map((day) => {
                  const isCurrentDay = isToday(parseISO(day.date));
                  return (
                  <li 
                      key={day.date} 
                      className={`p-3 md:p-4 ${day.hasReport ? 'cursor-pointer' : ''} ${isCurrentDay ? 'bg-blue-50' : ''}`}
                      onClick={() => day.hasReport && day.report && handleReportSelect(day.report.id)}
                    >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start flex-grow">
                        <div className="flex-shrink-0">
                          <FileTextIcon className={`h-5 w-5 md:h-6 md:w-6 ${day.hasReport ? 'text-blue-500' : 'text-gray-400'}`} />
                        </div>
                        <div className="ml-3 md:ml-4 flex-grow">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-wrap items-center gap-1 md:gap-2">
                              <h3 className={`text-sm md:text-base font-medium ${isCurrentDay ? 'text-blue-700 font-bold' : 'text-gray-900'}`}>
                                {format(parseISO(day.date), 'MM-dd')} <span className="hidden md:inline">({day.day})</span>
                              </h3>
                              {isCurrentDay && (
                                <span className="inline-flex items-center px-1.5 md:px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                今天
                              </span>
                            )}
                              {day.hasReport ? (
                                <>
                                  {day.report?.is_plan ? (
                                    <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      已计划
                              </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            已提交
                          </span>
                                  )}
                                </>
                        ) : (
                                <span className={`inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium ${isCurrentDay ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                            {isCurrentDay ? '今日待填' : '未提交'}
                          </span>
                        )}
                            </div>
                            <div className="flex items-center space-x-1 md:space-x-2">
                          <Link
                            href={`/dashboard/daily-reports/new?date=${day.date}`}
                                className={`inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md ${isCurrentDay ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-300' : 'text-gray-700 bg-white hover:bg-gray-50'}`}
                            title={day.hasReport ? "编辑日报" : "创建日报"}
                            onClick={(e) => e.stopPropagation()}
                          >
                              <PencilIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                              {day.hasReport ? "编辑" : "填写"}
                          </Link>
                          {day.hasReport && day.report && (
                            <>
                              <button
                                onClick={(e) => handleCopyReport(e, day.report!)}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                title="复制日报"
                              >
                                  <CopyIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                                  <span className="hidden md:inline">复制</span>
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(e, day.report!.id)}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-red-300 text-xs md:text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                                title="删除日报"
                              >
                                  <TrashIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                                  <span className="hidden md:inline">删除</span>
                              </button>
                            </>
                          )}
                        </div>
                          </div>
                          
                          <div className="mt-0.5 md:mt-1 flex items-center text-xs md:text-sm text-gray-500">
                            <CalendarIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                            <span className="hidden md:inline">{format(parseISO(day.date), 'yyyy年MM月dd日')}</span>
                            <span className="inline md:hidden">{format(parseISO(day.date), 'yyyy年MM月dd日')}</span>
                          </div>
                          
                          {day.hasReport && day.report && (
                            <div className="mt-1 md:mt-2 space-y-2">
                              {getReportProjects(day.report).map(project => {
                                // 使用非空断言确保TypeScript知道day.report不为null
                                const report = day.report!;
                                
                                return (
                                  <div key={project.id} className="border-l-2 border-blue-500 pl-2 py-0.5">
                                    <div className="flex items-center mb-0.5">
                                      <div className="text-sm font-medium text-blue-600">
                                        {project.name}
                                      </div>
                                      <div className="text-sm text-gray-500 ml-1">
                                        ({project.code})
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-600 line-clamp-1">
                                      {getProjectItems(report, project.id)
                                        .map(item => item.content)
                                        .join('；')}
                                    </div>
                                  </div>
                  );
                })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>

      {/* 周切换分页控件 */}
      {weekData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 md:gap-4 mt-3 md:mt-4">
          <div className="text-xs md:text-sm text-gray-700 text-center sm:text-left w-full sm:w-auto">
            {currentWeekData && (
              <>
                显示 <span className="font-medium">{currentWeekData.year}年第{currentWeekData.weekNumber}周</span> 的日报
              </>
            )}
          </div>
          <div className="flex items-center space-x-1 md:space-x-2">
            <button
              onClick={() => handleWeekChange(currentWeekIndex + 1)}
              disabled={currentWeekIndex >= weekData.length - 1}
              className="relative inline-flex items-center px-2 py-1.5 md:py-2 rounded-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">上一周</span>
              <ChevronLeftIcon className="h-4 w-4 md:h-5 md:w-5" />
            </button>
            <span className="relative inline-flex items-center px-3 md:px-4 py-1.5 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700">
              {currentWeekIndex + 1} / {weekData.length}
            </span>
            <button
              onClick={() => handleWeekChange(currentWeekIndex - 1)}
              disabled={currentWeekIndex <= 0}
              className="relative inline-flex items-center px-2 py-1.5 md:py-2 rounded-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">下一周</span>
              <ChevronRightIcon className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>
        </div>
      )}

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
                日报详情 - {previewReport.date} <span className="hidden md:inline">({previewReport.day})</span>
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
                      {getProjectItems(previewReport, project.id).map((item, idx) => (
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
                onClick={handlePreviewCopy}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <CopyIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                复制内容
              </button>
              {dingTalkSettings && dingTalkSettings.is_enabled && (
                <button
                  onClick={handleCopyToDingTalk}
                  className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <svg viewBox="0 0 1024 1024" width="16" height="16" className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1 fill-current text-blue-600">
                    <path d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1-5 61.1 33.6 160.5 53.6 182.8 19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8 11.4 61.7 64.9 131.8 107.2 138.4 42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8-33.1 12.5 24 62.6 24 62.6 84.7 76.8 129.7 50.5 129.7 50.5 33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8 17-71.3-114.5-99.4-265.8-154.5z"/>
                  </svg>
                  复制到钉钉
                </button>
              )}
              <button
                onClick={(e) => handleEditClick(e, previewReport.date)}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
              >
                <PencilIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                编辑日报
              </button>
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

      {/* 删除确认对话框 */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-3 md:p-6 max-w-md w-full mx-3 md:mx-4">
            <div className="mb-2 md:mb-4">
              <h3 className="text-base md:text-lg font-medium text-gray-900">确认删除</h3>
            </div>
            <div className="mb-4 md:mb-6">
              <p className="text-xs md:text-sm text-gray-700">确定要删除这份日报吗？此操作无法撤销。</p>
            </div>
            <div className="flex justify-end space-x-2 md:space-x-3">
              <button
                onClick={handleCancelDelete}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                disabled={isDeletingReport}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-transparent text-xs md:text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                disabled={isDeletingReport}
              >
                {isDeletingReport ? (
                  <>
                    <Loader2Icon className="h-3 w-3 md:h-4 md:w-4 mr-1 animate-spin" />
                    删除中...
                  </>
                ) : (
                  "确认删除"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 