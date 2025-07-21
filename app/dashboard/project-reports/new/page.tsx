"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, PlusIcon, TrashIcon, SaveIcon, ArrowLeftIcon, BookmarkIcon, Loader2Icon, EyeIcon, EyeOffIcon, CopyIcon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, WorkBreakdownItem as DbWorkBreakdownItem } from "@/lib/supabase/client";
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



interface WorkBreakdownItemWithChildren {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  children?: WorkBreakdownItemWithChildren[];
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
  const [workBreakdownItems, setWorkBreakdownItems] = useState<{ [projectId: string]: WorkBreakdownItemWithChildren[] }>({});
  const [allWorkItems, setAllWorkItems] = useState<{ [projectId: string]: DbWorkBreakdownItem[] }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  // 预览相关状态
  const [showPreview, setShowPreview] = useState(false);

  // 项目选择状态
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // 预览显示控制状态
  const [showWorkItems, setShowWorkItems] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(true);

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

  // 构建工作项路径的辅助函数
  const buildWorkItemPath = useCallback((workItem: any, allWorkItems: any[]): string => {
    const path: string[] = [];
    let currentItem = workItem;

    // 递归向上查找父级工作项
    while (currentItem) {
      path.unshift(currentItem.name);
      if (currentItem.parent_id) {
        currentItem = allWorkItems.find(item => item.id === currentItem.parent_id);
      } else {
        break;
      }
    }

    return path.join(' > ');
  }, []);

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
      const items = (data || []) as DbWorkBreakdownItem[];
      const itemMap: { [id: string]: WorkBreakdownItemWithChildren } = {};
      const rootItems: WorkBreakdownItemWithChildren[] = [];

      // 创建所有项目的映射
      items.forEach((item: DbWorkBreakdownItem) => {
        itemMap[item.id] = {
          ...item,
          children: []
        };
      });

