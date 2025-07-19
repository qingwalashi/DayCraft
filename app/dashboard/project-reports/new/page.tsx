"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, PlusIcon, TrashIcon, SaveIcon, ArrowLeftIcon, BookmarkIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { toast } from "sonner";
import { format, startOfISOWeek, endOfISOWeek, getISOWeek, getYear } from "date-fns";
import { zhCN } from "date-fns/locale";
import { usePersistentState, clearPageState } from "@/lib/utils/page-persistence";

interface WorkItem {
  id?: string;
  content: string;
  projectId: string;
  workItemId?: string;
}

interface ProjectWeeklyReportData {
  id: string;
  is_plan?: boolean;
}

interface ProjectWeeklyReportItemData {
  id: string;
  content: string;
  project_id: string;
  work_item_id?: string;
}

interface WorkBreakdownItem {
  id: string;
  name: string;
  level: number;
  parent_id?: string;
  children?: WorkBreakdownItem[];
}

export default function NewProjectWeeklyReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const searchParams = useSearchParams();
  
  // 从URL参数获取年份和周数
  const yearParam = searchParams.get('year');
  const weekParam = searchParams.get('week');
  
  // 计算默认的年份和周数
  const today = new Date();
  const defaultYear = yearParam ? parseInt(yearParam) : getYear(startOfISOWeek(today));
  const defaultWeek = weekParam ? parseInt(weekParam) : getISOWeek(startOfISOWeek(today));
  
  // 状态管理
  const [year, setYear] = usePersistentState('project-weekly-report-year', defaultYear);
  const [weekNumber, setWeekNumber] = usePersistentState('project-weekly-report-week', defaultWeek);
  const [workItems, setWorkItems] = usePersistentState<WorkItem[]>('project-weekly-report-work-items', []);
  const [isPlan, setIsPlan] = usePersistentState('project-weekly-report-is-plan', false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workBreakdownItems, setWorkBreakdownItems] = useState<{ [projectId: string]: WorkBreakdownItem[] }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const isRequestingRef = useRef(false);
  const urlParamsCheckedRef = useRef(false);
  
  // 计算周的开始和结束日期
  const getWeekDates = (year: number, week: number) => {
    // 创建该年第一周的日期
    const jan4 = new Date(year, 0, 4); // 1月4日总是在第一周
    const firstWeekStart = startOfISOWeek(jan4);
    
    // 计算目标周的开始日期
    const targetWeekStart = new Date(firstWeekStart);
    targetWeekStart.setDate(firstWeekStart.getDate() + (week - 1) * 7);
    
    const weekStart = startOfISOWeek(targetWeekStart);
    const weekEnd = endOfISOWeek(targetWeekStart);
    
    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekDates(year, weekNumber);
  const formattedPeriod = `${format(weekStart, 'M月d日', { locale: zhCN })} - ${format(weekEnd, 'M月d日', { locale: zhCN })}`;

  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目失败');
    }
  }, [supabase, user]);

  // 加载工作分解项
  const fetchWorkBreakdownItems = useCallback(async (projectId: string) => {
    if (!user || !projectId) return;
    
    try {
      const { data, error } = await supabase
        .from('work_breakdown_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('level')
        .order('position');
      
      if (error) {
        throw error;
      }
      
      // 构建树形结构
      const items = data || [];
      const itemMap: { [id: string]: WorkBreakdownItem } = {};
      const rootItems: WorkBreakdownItem[] = [];

      // 创建所有项目的映射
      items.forEach((item: any) => {
        itemMap[item.id] = {
          ...item,
          children: []
        };
      });
      
      // 构建父子关系
      items.forEach((item: any) => {
        if (item.parent_id && itemMap[item.parent_id]) {
          itemMap[item.parent_id].children!.push(itemMap[item.id]);
        } else {
          rootItems.push(itemMap[item.id]);
        }
      });
      
      setWorkBreakdownItems(prev => ({
        ...prev,
        [projectId]: rootItems
      }));
    } catch (error) {
      console.error('获取工作分解项失败', error);
      toast.error('获取工作分解项失败');
    }
  }, [supabase, user]);

  // 加载现有的项目周报数据
  const fetchExistingReport = useCallback(async (forceUpdate: boolean = false) => {
    if (!user) return;

    // 检查是否正在请求中，避免重复请求
    if (isRequestingRef.current) {
      console.log('项目周报编辑页面正在请求中，跳过重复请求');
      return;
    }

    // 检查数据是否已经加载过，如果强制更新则忽略此检查
    if (!forceUpdate && dataLoadedRef.current) {
      console.log('项目周报编辑数据已加载，跳过重新获取');
      return;
    }

    console.log(`加载项目周报编辑数据${forceUpdate ? '(强制刷新)' : ''}`);

    // 设置请求状态
    isRequestingRef.current = true;
    setIsLoading(true);
    try {
      const { data: reportData, error: reportError } = await supabase
        .from('project_weekly_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('year', year)
        .eq('week_number', weekNumber)
        .maybeSingle();
      
      if (reportError && reportError.code !== 'PGRST116') {
        throw reportError;
      }
      
      if (reportData) {
        setReportId(reportData.id as string);
        setIsPlan((reportData as any).is_plan || false);
        
        // 加载报告条目
        const { data: itemsData, error: itemsError } = await supabase
          .from('project_weekly_report_items')
          .select('*')
          .eq('report_id', reportData.id as string);
        
        if (itemsError) {
          throw itemsError;
        }
        
        const items: WorkItem[] = itemsData?.map((item: any) => ({
          id: item.id,
          content: item.content,
          projectId: item.project_id,
          workItemId: item.work_item_id || undefined
        })) || [];
        
        setWorkItems(items);
        
        // 为每个项目加载工作分解项
        const projectIds = Array.from(new Set(items.map(item => item.projectId)));
        for (const projectId of projectIds) {
          await fetchWorkBreakdownItems(projectId);
        }
      }

      // 标记数据已加载
      dataLoadedRef.current = true;

    } catch (error) {
      console.error('获取现有报告失败', error);
      toast.error('获取现有报告失败');
    } finally {
      // 清除请求状态
      isRequestingRef.current = false;
      setIsLoading(false);
    }
  }, [supabase, user, year, weekNumber, fetchWorkBreakdownItems]);

  // 添加工作项
  const addWorkItem = () => {
    const newItem: WorkItem = {
      content: '',
      projectId: ''
    };
    setWorkItems([...workItems, newItem]);
  };

  // 删除工作项
  const removeWorkItem = (index: number) => {
    const newItems = workItems.filter((_, i) => i !== index);
    setWorkItems(newItems);
  };

  // 更新工作项
  const updateWorkItem = (index: number, field: keyof WorkItem, value: string) => {
    const newItems = [...workItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // 如果更改了项目，清空工作项选择并加载新的工作分解项
    if (field === 'projectId') {
      newItems[index].workItemId = undefined;
      if (value) {
        fetchWorkBreakdownItems(value);
      }
    }
    
    setWorkItems(newItems);
  };

  // 渲染工作分解项选择器
  const renderWorkItemSelector = (projectId: string, selectedWorkItemId?: string, onChange?: (value: string) => void) => {
    const items = workBreakdownItems[projectId] || [];
    
    const renderOptions = (items: WorkBreakdownItem[], level = 0): JSX.Element[] => {
      const options: JSX.Element[] = [];
      
      items.forEach(item => {
        const indent = '　'.repeat(level);
        options.push(
          <option key={item.id} value={item.id}>
            {indent}{item.name}
          </option>
        );
        
        if (item.children && item.children.length > 0) {
          options.push(...renderOptions(item.children, level + 1));
        }
      });
      
      return options;
    };
    
    return (
      <select
        value={selectedWorkItemId || ''}
        onChange={(e) => onChange?.(e.target.value)}
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      >
        <option value="">选择工作项（可选）</option>
        {renderOptions(items)}
      </select>
    );
  };

  // 保存项目周报
  const saveReport = async () => {
    if (!user) return;
    
    // 验证数据
    const validItems = workItems.filter(item => item.content.trim() && item.projectId);
    if (validItems.length === 0) {
      toast.error('请至少添加一个有效的工作项');
      return;
    }
    
    setIsSaving(true);
    try {
      let currentReportId = reportId;
      
      if (currentReportId) {
        // 更新现有报告
        const { error: updateError } = await supabase
          .from('project_weekly_reports')
          .update({
            is_plan: isPlan,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentReportId);
        
        if (updateError) {
          throw updateError;
        }
        
        // 删除现有条目
        const { error: deleteError } = await supabase
          .from('project_weekly_report_items')
          .delete()
          .eq('report_id', currentReportId);
        
        if (deleteError) {
          throw deleteError;
        }
      } else {
        // 创建新报告
        const { data: reportData, error: reportError } = await supabase
          .from('project_weekly_reports')
          .insert({
            user_id: user.id,
            year,
            week_number: weekNumber,
            start_date: format(weekStart, 'yyyy-MM-dd'),
            end_date: format(weekEnd, 'yyyy-MM-dd'),
            is_plan: isPlan
          })
          .select()
          .single();
        
        if (reportError) {
          throw reportError;
        }
        
        currentReportId = reportData.id as string;
        setReportId(currentReportId);
      }
      
      // 插入新条目
      const itemsToInsert = validItems.map(item => ({
        report_id: currentReportId,
        project_id: item.projectId,
        work_item_id: item.workItemId || null,
        content: item.content.trim()
      }));
      
      const { error: insertError } = await supabase
        .from('project_weekly_report_items')
        .insert(itemsToInsert);
      
      if (insertError) {
        throw insertError;
      }
      
      toast.success('项目周报保存成功');
      
      // 清除页面状态
      clearPageState('project-weekly-report');
      
      // 返回列表页
      router.push('/dashboard/project-reports');
    } catch (error) {
      console.error('保存项目周报失败', error);
      toast.error('保存项目周报失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 初始化数据
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjects();
      fetchExistingReport();
      urlParamsCheckedRef.current = true;
    }
  }, [user, fetchProjects, fetchExistingReport]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('项目周报编辑页面恢复可见，保持现有数据');
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
        <div className="flex items-center space-x-2 md:space-x-4">
          <Link
            href="/dashboard/project-reports"
            className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeftIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
            返回
          </Link>
          <h1 className="text-xl md:text-2xl font-bold">
            {reportId ? '编辑' : '新建'}项目周报
          </h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center p-6 md:p-12">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm md:text-base text-gray-500">加载中...</span>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg">
          <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
              <div>
                <h2 className="text-base md:text-lg font-medium">
                  {year}年第{weekNumber}周项目周报
                </h2>
                <p className="text-xs md:text-sm text-gray-500">
                  {formattedPeriod}
                </p>
              </div>
              
              {/* 工作计划标记 */}
              <div className="flex items-center space-x-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isPlan}
                    onChange={(e) => setIsPlan(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">标记为工作计划</span>
                  <BookmarkIcon className="h-4 w-4 ml-1 text-green-500" />
                </label>
              </div>
            </div>
          </div>

          <div className="p-3 md:p-4 space-y-4">
            {/* 工作项列表 */}
            {workItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900">工作项 {index + 1}</h3>
                  <button
                    onClick={() => removeWorkItem(index)}
                    className="text-red-600 hover:text-red-800"
                    title="删除工作项"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 项目选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      项目 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={item.projectId}
                      onChange={(e) => updateWorkItem(index, 'projectId', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    >
                      <option value="">选择项目</option>
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name} ({project.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 工作项选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      工作项
                    </label>
                    {item.projectId ? (
                      renderWorkItemSelector(
                        item.projectId,
                        item.workItemId,
                        (value) => updateWorkItem(index, 'workItemId', value)
                      )
                    ) : (
                      <select
                        disabled
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 sm:text-sm"
                      >
                        <option>请先选择项目</option>
                      </select>
                    )}
                  </div>
                </div>
                
                {/* 工作内容 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    工作内容 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={item.content}
                    onChange={(e) => updateWorkItem(index, 'content', e.target.value)}
                    rows={3}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请描述本周在该项目/工作项上的具体工作内容..."
                    required
                  />
                </div>
              </div>
            ))}
            
            {/* 添加工作项按钮 */}
            <button
              onClick={addWorkItem}
              className="w-full flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              添加工作项
            </button>
            
            {/* 操作按钮 */}
            <div className="flex flex-col md:flex-row md:justify-end gap-2 md:gap-3 pt-4 border-t border-gray-200">
              <Link
                href="/dashboard/project-reports"
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                取消
              </Link>
              <button
                onClick={saveReport}
                disabled={isSaving}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <SaveIcon className="h-4 w-4 mr-2" />
                    保存周报
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
