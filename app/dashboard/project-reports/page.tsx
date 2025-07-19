"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, FileTextIcon, AlertCircleIcon, CalendarIcon, EyeIcon, EyeOffIcon, ChevronDownIcon, ChevronRightIcon as ChevronRightIconSolid } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, getWeek, getYear, addWeeks, subWeeks, isToday, startOfISOWeek, endOfISOWeek, getISOWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePersistentState } from "@/lib/utils/page-persistence";

interface ProjectWeeklyReportData {
  id: string;
  year: number;
  week_number: number;
  start_date: string;
  end_date: string;
  is_plan?: boolean;
  created_at: string;
  updated_at: string;
}

interface ProjectWeeklyReportItemData {
  id: string;
  content: string;
  projects: Project;
  work_breakdown_items?: {
    id: string;
    name: string;
    level?: number;
    parent_id?: string;
  };
}

interface WorkItemHierarchy {
  id: string;
  name: string;
  level: number;
  parent_id?: string;
  children: WorkItemHierarchy[];
  items: ProjectWeeklyReportItemData[];
  fullPath: string; // 完整层级路径，如 "一级工作项 > 二级工作项 > 三级工作项"
}

interface GroupedProjectData {
  project: Project;
  items: ProjectWeeklyReportItemData[];
  workItems: {
    [workItemId: string]: {
      workItem: {
        id: string;
        name: string;
        level?: number;
        parent_id?: string;
      };
      items: ProjectWeeklyReportItemData[];
    };
  };
  directItems: ProjectWeeklyReportItemData[]; // 直接在项目下的工作项
  workItemsHierarchy: WorkItemHierarchy[]; // 工作项层级结构
}

interface WeekReportWithItems {
  id: string;
  year: number;
  week_number: number;
  start_date: string;
  end_date: string;
  formattedPeriod: string;
  hasReport: boolean;
  is_plan?: boolean;
  items: ProjectWeeklyReportItemData[];
}

interface WeekData {
  year: number;
  week_number: number;
  start_date: Date;
  end_date: Date;
  formattedPeriod: string;
  report: WeekReportWithItems | null;
}