      // 构建父子关系
      items.forEach((item: DbWorkBreakdownItem) => {
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

      // 同时更新allWorkItems，包含所有项目（扁平化）
      setAllWorkItems(prev => ({
        ...prev,
        [projectId]: items
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

  // 添加工作项 - 使用选择的项目ID
  const addWorkItem = async () => {
    // 使用选择的项目ID，如果没有则获取最后一个工作项的项目ID作为默认值
    const projectId = selectedProjectId || (workItems.length > 0
      ? workItems[workItems.length - 1].projectId
      : (projects.length > 0 ? projects[0].id : ''));

    if (projectId === '') {
      toast.error('请先选择一个项目');
      return;
    }

    // 确保该项目的工作分解项已加载
    if (!workBreakdownItems[projectId]) {
      await fetchWorkBreakdownItems(projectId);
    }

    setWorkItems([...workItems, { content: '', projectId }]);

    // 重置选择的项目ID
    setSelectedProjectId('');
  };

  // 添加特定项目的工作项
  const handleAddWorkItem = async (projectId: string) => {
    if (!projectId) return; // 安全检查

    // 确保该项目的工作分解项已加载
    if (!workBreakdownItems[projectId]) {
      await fetchWorkBreakdownItems(projectId);
    }

    setWorkItems([...workItems, { content: '', projectId }]);
  };

  // 删除工作项
  const removeWorkItem = (index: number) => {
    if (index < 0 || index >= workItems.length) return; // 安全检查

    const newItems = [...workItems];
    newItems.splice(index, 1);
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

  // 计算按项目分组的工作项 - 使用useMemo确保稳定性
  const workItemsGroupedByProject = useMemo(() => {
    return projects
      .map(project => {
        const projectItems = workItems.filter(item => item.projectId === project.id)
          .map((item, index) => ({
            ...item,
            tempId: item.id || `temp-${project.id}-${index}`,
            globalIndex: workItems.findIndex(wi => wi === item) // 添加全局索引
          }));

        // 计算项目的首次出现时间
        const firstAppearanceIndex = workItems.findIndex(item => item.projectId === project.id);

        return {
          projectId: project.id,
          projectName: `${project.name} (${project.code})`,
          sortIndex: firstAppearanceIndex === -1 ? Number.MAX_SAFE_INTEGER : firstAppearanceIndex,
          items: projectItems
        };
      })
      // 只显示用户已添加的项目（即已在workItems中使用的项目）
      .filter(group => workItems.some(item => item.projectId === group.projectId))
      .sort((a, b) => a.sortIndex - b.sortIndex); // 按项目在工作项中的首次出现顺序排序
  }, [projects, workItems]);

  // 计算可用的项目（已选择的项目不再显示）
  const availableProjects = useMemo(() => {
    const usedProjectIds = Array.from(new Set(workItems.map(item => item.projectId)))
      .filter(id => id !== ''); // 过滤空项目ID

    return projects
      .filter(project =>
        // 允许选择所有未被使用的项目
        !usedProjectIds.includes(project.id)
      );
  }, [projects, workItems]);

  // 渲染工作分解项选择器
  const renderWorkItemSelector = (projectId: string, selectedWorkItemId?: string, onChange?: (value: string) => void) => {
    const items = workBreakdownItems[projectId] || [];

    // 如果工作项还没有加载，尝试加载
    if (items.length === 0 && projectId) {
      fetchWorkBreakdownItems(projectId);
    }

    const renderOptions = (items: WorkBreakdownItemWithChildren[], level = 0): JSX.Element[] => {
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

  // 暂存项目周报
  const saveDraft = async () => {
    if (!user) return;

    // 暂存不需要验证数据，允许保存空内容
    const validItems = workItems.filter(item => item.content.trim() && item.projectId);

    setIsSavingDraft(true);
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
      
      // 插入新条目，包含快照字段
      const itemsToInsert = await Promise.all(validItems.map(async (item) => {
        // 获取项目信息用于快照
        const project = projects.find(p => p.id === item.projectId);

        // 获取工作项信息用于快照
        let workItemName = null;
        let workItemPath = null;
        if (item.workItemId && workBreakdownItems[item.projectId]) {
          const workItem = workBreakdownItems[item.projectId].find(w => w.id === item.workItemId);
          if (workItem) {
            workItemName = workItem.name;
            // 构建工作项路径
            workItemPath = buildWorkItemPath(workItem, workBreakdownItems[item.projectId]);
          }
        }

        return {
          report_id: currentReportId,
          project_id: item.projectId,
          work_item_id: item.workItemId || null,
          content: item.content.trim(),
          // 快照字段
          project_name: project?.name || null,
          project_code: project?.code || null,
          work_item_name: workItemName,
          work_item_path: workItemPath
        };
      }));
      
      const { error: insertError } = await supabase
        .from('project_weekly_report_items')
        .insert(itemsToInsert);
      
      if (insertError) {
        throw insertError;
      }
      
      toast.success('项目周报暂存成功');

      // 暂存后不清除页面状态，也不跳转
    } catch (error) {
      console.error('暂存项目周报失败', error);
      toast.error('暂存项目周报失败');
    } finally {
      setIsSavingDraft(false);
    }
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

    setIsSavingReport(true);
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

      // 插入新条目，包含快照字段
      const itemsToInsert = await Promise.all(validItems.map(async (item) => {
        // 获取项目信息用于快照
        const project = projects.find(p => p.id === item.projectId);

        // 获取工作项信息用于快照
        let workItemName = null;
        let workItemPath = null;
        if (item.workItemId && workBreakdownItems[item.projectId]) {
          const workItem = workBreakdownItems[item.projectId].find(w => w.id === item.workItemId);
          if (workItem) {
            workItemName = workItem.name;
            // 构建工作项路径
            workItemPath = buildWorkItemPath(workItem, workBreakdownItems[item.projectId]);
          }
        }

        return {
          report_id: currentReportId,
          project_id: item.projectId,
          work_item_id: item.workItemId || null,
          content: item.content.trim(),
          // 快照字段
          project_name: project?.name || null,
          project_code: project?.code || null,
          work_item_name: workItemName,
          work_item_path: workItemPath
        };
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
      setIsSavingReport(false);
    }
  };

  // 切换预览模式
  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  // 切换到上一周
  const goToPreviousWeek = () => {
    const currentDate = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const previousWeek = new Date(currentDate);
    previousWeek.setDate(currentDate.getDate() - 7);

    const newYear = getYear(startOfISOWeek(previousWeek));
    const newWeek = getISOWeek(startOfISOWeek(previousWeek));

    // 立即清空当前状态，避免数据混乱
    setReportId('');
    setWorkItems([]);
    setIsPlan(false);

    setYear(newYear);
    setWeekNumber(newWeek);
  };

  // 切换到下一周
  const goToNextWeek = () => {
    const currentDate = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const nextWeek = new Date(currentDate);
    nextWeek.setDate(currentDate.getDate() + 7);

    const newYear = getYear(startOfISOWeek(nextWeek));
    const newWeek = getISOWeek(startOfISOWeek(nextWeek));

    // 立即清空当前状态，避免数据混乱
    setReportId('');
    setWorkItems([]);
    setIsPlan(false);

    setYear(newYear);
    setWeekNumber(newWeek);
  };

  // 复制为Markdown格式
  const handleCopyMarkdown = () => {
    const previewContent = generatePreviewContent();

    if (!previewContent || previewContent.length === 0) {
      toast.error('没有可复制的内容');
      return;
    }

    let markdownContent = '';

    previewContent.forEach((projectData: any) => {
      markdownContent += `## ${projectData.project.name}\n`;

      if (showWorkItems) {
        // 显示工作项时：按工作项分组
        if (Object.keys(projectData.workItems).length > 0) {
          if (showHierarchy && projectData.workItemsHierarchy.length > 0) {
            // 层级模式：显示完整路径
            projectData.workItemsHierarchy.forEach((hierarchyItem: any) => {
              markdownContent += `### ${hierarchyItem.fullPath}\n`;
              let itemCounter = 1;
              hierarchyItem.items.forEach((item: any) => {
                markdownContent += `${itemCounter}. ${item.content}\n`;
                itemCounter++;
              });
            });
          } else {
            // 简单模式：只显示工作项名称
            Object.values(projectData.workItems).forEach((workItemData: any) => {
              markdownContent += `### ${workItemData.workItem.name}\n`;
              let itemCounter = 1;
              workItemData.items.forEach((item: any) => {
                markdownContent += `${itemCounter}. ${item.content}\n`;
                itemCounter++;
              });
            });
          }
        }

        // 其他工作（显示工作项时单独显示）
        if (projectData.directItems.length > 0) {
          markdownContent += `### 其他工作\n`;
          let otherItemCounter = 1;
          projectData.directItems.forEach((item: any) => {
            markdownContent += `${otherItemCounter}. ${item.content}\n`;
            otherItemCounter++;
          });
        }
      } else {
        // 隐藏工作项时：直接列出所有内容
        let itemCounter = 1;
        projectData.items.forEach((item: any) => {
          markdownContent += `${itemCounter}. ${item.content}\n`;
          itemCounter++;
        });
      }

      markdownContent += '\n';
    });

    navigator.clipboard.writeText(markdownContent)
      .then(() => {
        toast.success('Markdown格式内容已复制到剪贴板');
      })
      .catch(err => {
        console.error('复制失败:', err);
        toast.error('复制失败，请重试');
      });
  };

  // 复制为YAML格式
  const handleCopyYaml = () => {
    const previewContent = generatePreviewContent();

    if (!previewContent || previewContent.length === 0) {
      toast.error('没有可复制的内容');
      return;
    }

    let yamlContent = '';

    previewContent.forEach((projectData: any) => {
      yamlContent += `${projectData.project.name}:\n`;

      if (showWorkItems) {
        // 显示工作项时：按工作项分组
        if (Object.keys(projectData.workItems).length > 0) {
          if (showHierarchy && projectData.workItemsHierarchy.length > 0) {
            // 层级模式：使用完整路径
            projectData.workItemsHierarchy.forEach((hierarchyItem: any) => {
              yamlContent += `  ${hierarchyItem.fullPath}:\n`;
              hierarchyItem.items.forEach((item: any) => {
                yamlContent += `    - ${item.content}\n`;
              });
            });
          } else {
            // 简单模式：使用工作项名称
            Object.values(projectData.workItems).forEach((workItemData: any) => {
              yamlContent += `  ${workItemData.workItem.name}:\n`;
              workItemData.items.forEach((item: any) => {
                yamlContent += `    - ${item.content}\n`;
              });
            });
          }
        }

        // 其他工作（显示工作项时单独显示）
        if (projectData.directItems.length > 0) {
          yamlContent += `  其他工作:\n`;
          projectData.directItems.forEach((item: any) => {
            yamlContent += `    - ${item.content}\n`;
          });
        }
      } else {
        // 隐藏工作项时：直接在项目下列出
        projectData.items.forEach((item: any) => {
          yamlContent += `  - ${item.content}\n`;
        });
      }

      yamlContent += '\n';
    });

    navigator.clipboard.writeText(yamlContent)
      .then(() => {
        toast.success('YAML格式内容已复制到剪贴板');
      })
      .catch(err => {
        console.error('复制失败:', err);
        toast.error('复制失败，请重试');
      });
  };

  // 生成预览内容 - 支持工作项和层级显示
  const generatePreviewContent = () => {
    const validItems = workItems.filter(item => item.content.trim() && item.projectId);

    if (validItems.length === 0) {
      return null;
    }

    // 按项目分组
    const projectGroups: { [projectId: string]: any } = {};

    validItems.forEach(item => {
      const project = projects.find(p => p.id === item.projectId);
      if (project) {
        if (!projectGroups[project.id]) {
          projectGroups[project.id] = {
            project,
            items: [],
            workItems: {},
            directItems: [],
            workItemsHierarchy: []
          };
        }

        projectGroups[project.id].items.push(item);

        if (item.workItemId && allWorkItems[project.id]) {
          const workItem = allWorkItems[project.id].find(wi => wi.id === item.workItemId);
          if (workItem) {
            if (!projectGroups[project.id].workItems[item.workItemId]) {
              projectGroups[project.id].workItems[item.workItemId] = {
                workItem,
                items: [],
                mergedContent: ''
              };
            }
            projectGroups[project.id].workItems[item.workItemId].items.push(item);
          } else {
            projectGroups[project.id].directItems.push(item);
          }
        } else {
          projectGroups[project.id].directItems.push(item);
        }
      }
    });

    // 处理工作项层级结构和合并内容
    Object.values(projectGroups).forEach((projectData: any) => {
      // 合并相同工作项的内容
      Object.values(projectData.workItems).forEach((workItemData: any) => {
        const contents = workItemData.items.map((item: any) => item.content).filter((content: string) => content.trim());
        workItemData.mergedContent = contents.join('\n');
      });

      // 构建层级结构
      if (showHierarchy && allWorkItems[projectData.project.id]) {
        const hierarchyMap = new Map();

        Object.values(projectData.workItems).forEach((workItemData: any) => {
          const workItem = workItemData.workItem;
          const fullPath = buildWorkItemPath(workItem, allWorkItems[projectData.project.id]);

          if (!hierarchyMap.has(workItem.id)) {
            hierarchyMap.set(workItem.id, {
              id: workItem.id,
              name: workItem.name,
              level: workItem.level || 0,
              parent_id: workItem.parent_id,
              children: [],
              items: [],
              fullPath: fullPath
            });
          }

          const hierarchyItem = hierarchyMap.get(workItem.id);
          hierarchyItem.items.push(...workItemData.items);
        });

        projectData.workItemsHierarchy = Array.from(hierarchyMap.values());
      }
    });

    return Object.values(projectGroups);
  };



  // 初始化数据
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjects();
      fetchExistingReport();
      urlParamsCheckedRef.current = true;
    }
  }, [user, fetchProjects, fetchExistingReport]);

  // 监听年份和周数变化，重新加载数据
  useEffect(() => {
    if (user && dataLoadedRef.current) {
      // 重置报告ID，因为切换了时间
      setReportId('');
      // 清空当前工作项内容
      setWorkItems([]);
      // 重置计划状态
      setIsPlan(false);
      // 重新加载该周的报告数据
      fetchExistingReport(true);
    }
  }, [year, weekNumber, user, fetchExistingReport]);

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <Link href="/dashboard/project-reports" className="mr-3 p-2 rounded-full text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">编辑项目周报</h1>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {reportId && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  已有周报
                </span>
              )}
              {isPlan && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  项目计划
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={togglePreview}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <EyeIcon className="h-4 w-4 mr-1.5" />
            {showPreview ? '返回编辑' : '预览'}
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={isSavingDraft || isSavingReport || projects.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingDraft ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-1.5 animate-spin" />
                暂存中...
              </>
            ) : (
              <>
                <BookmarkIcon className="h-4 w-4 mr-1.5" />
                暂存
              </>
            )}
          </button>
          <button
            type="button"
            onClick={saveReport}
            disabled={isSavingDraft || isSavingReport || projects.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingReport ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-1.5 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <SaveIcon className="h-4 w-4 mr-1.5" />
                保存周报
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center p-6 md:p-12">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm md:text-base text-gray-500">加载中...</span>
        </div>
      ) : showPreview ? (
        <div className="bg-white shadow rounded-lg p-4 sm:p-6 border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 pb-3 border-b gap-3">
            <div>
              <h2 className="text-lg font-medium">项目周报预览</h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">查看格式化后的周报内容</p>
            </div>

            {/* 控制按钮区域 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 显示控制开关 */}
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

              {/* 复制按钮 */}
              <button
                onClick={handleCopyMarkdown}
                className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                title="复制为Markdown格式"
              >
                <CopyIcon className="h-3 w-3 mr-1" />MD
              </button>

              <button
                onClick={handleCopyYaml}
                className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                title="复制为YAML格式"
              >
                <CopyIcon className="h-3 w-3 mr-1" />YML
              </button>
            </div>
          </div>

          <div className="border-b pb-3 mb-4">
            <div className="flex items-center">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 mr-2" />
              <p className="font-medium text-sm sm:text-base text-gray-800">{year}年第{weekNumber}周 ({formattedPeriod})</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 text-xs rounded-full inline-flex items-center ${reportId ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {reportId ? '已保存' : '未保存'}
              </span>
              {isPlan && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 inline-flex items-center">
                  项目计划
                </span>
              )}
            </div>
          </div>

          {(() => {
            const previewContent = generatePreviewContent();
            return previewContent && previewContent.length > 0 ? (
              <div className="space-y-4">
                {previewContent.map((projectData: any) => (
                  <div key={projectData.project.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    {/* 项目标题 */}
                    <div className="flex items-center mb-3 pb-2 border-b border-blue-200">
                      <div className="text-base font-medium text-blue-700">
                        {projectData.project.name}
                      </div>
                      <div className="text-sm text-blue-500 ml-2">
                        ({projectData.project.code})
                      </div>
                    </div>

                    {/* 工作内容 */}
                    <div className="space-y-3">
                      {showWorkItems ? (
                        <>
                          {/* 显示工作项分组 */}
                          {showHierarchy && projectData.workItemsHierarchy.length > 0 ? (
                            // 层级模式
                            projectData.workItemsHierarchy.map((hierarchyItem: any) => (
                              <div key={hierarchyItem.id} className="bg-white border border-blue-100 rounded-md p-3">
                                <div className="text-sm font-medium text-blue-600 mb-2">
                                  {hierarchyItem.fullPath}
                                </div>
                                <div className="space-y-1">
                                  {hierarchyItem.items.map((item: any, index: number) => (
                                    <div key={index} className="text-sm text-gray-700">
                                      {index + 1}. {item.content}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            // 简单模式
                            Object.values(projectData.workItems).map((workItemData: any) => (
                              <div key={workItemData.workItem.id} className="bg-white border border-blue-100 rounded-md p-3">
                                <div className="text-sm font-medium text-blue-600 mb-2">
                                  {workItemData.workItem.name}
                                </div>
                                <div className="space-y-1">
                                  {workItemData.items.map((item: any, index: number) => (
                                    <div key={index} className="text-sm text-gray-700">
                                      {index + 1}. {item.content}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}

                          {/* 其他工作（未选择工作项的内容）- 显示工作项时单独显示 */}
                          {projectData.directItems.length > 0 && (
                            <div className="bg-white border border-blue-100 rounded-md p-3">
                              <div className="text-sm font-medium text-blue-600 mb-2">
                                其他工作
                              </div>
                              <div className="space-y-1">
                                {projectData.directItems.map((item: any, index: number) => (
                                  <div key={index} className="text-sm text-gray-700">
                                    {index + 1}. {item.content}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        // 隐藏工作项时：显示所有内容的简化视图
                        <div className="bg-white border border-blue-100 rounded-md p-3">
                          <div className="space-y-1">
                            {projectData.items.map((item: any, index: number) => (
                              <div key={index} className="text-sm text-gray-700">
                                {index + 1}. {item.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-6 sm:py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-xs sm:text-sm">预览将在此处显示</p>
                <p className="text-xs mt-0.5 sm:mt-1">请先添加工作项内容</p>
              </div>
            );
          })()}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); saveReport(); }} className="space-y-4 sm:space-y-6">
          {/* 周报基本信息 */}
          <div className="bg-white shadow rounded-lg p-4 sm:p-6 border border-gray-100">
            <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  周报时间
                </label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex-1 mr-3">
                    <CalendarIcon className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                    <div className="text-sm font-medium text-blue-700">
                      {year}年第{weekNumber}周 ({formattedPeriod})
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={goToPreviousWeek}
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      title="上一周"
                    >
                      <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
                    </button>

                    <button
                      type="button"
                      onClick={goToNextWeek}
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      title="下一周"
                    >
                      <ChevronRightIcon className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                {reportId && (
                  <div className="mt-1.5 sm:mt-2 flex items-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      已有周报
                    </span>
                    <span className="ml-2 text-xs sm:text-sm text-gray-600">
                      已加载该周的周报内容
                    </span>
                  </div>
                )}
              </div>

              {/* 项目计划区域 */}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                <div className="flex items-center mb-1.5 sm:mb-2">
                  <input
                    id="is-plan"
                    name="is-plan"
                    type="checkbox"
                    checked={isPlan}
                    onChange={(e) => setIsPlan(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                  />
                  <label htmlFor="is-plan" className="ml-2 block text-sm font-medium text-gray-700">
                    标记为项目计划
                  </label>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  项目计划将显示蓝色标签，用于区分计划性工作和实际完成的工作
                </p>
              </div>
            </div>
          </div>

          {/* 工作内容和预览区域 */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* 工作内容区域 */}
            <div className="w-full lg:w-2/3">
              <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-800 flex items-center">
                <FileTextIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />项目工作内容
              </h3>
              <div className="space-y-3 sm:space-y-4 mb-4">
                {/* 添加新项目工作 */}
                {projects && projects.length > 0 && (
                  <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm text-gray-700">添加新项目工作</h4>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-grow">
                        <select
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                          className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                        >
                          <option value="">选择项目...</option>
                          {availableProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name} ({project.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={addWorkItem}
                        disabled={!selectedProjectId}
                        className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-xs sm:text-sm transition-colors"
                      >
                        <PlusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> 添加
                      </button>
                    </div>
                  </div>
                )}

                {/* 按项目分组的工作项 */}
                {workItemsGroupedByProject.map((group, groupIndex) => (
                  <div key={groupIndex} className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-2 sm:mb-3">
                      <h4 className="font-medium text-sm text-blue-600">{group.projectName}</h4>
                      <button
                        type="button"
                        onClick={() => handleAddWorkItem(group.projectId)}
                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium flex items-center transition-colors"
                      >
                        <PlusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" /> 添加工作项
                      </button>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {group.items.map((item, itemIndex) => (
                        <div key={item.tempId} className="flex items-start gap-2 sm:gap-3">
                          <div className="flex-grow space-y-2">
                            {/* 工作项分类选择 */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                工作项分类（可选）
                              </label>
                              {renderWorkItemSelector(
                                group.projectId,
                                item.workItemId,
                                (value) => {
                                  if (item.globalIndex !== -1) {
                                    updateWorkItem(item.globalIndex, 'workItemId', value);
                                  }
                                }
                              )}
                            </div>

                            {/* 工作内容输入 */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                工作内容 <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                value={item.content}
                                onChange={(e) => {
                                  if (item.globalIndex !== -1) {
                                    updateWorkItem(item.globalIndex, 'content', e.target.value);
                                  }
                                }}
                                rows={2}
                                placeholder="请输入工作内容..."
                                className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm transition-all"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.globalIndex !== -1) {
                                removeWorkItem(item.globalIndex);
                              }
                            }}
                            className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 实时预览面板 */}
            <div className="w-full lg:w-1/3">
              <div className="sticky top-4">
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-800 flex items-center">
                  <EyeIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />实时预览
                </h3>
                <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                    <div className="text-sm font-medium text-gray-700">
                      {year}年第{weekNumber}周
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={handleCopyMarkdown}
                        className="inline-flex items-center px-1 py-0.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="复制为Markdown格式"
                      >
                        <CopyIcon className="h-3 w-3 mr-0.5" />MD
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyYaml}
                        className="inline-flex items-center px-1 py-0.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="复制为YAML格式"
                      >
                        <CopyIcon className="h-3 w-3 mr-0.5" />YML
                      </button>
                    </div>
                  </div>

                  {/* 控制按钮区域 */}
                  <div className="flex flex-wrap items-center gap-1 mb-3 pb-2 border-b border-gray-100">
                    <button
                      type="button"
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
                        type="button"
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

                  {(() => {
                    const previewContent = generatePreviewContent();
                    return previewContent && previewContent.length > 0 ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {previewContent.map((projectData: any) => (
                          <div key={projectData.project.id} className="bg-blue-50 border border-blue-200 rounded p-2">
                            {/* 项目标题 */}
                            <div className="text-xs font-medium text-blue-700 mb-2 pb-1 border-b border-blue-200">
                              {projectData.project.name}
                            </div>

                            {/* 工作内容 */}
                            <div className="space-y-2">
                              {showWorkItems ? (
                                <>
                                  {/* 显示工作项分组 */}
                                  {showHierarchy && projectData.workItemsHierarchy.length > 0 ? (
                                    // 层级模式
                                    projectData.workItemsHierarchy.map((hierarchyItem: any) => (
                                      <div key={hierarchyItem.id} className="bg-white border border-blue-100 rounded p-2">
                                        <div className="text-xs font-medium text-blue-600 mb-1">
                                          {hierarchyItem.fullPath}
                                        </div>
                                        <div className="space-y-0.5">
                                          {hierarchyItem.items.map((item: any, index: number) => (
                                            <div key={index} className="text-xs text-gray-700">
                                              {index + 1}. {item.content}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    // 简单模式
                                    Object.values(projectData.workItems).map((workItemData: any) => (
                                      <div key={workItemData.workItem.id} className="bg-white border border-blue-100 rounded p-2">
                                        <div className="text-xs font-medium text-blue-600 mb-1">
                                          {workItemData.workItem.name}
                                        </div>
                                        <div className="space-y-0.5">
                                          {workItemData.items.map((item: any, index: number) => (
                                            <div key={index} className="text-xs text-gray-700">
                                              {index + 1}. {item.content}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  )}

                                  {/* 其他工作（未选择工作项的内容）- 显示工作项时单独显示 */}
                                  {projectData.directItems.length > 0 && (
                                    <div className="bg-white border border-blue-100 rounded p-2">
                                      <div className="text-xs font-medium text-blue-600 mb-1">
                                        其他工作
                                      </div>
                                      <div className="space-y-0.5">
                                        {projectData.directItems.map((item: any, index: number) => (
                                          <div key={index} className="text-xs text-gray-700">
                                            {index + 1}. {item.content}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                // 隐藏工作项时：显示所有内容的简化视图
                                <div className="bg-white border border-blue-100 rounded p-2">
                                  <div className="space-y-0.5">
                                    {projectData.items.map((item: any, index: number) => (
                                      <div key={index} className="text-xs text-gray-700">
                                        {index + 1}. {item.content}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 py-6 bg-gray-50 rounded border border-dashed border-gray-200">
                        <p className="text-xs">预览将在此处显示</p>
                        <p className="text-xs mt-1">请先添加工作项内容</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
