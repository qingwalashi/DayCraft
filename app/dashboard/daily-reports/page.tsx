"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { PlusIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, CopyIcon, XIcon, AlertCircleIcon, CalendarIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, DailyReport, ReportItem } from "@/lib/supabase/client";
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

export default function DailyReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  
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
    if (weekData.length > 0) {
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
  }, [weekData.length, setWeekData]);

  // 检查今天的日报状态 - 使用useCallback
  const checkTodayReport = useCallback(async () => {
    if (!user) return;
    
    // 如果已经检查过今日日报状态，跳过
    if (todayReportReminder) {
      console.log('今日日报状态已检查，跳过');
      return;
    }
    
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
  }, [user, supabase, todayReportReminder, setTodayReportReminder]);

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
  const fetchWeekReports = useCallback(async (week: WeekData) => {
    if (!user || !week) return;
    
    // 创建周的唯一标识符
    const weekKey = `${week.year}-${week.weekNumber}`;
    
    // 检查该周的数据是否已经加载过
    if (weekDataLoadedRef.current[weekKey]) {
      console.log(`周 ${weekKey} 的数据已加载，跳过重新获取`);
      setIsLoading(false);
      return;
    }
    
    // 检查是否超过刷新间隔
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    if (lastLoadTimeRef.current > 0 && timeSinceLastLoad < DATA_REFRESH_INTERVAL) {
      console.log(`数据加载间隔小于${DATA_REFRESH_INTERVAL/1000}秒，跳过重新获取`);
      setIsLoading(false);
      return;
    }
    
    console.log(`加载周 ${weekKey} 的日报数据`);
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
      setIsLoading(false);
    }
  }, [user, supabase, projects, setProjects, updateWeekData]);

  // 加载项目和日报数据
  useEffect(() => {
    if (!user) return;
    
    // 初始化周数据结构
    initWeekData();
    
    // 检查今天的日报状态
    checkTodayReport();
  }, [user, initWeekData, checkTodayReport]);

  // 当周索引变化时，加载该周的日报数据
  useEffect(() => {
    if (user && weekData.length > 0) {
      fetchWeekReports(weekData[currentWeekIndex]);
    }
  }, [user, currentWeekIndex, weekData, fetchWeekReports]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('日报管理页面恢复可见，检查数据状态');
          
          // 检查是否需要重新加载当前周的数据
          if (user && weekData.length > 0) {
            const currentWeek = weekData[currentWeekIndex];
            if (currentWeek) {
              const weekKey = `${currentWeek.year}-${currentWeek.weekNumber}`;
              const now = Date.now();
              const timeSinceLastLoad = now - lastLoadTimeRef.current;
              
              // 如果超过刷新间隔，重新加载数据
              if (timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
                console.log('数据超过刷新间隔，重新加载');
                // 重置该周的加载状态
                weekDataLoadedRef.current[weekKey] = false;
                fetchWeekReports(currentWeek);
              } else {
                console.log('数据在刷新间隔内，保持现有数据');
              }
            }
          }
          
          // 更新今日日报状态
          checkTodayReport();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, weekData, currentWeekIndex, fetchWeekReports, checkTodayReport]);

  // 处理周切换
  const handleWeekChange = (weekIndex: number) => {
    if (weekIndex >= 0 && weekIndex < weekData.length) {
      setCurrentWeekIndex(weekIndex);
    }
  };

  // 切换到上一周
  const handlePreviousWeek = () => {
    if (currentWeekIndex < weekData.length - 1) {
      setCurrentWeekIndex(currentWeekIndex + 1);
    }
  };

  // 切换到下一周
  const handleNextWeek = () => {
    if (currentWeekIndex > 0) {
      setCurrentWeekIndex(currentWeekIndex - 1);
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
      
      // 刷新数据，确保UI显示正确
      setTimeout(() => {
        fetchWeekReports(weekData[currentWeekIndex]);
      }, 1000);
      
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">日报管理</h1>
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
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-3 md:p-6 max-w-4xl w-full mx-2 md:mx-4 max-h-[90vh] flex flex-col">
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