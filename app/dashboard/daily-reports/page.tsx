"use client";

import { useState, useEffect } from "react";
import { PlusIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, CopyIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, DailyReport, ReportItem } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
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
      
      setProjects(projectsData || []);
      
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
      for (const report of reportsData || []) {
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
        
        const items = reportItemsData?.map(item => {
          // 确保projects是单个Project对象而不是数组
          const project = Array.isArray(item.projects) ? item.projects[0] : item.projects;
          return {
            id: item.id,
            content: item.content,
            project: project as Project
          };
        }) || [];
        
        reportsWithItems.push({
          id: report.id,
          date: formattedDate,
          day,
          status: '已提交', // 日报状态，目前只有一种状态
          items
        });
      }
      
      setReports(reportsWithItems);
    } catch (error) {
      console.error('加载数据失败', error);
      toast.error('加载数据失败');
    } finally {
      setIsLoading(false);
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
    
    // 复制到剪贴板
    navigator.clipboard.writeText(yamlContent)
      .then(() => {
        toast.success('日报内容已复制到剪贴板');
      })
      .catch(err => {
        console.error('复制失败:', err);
        toast.error('复制失败，请重试');
      });
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

  // 处理日报选择
  const handleReportSelect = (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (report) {
      setSelectedDate(report.date);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">日报管理</h1>
        <Link 
          href="/dashboard/daily-reports/new" 
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          <span>新建日报</span>
        </Link>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="搜索日报内容、日期或项目..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 日报列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h2 className="text-lg font-medium">我的日报列表</h2>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center p-12">
            <Loader2Icon className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-200">
              {currentReports.length > 0 ? (
                currentReports.map((report) => (
                  <li 
                    key={report.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer ${
                      selectedDate === report.date ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleReportSelect(report.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="w-full">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{report.date} ({report.day})</p>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                              {report.status}
                            </span>
                            <button 
                              onClick={(e) => handleCopyReport(e, report)}
                              className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                              title="复制日报内容"
                            >
                              <CopyIcon className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={(e) => handleEditClick(e, report.date)}
                              className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                              title="编辑日报"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteClick(e, report.id)}
                              className="p-1.5 rounded-md hover:bg-red-100 text-red-600 transition-colors"
                              title="删除日报"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-3 space-y-3">
                          {getReportProjects(report).map(project => (
                            <div key={project.id} className="border-l-2 border-blue-500 pl-3">
                              <div className="text-sm font-medium text-blue-600 mb-1">
                                {project.name} ({project.code})
                              </div>
                              <ul className="space-y-1">
                                {getProjectItems(report, project.id).map((item) => (
                                  <li key={item.id} className="text-sm text-gray-500 flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>{item.content}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="p-4 text-center text-gray-500">
                  {searchTerm ? "没有找到匹配的日报" : "暂无日报数据"}
                </li>
              )}
            </ul>
            
            {/* 分页 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between items-center">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${
                      currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronLeftIcon className="h-4 w-4 mr-1" />
                    上一页
                  </button>
                  <span className="text-sm text-gray-700">
                    第 {currentPage} 页，共 {totalPages} 页
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${
                      currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    下一页
                    <ChevronRightIcon className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
            
            {/* 删除确认对话框 */}
            {confirmDeleteOpen && (
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">确认删除</h3>
                  <p className="text-gray-500 mb-6">
                    您确定要删除这份日报吗？此操作将同时删除所有相关的工作内容且不可恢复。
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={handleCancelDelete}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={isDeletingReport}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="px-4 py-2 bg-red-600 rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none"
                      disabled={isDeletingReport}
                    >
                      {isDeletingReport ? (
                        <span className="flex items-center">
                          <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                          删除中...
                        </span>
                      ) : (
                        '确认删除'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 