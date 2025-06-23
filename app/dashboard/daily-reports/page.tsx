"use client";

import { useState, useEffect } from "react";
import { PlusIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, CopyIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, DailyReport, ReportItem } from "@/lib/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, getWeek, getYear, addWeeks, subWeeks, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ReportWithItems {
  id: string;
  date: string;
  day: string;
  status: string;
  items: ReportItemWithProject[];
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

export default function DailyReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reports, setReports] = useState<ReportWithItems[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [previewReport, setPreviewReport] = useState<ReportWithItems | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // 新增周数据状态
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

  // 加载项目和日报数据
  useEffect(() => {
    if (!user) return;
    
    fetchData();
  }, [user, supabase]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (!user) {
        console.error('用户未登录');
        toast.error('请先登录');
        return;
      }

      // 获取项目数据
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id);
      
      if (projectsError) {
        throw projectsError;
      }
      
      setProjects(projectsData as Project[] || []);
      
      // 获取日报数据
      const { data: reportsData, error: reportsError } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      
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
          items
        });
      }
      
      setReports(reportsWithItems);
      
      // 生成周数据
      generateWeekData(reportsWithItems);
    } catch (error) {
      console.error('加载数据失败', error);
      toast.error('加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 生成周数据
  const generateWeekData = (reports: ReportWithItems[]) => {
    const today = new Date();
    const weeks: WeekData[] = [];
    
    // 生成最近12周的数据
    for (let i = 0; i < 12; i++) {
      const weekStartDate = startOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 7), { locale: zhCN });
      const weekEndDate = endOfWeek(weekStartDate, { locale: zhCN });
      const weekNumber = getWeek(weekStartDate, { locale: zhCN });
      const year = getYear(weekStartDate);
      
      // 获取这一周每天的数据
      const days: DayItem[] = [];
      
      // 获取这一周的所有日期
      const weekDates = eachDayOfInterval({ start: weekStartDate, end: weekEndDate });
      
      weekDates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const day = format(date, 'EEEE', { locale: zhCN });
        
        // 查找该日期是否有日报
        const reportForDate = reports.find(report => report.date === dateStr);
        
        days.push({
          date: dateStr,
          formattedDate: format(date, 'yyyy-MM-dd'),
          day,
          hasReport: !!reportForDate,
          report: reportForDate || null
        });
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
        fetchData();
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
      yamlContent += `${project.name} (${project.code}):\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectItems(report, project.id);
      projectItems.forEach(item => {
        yamlContent += `  - ${item.content}\n`;
      });
      
      yamlContent += '\n';
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

  // 搜索过滤日报
  const filteredReports = reports.filter(report => {
    // 按日期搜索
    if (report.date.includes(searchTerm)) {
      return true;
    }
    
    // 按项目名称或编号搜索
    return report.items.some(item => 
      item.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.project?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project?.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 获取当前页的日报
  const itemsPerPage = 10;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentReports = filteredReports.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);

  // 处理页面变化
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
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
      yamlContent += `${project.name} (${project.code}):\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectItems(previewReport, project.id);
      projectItems.forEach(item => {
        yamlContent += `  - ${item.content}\n`;
      });
      
      yamlContent += '\n';
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

  // 获取当前周数据
  const currentWeekData = weekData[currentWeekIndex];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日报管理</h1>
          {currentWeekData && (
            <div className="mt-2 text-sm text-gray-500 flex items-center">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md">
                {currentWeekData.year}年第{currentWeekData.weekNumber}周
              </span>
              <span className="ml-2">{currentWeekData.formattedPeriod}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* 搜索框 */}
          <div className="relative flex-grow sm:flex-grow-0 sm:min-w-[200px]">
            <input
              type="text"
              placeholder="搜索日报内容..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          {/* 创建日报按钮 */}
          <Link 
            href="/dashboard/daily-reports/new" 
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            <span>创建日报</span>
          </Link>
        </div>
      </div>

      {/* 周切换控件 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousWeek}
          disabled={currentWeekIndex >= weekData.length - 1}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeftIcon className="h-4 w-4 mr-1" />
          上一周
        </button>
        <button
          onClick={handleNextWeek}
          disabled={currentWeekIndex <= 0}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一周
          <ChevronRightIcon className="h-4 w-4 ml-1" />
        </button>
      </div>

      {/* 日报列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : weekData.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">暂无日报数据</p>
            <Link 
              href="/dashboard/daily-reports/new"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              创建第一份日报
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    日期
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    星期
                  </th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    项目
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
                {currentWeekData && currentWeekData.days.map((day) => (
                  <tr 
                    key={day.date} 
                    className={`hover:bg-gray-50 ${day.hasReport ? 'cursor-pointer' : ''}`}
                    onClick={() => day.hasReport && day.report && handleReportSelect(day.report.id)}
                  >
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">{day.formattedDate}</div>
                        {/* 移动端显示星期和状态 */}
                        <div className="text-xs text-gray-500 mt-1 sm:hidden">
                          {day.day} · {day.hasReport ? '已提交' : '未提交'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-gray-900">{day.day}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      {day.hasReport && day.report ? (
                        <div className="flex flex-wrap gap-1">
                          {getReportProjects(day.report).map((project) => (
                            <span
                              key={project.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {project.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      {day.hasReport ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          已提交
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          未提交
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/daily-reports/new?date=${day.date}`}
                          className="text-blue-600 hover:text-blue-900"
                          title={day.hasReport ? "编辑日报" : "创建日报"}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PencilIcon className="h-5 w-5" />
                        </Link>
                        {day.hasReport && day.report && (
                          <>
                            <button
                              onClick={(e) => handleCopyReport(e, day.report!)}
                              className="text-gray-600 hover:text-gray-900"
                              title="复制日报"
                            >
                              <CopyIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(e, day.report!.id)}
                              className="text-red-600 hover:text-red-900"
                              title="删除日报"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 周切换分页控件 */}
      {weekData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
          <div className="text-sm text-gray-700">
            {currentWeekData && (
              <>
                显示 <span className="font-medium">{currentWeekData.year}年第{currentWeekData.weekNumber}周</span> 的日报
              </>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousWeek}
              disabled={currentWeekIndex >= weekData.length - 1}
              className="relative inline-flex items-center px-2 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">上一周</span>
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
              {currentWeekIndex + 1} / {weekData.length}
            </span>
            <button
              onClick={handleNextWeek}
              disabled={currentWeekIndex <= 0}
              className="relative inline-flex items-center px-2 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">下一周</span>
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* 日报预览弹窗 */}
      {isPreviewOpen && previewReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                日报详情 - {previewReport.date} ({previewReport.day})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviewCopy}
                  className="p-2 rounded-md text-blue-600 hover:bg-blue-50"
                  title="复制日报内容"
                >
                  <CopyIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={closePreview}
                  className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
                  title="关闭预览"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {getReportProjects(previewReport).map(project => (
                  <div key={project.id} className="border-l-2 border-blue-500 pl-4 py-2">
                    <div className="flex items-center mb-2">
                      <div className="text-sm font-medium text-blue-600">
                        {project.name}
                      </div>
                      <div className="text-xs text-gray-500 ml-2">
                        ({project.code})
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {getProjectItems(previewReport, project.id).map((item, idx) => (
                        <li key={idx} className="text-sm text-gray-600 flex items-start">
                          <span className="mr-2 text-blue-400 flex-shrink-0">•</span>
                          <span className="break-words">{item.content}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
              <div className="text-sm text-gray-500">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                  {previewReport.status}
                </span>
                {format(parseISO(previewReport.date), 'yyyy年MM月dd日')}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => handleEditClick(e, previewReport.date)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PencilIcon className="h-4 w-4 mr-1" />
                  编辑
                </button>
                <button
                  onClick={closePreview}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">确认删除</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">确定要删除这份日报吗？此操作无法撤销。</p>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={handleCancelDelete}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={isDeletingReport}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                disabled={isDeletingReport}
              >
                {isDeletingReport ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
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