export default function ProjectReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  
  // 状态管理 - 使用持久化状态
  const [currentWeek, setCurrentWeek] = usePersistentState('project-reports-current-week', new Date());
  const [weekData, setWeekData] = usePersistentState<WeekData[]>('project-reports-week-data', []);
  const [isLoading, setIsLoading] = useState(false);
  const [reports, setReports] = usePersistentState<ProjectWeeklyReportData[]>('project-reports-reports', []);
  const [reportItems, setReportItems] = usePersistentState<{ [reportId: string]: ProjectWeeklyReportItemData[] }>('project-reports-items', {});
  const [allWorkItems, setAllWorkItems] = useState<{ [projectId: string]: any[] }>({});

  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const isRequestingRef = useRef(false);

  // 显示控制状态
  const [showWorkItems, setShowWorkItems] = usePersistentState('project-reports-show-work-items', true);
  const [showHierarchy, setShowHierarchy] = usePersistentState('project-reports-show-hierarchy', false);
  const [expandedProjects, setExpandedProjects] = usePersistentState<{ [projectId: string]: boolean }>('project-reports-expanded-projects', {});
  
  // 计算当前周的数据
  const currentWeekData = useMemo(() => {
    const weekStart = startOfISOWeek(currentWeek);
    const weekEnd = endOfISOWeek(currentWeek);
    const year = getYear(weekStart);
    const weekNumber = getISOWeek(weekStart);
    
    const report = reports.find(r => r.year === year && r.week_number === weekNumber);
    const items = report ? reportItems[report.id] || [] : [];
    
    return {
      year,
      week_number: weekNumber,
      start_date: weekStart,
      end_date: weekEnd,
      formattedPeriod: `${format(weekStart, 'M月d日', { locale: zhCN })} - ${format(weekEnd, 'M月d日', { locale: zhCN })}`,
      report: report ? {
        id: report.id,
        year: report.year,
        week_number: report.week_number,
        start_date: report.start_date,
        end_date: report.end_date,
        formattedPeriod: `${format(parseISO(report.start_date), 'M月d日', { locale: zhCN })} - ${format(parseISO(report.end_date), 'M月d日', { locale: zhCN })}`,
        hasReport: true,
        is_plan: report.is_plan,
        items
      } : null
    };
  }, [currentWeek, reports, reportItems]);

  // 今日周报提醒
  const todayWeekReportReminder = useMemo(() => {
    const today = new Date();
    const todayWeekStart = startOfISOWeek(today);
    const todayYear = getYear(todayWeekStart);
    const todayWeekNumber = getISOWeek(todayWeekStart);
    
    const hasReport = reports.some(r => r.year === todayYear && r.week_number === todayWeekNumber);
    
    return {
      year: todayYear,
      week_number: todayWeekNumber,
      hasReport,
      date: format(todayWeekStart, 'yyyy-MM-dd')
    };
  }, [reports]);

  // 构建工作项层级结构 - 只包含有工作内容的工作项
  const buildWorkItemHierarchy = useCallback((projectId: string, reportItems: ProjectWeeklyReportItemData[]): WorkItemHierarchy[] => {
    const projectWorkItems = allWorkItems[projectId] || [];
    if (projectWorkItems.length === 0) return [];

    // 创建工作项映射
    const workItemMap: { [id: string]: any } = {};
    projectWorkItems.forEach(item => {
      workItemMap[item.id] = item;
    });

    // 构建层级路径函数
    const buildPath = (workItemId: string): string => {
      const item = workItemMap[workItemId];
      if (!item) return '';

      if (item.parent_id && workItemMap[item.parent_id]) {
        const parentPath = buildPath(item.parent_id);
        return parentPath ? `${parentPath} > ${item.name}` : item.name;
      }
      return item.name;
    };

    // 获取所有有工作内容的工作项ID
    const workItemsWithContent = new Set(
      reportItems
        .filter(item => item.work_breakdown_items?.id)
        .map(item => item.work_breakdown_items!.id)
    );

    // 只构建有工作内容的工作项的层级结构
    const hierarchyItems: WorkItemHierarchy[] = [];

    workItemsWithContent.forEach(workItemId => {
      const workItem = workItemMap[workItemId];
      if (!workItem) return;

      const workItemItems = reportItems.filter(item =>
        item.work_breakdown_items?.id === workItemId
      );

      hierarchyItems.push({
        id: workItem.id,
        name: workItem.name,
        level: workItem.level,
        parent_id: workItem.parent_id,
        children: [], // 不需要子层级，直接平铺显示
        items: workItemItems,
        fullPath: buildPath(workItemId)
      });
    });

    // 按层级和位置排序
    return hierarchyItems.sort((a, b) => {
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      return a.fullPath.localeCompare(b.fullPath);
    });
  }, [allWorkItems]);

  // 按项目分组数据
  const groupedProjectData = useMemo(() => {
    if (!currentWeekData.report) return [];

    const grouped: { [projectId: string]: GroupedProjectData } = {};

    currentWeekData.report.items.forEach(item => {
      const projectId = item.projects.id;

      if (!grouped[projectId]) {
        grouped[projectId] = {
          project: item.projects,
          items: [],
          workItems: {},
          directItems: [],
          workItemsHierarchy: []
        };
      }

      grouped[projectId].items.push(item);

      if (item.work_breakdown_items) {
        const workItemId = item.work_breakdown_items.id;
        if (!grouped[projectId].workItems[workItemId]) {
          grouped[projectId].workItems[workItemId] = {
            workItem: item.work_breakdown_items,
            items: []
          };
        }
        grouped[projectId].workItems[workItemId].items.push(item);
      } else {
        grouped[projectId].directItems.push(item);
      }
    });

    // 为每个项目构建工作项层级结构
    Object.keys(grouped).forEach(projectId => {
      grouped[projectId].workItemsHierarchy = buildWorkItemHierarchy(projectId, grouped[projectId].items);
    });

    return Object.values(grouped);
  }, [currentWeekData.report, buildWorkItemHierarchy]);

  // 切换项目展开状态
  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // 渲染工作项层级结构 - 简化为平铺显示
  const renderWorkItemHierarchy = (hierarchyItem: WorkItemHierarchy): JSX.Element => {
    return (
      <div key={hierarchyItem.id} className="border-l-2 border-green-300 pl-3 mb-3">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-sm font-medium text-green-600">
            <span className="text-xs text-gray-400 mr-1">
              L{hierarchyItem.level}
            </span>
            {hierarchyItem.fullPath}
          </span>
          <span className="text-xs text-gray-500 bg-green-100 px-2 py-0.5 rounded">
            {hierarchyItem.items.length} 项
          </span>
        </div>

        {/* 工作项内容 */}
        <div className="space-y-2">
          {hierarchyItem.items.map((item) => (
            <div key={item.id} className="bg-green-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">{item.content}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 加载项目周报数据
  const fetchProjectReports = useCallback(async (forceUpdate: boolean = false) => {
    if (!user) return;

    // 检查是否正在请求中，避免重复请求
    if (isRequestingRef.current) {
      console.log('项目周报正在请求中，跳过重复请求');
      return;
    }

    // 检查数据是否已经加载过，如果强制更新则忽略此检查
    if (!forceUpdate && dataLoadedRef.current && reports.length > 0) {
      console.log('项目周报数据已加载，跳过重新获取');
      return;
    }

    console.log(`加载项目周报数据${forceUpdate ? '(强制刷新)' : ''}`);

    // 设置请求状态
    isRequestingRef.current = true;
    setIsLoading(true);
    try {
      // 获取项目周报主表数据
      const { data: reportsData, error: reportsError } = await supabase
        .from('project_weekly_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('week_number', { ascending: false });
      
      if (reportsError) {
        throw reportsError;
      }
      
      setReports((reportsData as unknown as ProjectWeeklyReportData[]) || []);
      
      // 获取项目周报条目数据
      if (reportsData && reportsData.length > 0) {
        const reportIds = reportsData.map(r => r.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from('project_weekly_report_items')
          .select(`
            id,
            content,
            report_id,
            projects:project_id (
              id, name, code
            ),
            work_breakdown_items:work_item_id (
              id, name, level, parent_id
            )
          `)
          .in('report_id', reportIds);
        
        if (itemsError) {
          throw itemsError;
        }
        
        // 按报告ID分组条目数据
        const itemsByReport: { [reportId: string]: ProjectWeeklyReportItemData[] } = {};
        itemsData?.forEach((item: any) => {
          if (!itemsByReport[item.report_id]) {
            itemsByReport[item.report_id] = [];
          }
          itemsByReport[item.report_id].push(item as ProjectWeeklyReportItemData);
        });
        
        setReportItems(itemsByReport);

        // 获取所有相关项目的工作项数据，用于构建层级结构
        const projectIds = Array.from(new Set(itemsData?.map((item: any) => item.projects.id) || []));
        if (projectIds.length > 0) {
          const { data: workItemsData, error: workItemsError } = await supabase
            .from('work_breakdown_items')
            .select('*')
            .in('project_id', projectIds)
            .eq('user_id', user.id)
            .order('level')
            .order('position');

          if (!workItemsError && workItemsData) {
            // 按项目ID分组工作项
            const workItemsByProject: { [projectId: string]: any[] } = {};
            workItemsData.forEach((item: any) => {
              if (!workItemsByProject[item.project_id]) {
                workItemsByProject[item.project_id] = [];
              }
              workItemsByProject[item.project_id].push(item);
            });
            setAllWorkItems(workItemsByProject);
          }
        }
      }

      // 标记数据已加载
      dataLoadedRef.current = true;
      lastLoadTimeRef.current = Date.now();

    } catch (error) {
      console.error('获取项目周报失败', error);
      toast.error('获取项目周报失败');
    } finally {
      // 清除请求状态
      isRequestingRef.current = false;
      setIsLoading(false);
    }
  }, [supabase, user, setReports, setReportItems]);

  // 删除项目周报
  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('确定要删除这个项目周报吗？此操作不可撤销。')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('project_weekly_reports')
        .delete()
        .eq('id', reportId);
      
      if (error) {
        throw error;
      }
      
      toast.success('项目周报删除成功');
      // 强制刷新数据
      fetchProjectReports(true);
    } catch (error) {
      console.error('删除项目周报失败', error);
      toast.error('删除项目周报失败');
    }
  };

  // 周导航
  const goToPreviousWeek = () => {
    setCurrentWeek(subWeeks(currentWeek, 1));
  };

  const goToNextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1));
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(new Date());
  };

  // 初始化数据
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjectReports();
    }
  }, [user, fetchProjectReports]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('项目周报页面恢复可见，保持现有数据');
          // 不再自动刷新数据，保持现有数据
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
        <h1 className="text-xl md:text-2xl font-bold">项目周报管理</h1>
      </div>

      {/* 今日周报提醒 */}
      {todayWeekReportReminder && !todayWeekReportReminder.hasReport && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircleIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                您本周还没有填写项目周报，
                <Link 
                  href={`/dashboard/project-reports/new?year=${todayWeekReportReminder.year}&week=${todayWeekReportReminder.week_number}`}
                  className="font-medium underline text-blue-700 hover:text-blue-600"
                >
                  立即填写
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 周导航 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 md:space-x-4">
              <button
                onClick={goToPreviousWeek}
                className="p-1 md:p-2 rounded-full hover:bg-gray-100"
                aria-label="上一周"
              >
                <ChevronLeftIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <div className="text-center">
                <h2 className="text-sm md:text-lg font-medium">
                  {currentWeekData.year}年第{currentWeekData.week_number}周
                </h2>
                <p className="text-xs md:text-sm text-gray-500">
                  {currentWeekData.formattedPeriod}
                </p>
              </div>
              <button
                onClick={goToNextWeek}
                className="p-1 md:p-2 rounded-full hover:bg-gray-100"
                aria-label="下一周"
              >
                <ChevronRightIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={goToCurrentWeek}
                className="px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                本周
              </button>
              <Link
                href={`/dashboard/project-reports/new?year=${currentWeekData.year}&week=${currentWeekData.week_number}`}
                className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-transparent text-xs md:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                新建周报
              </Link>
            </div>
          </div>
        </div>

        {/* 周报内容 */}
        <div className="p-3 md:p-4">
          {isLoading ? (
            <div className="flex justify-center items-center p-6 md:p-12">
              <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm md:text-base text-gray-500">加载中...</span>
            </div>
          ) : currentWeekData.report ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <FileTextIcon className="h-5 w-5 text-blue-500" />
                  <span className="text-sm md:text-base font-medium">
                    {currentWeekData.report.formattedPeriod} 项目周报
                  </span>
                  {currentWeekData.report.is_plan && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      工作计划
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {/* 显示控制开关 */}
                  <div className="flex items-center space-x-2 mr-2">
                    <button
                      onClick={() => setShowWorkItems(!showWorkItems)}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border ${
                        showWorkItems
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-gray-50 text-gray-700 border-gray-300'
                      }`}
                      title={showWorkItems ? '隐藏工作项' : '显示工作项'}
                    >
                      {showWorkItems ? <EyeIcon className="h-3 w-3 mr-1" /> : <EyeOffIcon className="h-3 w-3 mr-1" />}
                      工作项
                    </button>
                    {showWorkItems && (
                      <button
                        onClick={() => setShowHierarchy(!showHierarchy)}
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border ${
                          showHierarchy
                            ? 'bg-green-50 text-green-700 border-green-300'
                            : 'bg-gray-50 text-gray-700 border-gray-300'
                        }`}
                        title={showHierarchy ? '隐藏层级' : '显示层级'}
                      >
                        层级
                      </button>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/project-reports/new?year=${currentWeekData.year}&week=${currentWeekData.week_number}`}
                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <PencilIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                    编辑
                  </Link>
                  <button
                    onClick={() => handleDeleteReport(currentWeekData.report!.id)}
                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-red-300 text-xs md:text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                  >
                    <TrashIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                    删除
                  </button>
                </div>
              </div>
              
              {/* 周报条目 - 按项目分组显示 */}
              <div className="space-y-4">
                {groupedProjectData.map((projectData) => {
                  const isExpanded = expandedProjects[projectData.project.id] !== false; // 默认展开

                  return (
                    <div key={projectData.project.id} className="border border-gray-200 rounded-lg">
                      {/* 项目标题 */}
                      <div
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-t-lg cursor-pointer hover:bg-gray-100"
                        onClick={() => toggleProjectExpanded(projectData.project.id)}
                      >
                        <div className="flex items-center space-x-2">
                          {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRightIconSolid className="h-4 w-4 text-gray-500" />
                          )}
                          <span className="font-medium text-blue-600">
                            {projectData.project.name} ({projectData.project.code})
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                            {projectData.items.length} 项工作
                          </span>
                        </div>
                      </div>

                      {/* 项目内容 */}
                      {isExpanded && (
                        <div className="p-3 space-y-3">
                          {/* 按工作项分组的工作 */}
                          {showWorkItems && Object.keys(projectData.workItems).length > 0 && (
                            <div className="space-y-3">
                              {showHierarchy ? (
                                // 层级模式：显示完整的工作项层级路径
                                <div className="space-y-3">
                                  {projectData.workItemsHierarchy.map((hierarchyItem) =>
                                    renderWorkItemHierarchy(hierarchyItem)
                                  )}
                                </div>
                              ) : (
                                // 简单模式：平铺显示工作项
                                Object.values(projectData.workItems).map((workItemData) => (
                                  <div key={workItemData.workItem.id} className="border-l-2 border-green-300 pl-3">
                                    {/* 工作项标题 */}
                                    <div className="flex items-center space-x-2 mb-2">
                                      <span className="text-sm font-medium text-green-600">
                                        {workItemData.workItem.name}
                                      </span>
                                      <span className="text-xs text-gray-500 bg-green-100 px-2 py-0.5 rounded">
                                        {workItemData.items.length} 项
                                      </span>
                                    </div>

                                    {/* 工作项内容 */}
                                    <div className="space-y-2">
                                      {workItemData.items.map((item) => (
                                        <div key={item.id} className="bg-green-50 rounded-lg p-3">
                                          <p className="text-sm text-gray-700">{item.content}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* 当隐藏工作项时，显示所有内容的简化视图 */}
                          {!showWorkItems && Object.keys(projectData.workItems).length > 0 && (
                            <div className="space-y-2">
                              {Object.values(projectData.workItems).flatMap(workItemData =>
                                workItemData.items.map((item) => (
                                  <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-sm text-gray-700">{item.content}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* 其他工作（未选择工作项的内容）- 统一显示在最后 */}
                          {projectData.directItems.length > 0 && (
                            <div className="border-l-2 border-gray-400 pl-3 mt-4">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="text-sm font-medium text-gray-600">
                                  其他工作
                                </span>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                  {projectData.directItems.length} 项
                                </span>
                              </div>
                              <div className="space-y-2">
                                {projectData.directItems.map((item) => (
                                  <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-sm text-gray-700">{item.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">暂无项目周报</h3>
              <p className="mt-1 text-sm text-gray-500">
                点击上方"新建周报"按钮开始填写本周的项目周报
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
