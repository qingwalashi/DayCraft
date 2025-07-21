"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, TrashIcon, PencilIcon, FileTextIcon, AlertCircleIcon, CalendarIcon, EyeIcon, EyeOffIcon, CopyIcon, PresentationIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, getWeek, getYear, addWeeks, subWeeks, isToday, startOfISOWeek, endOfISOWeek, getISOWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePersistentState } from "@/lib/utils/page-persistence";
import PresentationMode from "@/components/project-reports/PresentationMode";



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
  projects?: Project; // 改为可选，因为项目可能已被删除
  work_breakdown_items?: {
    id: string;
    name: string;
    level?: number;
    parent_id?: string;
  };
  // 快照字段，用于保留历史记录
  project_name?: string;
  project_code?: string;
  work_item_name?: string;
  work_item_path?: string;
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
      mergedContent: string;
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

  // 辅助函数：获取项目显示信息，优先使用快照字段
  const getProjectDisplayInfo = useCallback((item: ProjectWeeklyReportItemData) => {
    // 优先使用快照字段
    if (item.project_name) {
      return {
        name: item.project_name,
        code: item.project_code || '',
        isDeleted: !item.projects // 如果没有关联的项目对象，说明项目已被删除
      };
    }
    // 如果没有快照字段，使用关联的项目信息
    if (item.projects) {
      return {
        name: item.projects.name,
        code: item.projects.code,
        isDeleted: false
      };
    }
    // 都没有的话，返回默认值
    return {
      name: '未知项目',
      code: '',
      isDeleted: true
    };
  }, []);

  // 辅助函数：获取工作项显示信息，优先使用快照字段
  const getWorkItemDisplayInfo = useCallback((item: ProjectWeeklyReportItemData) => {
    // 优先使用快照字段
    if (item.work_item_name) {
      return {
        name: item.work_item_name,
        path: item.work_item_path || item.work_item_name,
        isDeleted: !item.work_breakdown_items // 如果没有关联的工作项对象，说明工作项已被删除
      };
    }
    // 如果没有快照字段，使用关联的工作项信息
    if (item.work_breakdown_items) {
      return {
        name: item.work_breakdown_items.name,
        path: item.work_breakdown_items.name, // 这里可以后续优化为完整路径
        isDeleted: false
      };
    }
    // 都没有的话，返回null（表示没有工作项）
    return null;
  }, []);

  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const isRequestingRef = useRef(false);

  // 显示控制状态
  const [showWorkItems, setShowWorkItems] = usePersistentState('project-reports-show-work-items', true);
  const [showHierarchy, setShowHierarchy] = usePersistentState('project-reports-show-hierarchy', false);

  // 删除确认状态
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  // 年度数据状态
  const [currentYear, setCurrentYear] = usePersistentState('project-reports-current-year', new Date().getFullYear());
  const [yearlyData, setYearlyData] = useState<{ [week: number]: { hasReport: boolean; isPlan: boolean } }>({});

  // 项目筛选状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = usePersistentState('project-reports-selected-project', '');

  // 演示模式状态
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  
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

    const grouped: { [projectKey: string]: GroupedProjectData } = {};

    currentWeekData.report.items.forEach(item => {
      const projectInfo = getProjectDisplayInfo(item);
      // 使用项目名称作为分组键，因为项目可能已被删除
      const projectKey = item.projects?.id || `deleted_${projectInfo.name}_${projectInfo.code}`;

      if (!grouped[projectKey]) {
        // 创建项目对象，优先使用实际项目信息，否则使用快照信息
        const project: Project = item.projects || {
          id: projectKey,
          name: projectInfo.name,
          code: projectInfo.code,
          description: null,
          user_id: '',
          created_at: '',
          updated_at: '',
          is_active: false
        };

        grouped[projectKey] = {
          project,
          items: [],
          workItems: {},
          directItems: [],
          workItemsHierarchy: []
        };
      }

      grouped[projectKey].items.push(item);

      // 处理工作项信息
      const workItemInfo = getWorkItemDisplayInfo(item);
      if (workItemInfo) {
        const workItemId = item.work_breakdown_items?.id || `deleted_${workItemInfo.name}`;
        if (!grouped[projectKey].workItems[workItemId]) {
          // 创建工作项对象，优先使用实际工作项信息，否则使用快照信息
          const workItem = item.work_breakdown_items || {
            id: workItemId,
            name: workItemInfo.name,
            level: 0,
            parent_id: undefined
          };

          grouped[projectKey].workItems[workItemId] = {
            workItem,
            items: [],
            mergedContent: ''
          };
        }
        grouped[projectKey].workItems[workItemId].items.push(item);
      } else {
        grouped[projectKey].directItems.push(item);
      }
    });

    // 为每个项目构建工作项层级结构并合并相同工作项的内容
    Object.keys(grouped).forEach(projectId => {
      // 合并相同工作项的内容
      Object.values(grouped[projectId].workItems).forEach(workItemData => {
        const contents = workItemData.items.map(item => item.content.trim()).filter(content => content);
        workItemData.mergedContent = contents.join('\n');
      });

      grouped[projectId].workItemsHierarchy = buildWorkItemHierarchy(projectId, grouped[projectId].items);
    });

    // 应用项目筛选
    let result = Object.values(grouped);
    if (selectedProjectId) {
      result = result.filter(projectData => projectData.project.id === selectedProjectId);
    }

    return result;
  }, [currentWeekData.report, buildWorkItemHierarchy, selectedProjectId]);





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
            project_name,
            project_code,
            work_item_name,
            work_item_path,
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
        const projectIds = Array.from(new Set(
          itemsData?.map((item: any) => item.projects?.id).filter(Boolean) || []
        ));
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

  // 生成年度数据
  const generateYearlyData = useCallback(() => {
    const yearData: { [week: number]: { hasReport: boolean; isPlan: boolean } } = {};

    // 初始化所有周数据
    for (let week = 1; week <= 53; week++) {
      yearData[week] = { hasReport: false, isPlan: false };
    }

    // 获取当前年份的所有周报
    const currentYearReports = reports.filter(report => report.year === currentYear);

    // 标记有周报的周数和计划状态
    currentYearReports.forEach(report => {
      yearData[report.week_number] = {
        hasReport: true,
        isPlan: report.is_plan || false
      };
    });

    setYearlyData(yearData);
  }, [reports, currentYear]);

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

  // 确认删除项目周报
  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;

    setIsDeletingReport(true);
    try {
      const { error } = await supabase
        .from('project_weekly_reports')
        .delete()
        .eq('id', reportToDelete);

      if (error) {
        throw error;
      }

      toast.success('项目周报删除成功');
      // 强制刷新数据
      fetchProjectReports(true);
    } catch (error) {
      console.error('删除项目周报失败', error);
      toast.error('删除项目周报失败');
    } finally {
      setIsDeletingReport(false);
      setReportToDelete(null);
      setConfirmDeleteOpen(false);
    }
  };

  // 复制项目周报为Markdown格式
  const handleCopyMarkdown = (reportData: GroupedProjectData[]) => {
    let markdownContent = '';

    reportData.forEach(projectData => {
      markdownContent += `## ${projectData.project.name}\n\n`;

      let itemCounter = 1; // 全局序号计数器

      // 按工作项分组的工作
      if (showWorkItems && Object.keys(projectData.workItems).length > 0) {
        if (showHierarchy) {
          // 层级模式：显示完整层级路径
          projectData.workItemsHierarchy.forEach(hierarchyItem => {
            markdownContent += `### ${hierarchyItem.fullPath}\n`;
            const mergedContent = projectData.workItems[hierarchyItem.id]?.mergedContent ||
                                 hierarchyItem.items.map(item => item.content).join('\n');
            let workItemCounter = 1; // 每个工作项下的序号从1开始
            mergedContent.split('\n').forEach(line => {
              if (line.trim()) {
                markdownContent += `${workItemCounter}. ${line.trim()}\n`;
                workItemCounter++;
              }
            });
            markdownContent += '\n';
          });
        } else {
          // 简单模式：显示工作项名称
          Object.values(projectData.workItems).forEach(workItemData => {
            markdownContent += `### ${workItemData.workItem.name}\n`;
            let workItemCounter = 1; // 每个工作项下的序号从1开始
            workItemData.mergedContent.split('\n').forEach(line => {
              if (line.trim()) {
                markdownContent += `${workItemCounter}. ${line.trim()}\n`;
                workItemCounter++;
              }
            });
            markdownContent += '\n';
          });
        }
      } else if (!showWorkItems && Object.keys(projectData.workItems).length > 0) {
        // 隐藏工作项时：不显示工作项分组，直接列出内容
        let hiddenItemCounter = 1; // 隐藏工作项时的序号从1开始
        Object.values(projectData.workItems).forEach(workItemData => {
          workItemData.mergedContent.split('\n').forEach(line => {
            if (line.trim()) {
              markdownContent += `${hiddenItemCounter}. ${line.trim()}\n`;
              hiddenItemCounter++;
            }
          });
        });
        // 其他工作（未选择工作项的内容）
        projectData.directItems.forEach(item => {
          markdownContent += `${hiddenItemCounter}. ${item.content}\n`;
          hiddenItemCounter++;
        });
        markdownContent += '\n';
      } else {
        // 只有其他工作的情况
        if (projectData.directItems.length > 0) {
          let otherItemCounter = 1;
          projectData.directItems.forEach(item => {
            markdownContent += `${otherItemCounter}. ${item.content}\n`;
            otherItemCounter++;
          });
          markdownContent += '\n';
        }
      }

      // 其他工作（未选择工作项的内容）- 显示工作项时单独处理
      if (showWorkItems && Object.keys(projectData.workItems).length > 0 && projectData.directItems.length > 0) {
        markdownContent += `### 其他工作\n`;
        let otherItemCounter = 1; // 其他工作的序号从1开始
        projectData.directItems.forEach(item => {
          markdownContent += `${otherItemCounter}. ${item.content}\n`;
          otherItemCounter++;
        });
        markdownContent += '\n';
      }
    });

    copyToClipboard(markdownContent, 'Markdown格式内容已复制到剪贴板');
  };

  // 复制项目周报为YAML格式
  const handleCopyYaml = (reportData: GroupedProjectData[]) => {
    let yamlContent = '';

    reportData.forEach(projectData => {
      yamlContent += `${projectData.project.name}:\n`;

      // 按工作项分组的工作
      if (showWorkItems && Object.keys(projectData.workItems).length > 0) {
        if (showHierarchy) {
          // 层级模式：带层级路径的工作项标识
          projectData.workItemsHierarchy.forEach(hierarchyItem => {
            yamlContent += `  ${hierarchyItem.fullPath}:\n`;
            const mergedContent = projectData.workItems[hierarchyItem.id]?.mergedContent ||
                                 hierarchyItem.items.map(item => item.content).join('\n');
            mergedContent.split('\n').forEach(line => {
              if (line.trim()) {
                yamlContent += `    - ${line.trim()}\n`;
              }
            });
          });
        } else {
          // 简单模式：带工作项名称的标识
          Object.values(projectData.workItems).forEach(workItemData => {
            yamlContent += `  ${workItemData.workItem.name}:\n`;
            workItemData.mergedContent.split('\n').forEach(line => {
              if (line.trim()) {
                yamlContent += `    - ${line.trim()}\n`;
              }
            });
          });
        }

        // 其他工作（未选择工作项的内容）- 显示工作项时单独处理
        if (projectData.directItems.length > 0) {
          yamlContent += `  其他工作:\n`;
          projectData.directItems.forEach(item => {
            yamlContent += `    - ${item.content}\n`;
          });
        }
      } else if (!showWorkItems && Object.keys(projectData.workItems).length > 0) {
        // 隐藏工作项时：直接在项目下列出所有内容
        Object.values(projectData.workItems).forEach(workItemData => {
          workItemData.mergedContent.split('\n').forEach(line => {
            if (line.trim()) {
              yamlContent += `  - ${line.trim()}\n`;
            }
          });
        });
        // 其他工作
        projectData.directItems.forEach(item => {
          yamlContent += `  - ${item.content}\n`;
        });
      } else {
        // 只有其他工作的情况
        projectData.directItems.forEach(item => {
          yamlContent += `  - ${item.content}\n`;
        });
      }

      yamlContent += '\n';
    });

    copyToClipboard(yamlContent, 'YAML格式内容已复制到剪贴板');
  };

  // 通用复制函数
  const copyToClipboard = (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(() => {
            toast.success(successMessage);
          })
          .catch(err => {
            console.error('复制失败:', err);
            fallbackCopyTextToClipboard(text, successMessage);
          });
      } else {
        fallbackCopyTextToClipboard(text, successMessage);
      }
    } catch (err) {
      console.error('复制失败:', err);
      toast.error('复制失败，请重试');
    }
  };

  // 回退复制方法
  const fallbackCopyTextToClipboard = (text: string, successMessage: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;

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
          toast.success(successMessage);
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

  // 年度导航
  const goToPreviousYear = () => {
    setCurrentYear(currentYear - 1);
    setIsYearManuallyChanged(true);
  };

  const goToNextYear = () => {
    setCurrentYear(currentYear + 1);
    setIsYearManuallyChanged(true);
  };

  const goToCurrentYear = () => {
    setCurrentYear(new Date().getFullYear());
    setIsYearManuallyChanged(false); // 回到当前年份时重置标志
  };

  // 初始化数据
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjectReports();
      fetchProjects();
    }
  }, [user, fetchProjectReports, fetchProjects]);

  // 生成年度数据 - 确保总是有数据显示
  useEffect(() => {
    generateYearlyData();
  }, [generateYearlyData]);

  // 确保页面加载时就有年度数据显示
  useEffect(() => {
    // 即使没有reports数据，也要初始化年度数据
    if (Object.keys(yearlyData).length === 0) {
      const initialYearData: { [week: number]: { hasReport: boolean; isPlan: boolean } } = {};
      for (let week = 1; week <= 53; week++) {
        initialYearData[week] = { hasReport: false, isPlan: false };
      }
      setYearlyData(initialYearData);
    }
  }, [yearlyData]);

  // 初始化时同步当前周的年份到年度显示
  const [isYearManuallyChanged, setIsYearManuallyChanged] = useState(false);

  useEffect(() => {
    // 只在用户没有手动改变年份时才自动同步
    if (!isYearManuallyChanged && currentWeekData.year !== currentYear) {
      setCurrentYear(currentWeekData.year);
    }
  }, [currentWeekData.year, currentYear, setCurrentYear, isYearManuallyChanged]);

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

      {/* 年度填写情况展示 - 独立区域 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base md:text-lg font-medium text-gray-700">
              {currentYear}年填写情况
            </h2>
            <div className="flex items-center text-xs text-gray-500">
              <button
                onClick={goToPreviousYear}
                className="mr-1 p-1 rounded hover:bg-gray-100"
                aria-label="上一年"
              >
                <ChevronLeftIcon className="h-3 w-3" />
              </button>
              <span className="font-medium text-gray-600 mx-2">
                {currentYear}
              </span>
              <button
                onClick={goToNextYear}
                className="ml-1 p-1 rounded hover:bg-gray-100"
                aria-label="下一年"
              >
                <ChevronRightIcon className="h-3 w-3" />
              </button>
              <button
                onClick={goToCurrentYear}
                className="ml-2 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100"
              >
                今年
              </button>
            </div>
          </div>

          {/* 紧凑的周数展示 */}
          <div className="space-y-1.5">
            {[
              { name: 'Q1', start: 1, end: 13 },
              { name: 'Q2', start: 14, end: 26 },
              { name: 'Q3', start: 27, end: 39 },
              { name: 'Q4', start: 40, end: 53 }
            ].map((quarter) => (
              <div key={quarter.name} className="flex items-center space-x-2">
                <div className="text-xs text-gray-500 font-medium w-6">{quarter.name}</div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: quarter.end - quarter.start + 1 }, (_, index) => {
                    const weekNumber = quarter.start + index;
                    const weekData = yearlyData[weekNumber] || { hasReport: false, isPlan: false };
                    const isCurrentWeek = currentWeekData.year === currentYear && currentWeekData.week_number === weekNumber;

                    let bgColor = 'bg-gray-200 hover:bg-gray-300';
                    let statusText = '未填写';

                    if (weekData.hasReport) {
                      if (weekData.isPlan) {
                        bgColor = 'bg-blue-500 hover:bg-blue-600';
                        statusText = '已填写 (计划)';
                      } else {
                        bgColor = 'bg-green-500 hover:bg-green-600';
                        statusText = '已填写';
                      }
                    }

                    return (
                      <div
                        key={weekNumber}
                        className={`
                          w-3 h-3 rounded-sm cursor-pointer transition-colors duration-200
                          ${bgColor}
                          ${isCurrentWeek ? 'ring-1 ring-orange-500' : ''}
                        `}
                        title={`第${weekNumber}周 (${statusText})`}
                        onClick={() => {
                          // 点击跳转到对应周
                          const targetDate = new Date(currentYear, 0, 1 + (weekNumber - 1) * 7);
                          setCurrentWeek(targetDate);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 统计信息 */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-sm mr-1"></div>
                <span>已填写</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-sm mr-1"></div>
                <span>计划</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-gray-200 rounded-sm mr-1"></div>
                <span>未填写</span>
              </div>
            </div>
            <div>
              {Object.values(yearlyData).filter(data => data.hasReport).length} / 53 周
            </div>
          </div>
        </div>
      </div>

      {/* 周导航 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6 border-b border-gray-200">
          {/* 移动端：垂直布局 */}
          <div className="block md:hidden">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-medium">项目周报</h2>
              <Link
                href={`/dashboard/project-reports/new?year=${currentWeekData.year}&week=${currentWeekData.week_number}`}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                新建周报
              </Link>
            </div>

            {/* 移动端控制区域 */}
            <div className="space-y-3">
              {/* 项目筛选 - 移动端全宽 */}
              <div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">全部项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 时间导航和本周按钮 */}
              <div className="flex justify-between items-center">
                <div className="flex items-center text-sm text-gray-500">
                  <button
                    onClick={goToPreviousWeek}
                    className="mr-2 p-2 rounded-full hover:bg-gray-100"
                    aria-label="上一周"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="font-medium text-gray-700 whitespace-nowrap px-2">
                    {currentWeekData.year}年第{currentWeekData.week_number}周
                  </span>
                  <button
                    onClick={goToNextWeek}
                    className="ml-2 p-2 rounded-full hover:bg-gray-100"
                    aria-label="下一周"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={goToCurrentWeek}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  本周
                </button>
              </div>
            </div>
          </div>

          {/* 桌面端：水平布局 */}
          <div className="hidden md:flex justify-between items-center">
            <h2 className="text-lg font-medium">
              项目周报
            </h2>
            <div className="flex items-center space-x-4">
              {/* 项目筛选 */}
              <div className="flex items-center">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-40"
                >
                  <option value="">全部项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 时间导航 */}
              <div className="flex items-center text-sm text-gray-500">
                <button
                  onClick={goToPreviousWeek}
                  className="mr-2 p-1 rounded-full hover:bg-gray-100"
                  aria-label="上一周"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="font-medium text-gray-700 whitespace-nowrap">
                  {currentWeekData.year}年第{currentWeekData.week_number}周
                </span>
                <button
                  onClick={goToNextWeek}
                  className="ml-2 p-1 rounded-full hover:bg-gray-100"
                  aria-label="下一周"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={goToCurrentWeek}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  本周
                </button>
                <Link
                  href={`/dashboard/project-reports/new?year=${currentWeekData.year}&week=${currentWeekData.week_number}`}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  新建周报
                </Link>
              </div>
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
              {/* 筛选状态显示 */}
              {selectedProjectId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="text-sm text-blue-700">
                        正在筛选项目：
                        <span className="font-medium ml-1">
                          {projects.find(p => p.id === selectedProjectId)?.name || '未知项目'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedProjectId('')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      清除筛选
                    </button>
                  </div>
                </div>
              )}

              {/* 周报标题和操作按钮 */}
              <div className="mb-4">
                {/* 第一行：标题行 */}
                <div className="flex items-center mb-3">
                  <div className="flex items-center space-x-2">
                    <FileTextIcon className="h-5 w-5 text-blue-500" />
                    <span className="text-sm md:text-base font-medium">
                      {currentWeekData.report.formattedPeriod} 项目周报
                      {selectedProjectId && (
                        <span className="text-xs md:text-sm text-gray-500 ml-2">
                          ({projects.find(p => p.id === selectedProjectId)?.name})
                        </span>
                      )}
                    </span>
                    {currentWeekData.report.is_plan && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        项目计划
                      </span>
                    )}
                  </div>
                </div>

                {/* 第二行及以后：所有操作按钮，支持自动换行 */}
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
                    onClick={() => handleCopyMarkdown(groupedProjectData)}
                    className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    title="复制为Markdown格式"
                  >
                    <CopyIcon className="h-3 w-3 mr-1" />
                    MD
                  </button>

                  <button
                    onClick={() => handleCopyYaml(groupedProjectData)}
                    className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    title="复制为YAML格式"
                  >
                    <CopyIcon className="h-3 w-3 mr-1" />
                    YML
                  </button>

                  {/* 演示模式按钮 */}
                  <button
                    onClick={() => setIsPresentationMode(true)}
                    className="inline-flex items-center px-2 py-1 border border-blue-300 text-xs font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                    title="演示模式"
                  >
                    <PresentationIcon className="h-3 w-3 mr-1" />
                    演示
                  </button>

                  {/* 编辑和删除按钮（所有设备都显示） */}
                  <Link
                    href={`/dashboard/project-reports/new?year=${currentWeekData.year}&week=${currentWeekData.week_number}`}
                    className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <PencilIcon className="h-3 w-3 mr-1" />
                    编辑
                  </Link>

                  <button
                    onClick={(e) => handleDeleteClick(e, currentWeekData.report!.id)}
                    className="inline-flex items-center px-2 py-1 border border-red-300 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                  >
                    <TrashIcon className="h-3 w-3 mr-1" />
                    删除
                  </button>
                </div>
              </div>
              
              {/* 筛选结果统计 */}
              {selectedProjectId && (
                <div className="text-xs text-gray-500 mb-3">
                  显示 {groupedProjectData.length} 个项目的工作内容
                </div>
              )}

              {/* 周报条目 - 参考日报预览样式 */}
              <div className="space-y-3 md:space-y-4">
                {groupedProjectData.length > 0 ? groupedProjectData.map((projectData) => (
                  <div key={projectData.project.id} className="border-l-2 border-blue-500 pl-2 md:pl-4 py-1 md:py-2">
                    {/* 项目标题 - 参考日报样式 */}
                    <div className="flex items-center mb-1 md:mb-2">
                      <div className={`text-sm font-medium ${projectData.project.is_active === false ? 'text-gray-500' : 'text-blue-600'}`}>
                        {projectData.project.name}
                      </div>
                      <div className="text-sm text-gray-500 ml-1">
                        ({projectData.project.code})
                      </div>
                      {projectData.project.is_active === false && (
                        <span className="text-xs text-red-500 ml-2 px-1 py-0.5 bg-red-50 rounded">
                          已删除
                        </span>
                      )}
                    </div>

                    {/* 项目内容 - 简化列表 */}
                    <div>
                      {/* 统一的工作内容列表 - 工作项单独一行，内容带序号 */}
                      <div className="space-y-2 md:space-y-3">
                        {/* 按工作项分组的工作 */}
                        {showWorkItems && Object.keys(projectData.workItems).length > 0 && (
                          <>
                            {showHierarchy ? (
                              // 层级模式：显示完整的工作项层级路径
                              projectData.workItemsHierarchy.map((hierarchyItem) => {
                                const mergedContent = projectData.workItems[hierarchyItem.id]?.mergedContent ||
                                                     hierarchyItem.items.map(item => item.content).join('\n');
                                const contentLines = mergedContent.split('\n').filter(line => line.trim());

                                // 检查工作项是否已删除
                                const workItemData = projectData.workItems[hierarchyItem.id];
                                const isWorkItemDeleted = workItemData?.items.some(item =>
                                  getWorkItemDisplayInfo(item)?.isDeleted
                                );

                                return (
                                  <div key={hierarchyItem.id} className="text-xs md:text-sm">
                                    {/* 工作项标题单独一行 */}
                                    <div className={`font-medium mb-1 flex items-center ${isWorkItemDeleted ? 'text-gray-500' : 'text-blue-500'}`}>
                                      <span>{hierarchyItem.fullPath}</span>
                                      {isWorkItemDeleted && (
                                        <span className="text-xs text-red-500 ml-2 px-1 py-0.5 bg-red-50 rounded">
                                          已删除
                                        </span>
                                      )}
                                    </div>
                                    {/* 工作内容带序号 */}
                                    <div className="ml-2 space-y-0.5">
                                      {contentLines.map((line, index) => (
                                        <div key={index} className="text-gray-600 flex items-start">
                                          <span className="mr-2 text-blue-400 flex-shrink-0 font-medium">
                                            {index + 1}.
                                          </span>
                                          <span className="break-words">{line.trim()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              // 简单模式：显示工作项名称
                              Object.values(projectData.workItems).map((workItemData) => {
                                const contentLines = workItemData.mergedContent.split('\n').filter(line => line.trim());

                                // 检查工作项是否已删除
                                const isWorkItemDeleted = workItemData.items.some(item =>
                                  getWorkItemDisplayInfo(item)?.isDeleted
                                );

                                return (
                                  <div key={workItemData.workItem.id} className="text-xs md:text-sm">
                                    {/* 工作项标题单独一行 */}
                                    <div className={`font-medium mb-1 flex items-center ${isWorkItemDeleted ? 'text-gray-500' : 'text-blue-500'}`}>
                                      <span>{workItemData.workItem.name}</span>
                                      {isWorkItemDeleted && (
                                        <span className="text-xs text-red-500 ml-2 px-1 py-0.5 bg-red-50 rounded">
                                          已删除
                                        </span>
                                      )}
                                    </div>
                                    {/* 工作内容带序号 */}
                                    <div className="ml-2 space-y-0.5">
                                      {contentLines.map((line, index) => (
                                        <div key={index} className="text-gray-600 flex items-start">
                                          <span className="mr-2 text-blue-400 flex-shrink-0 font-medium">
                                            {index + 1}.
                                          </span>
                                          <span className="break-words">{line.trim()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </>
                        )}

                        {/* 当隐藏工作项时，显示所有内容的简化视图 */}
                        {!showWorkItems && (Object.keys(projectData.workItems).length > 0 || projectData.directItems.length > 0) && (
                          <div className="text-xs md:text-sm">
                            <div className="space-y-0.5">
                              {[
                                // 工作项内容
                                ...Object.values(projectData.workItems).flatMap(workItemData =>
                                  workItemData.mergedContent.split('\n').filter(line => line.trim())
                                ),
                                // 其他工作内容
                                ...projectData.directItems.map(item => item.content.trim()).filter(content => content)
                              ].map((line, index) => (
                                <div key={index} className="text-gray-600 flex items-start">
                                  <span className="mr-2 text-blue-400 flex-shrink-0 font-medium">
                                    {index + 1}.
                                  </span>
                                  <span className="break-words">{line}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 其他工作（未选择工作项的内容）- 只在显示工作项时单独显示 */}
                        {showWorkItems && projectData.directItems.length > 0 && (
                          <div className="text-xs md:text-sm">
                            {/* 其他工作标题单独一行 */}
                            <div className="text-blue-500 font-medium mb-1">
                              其他工作
                            </div>
                            {/* 其他工作内容带序号 */}
                            <div className="ml-2 space-y-0.5">
                              {projectData.directItems.map((item, index) => (
                                <div key={item.id} className="text-gray-600 flex items-start">
                                  <span className="mr-2 text-blue-400 flex-shrink-0 font-medium">
                                    {index + 1}.
                                  </span>
                                  <span className="break-words">{item.content}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  /* 筛选后无结果的提示 */
                  selectedProjectId && (
                    <div className="text-center py-8">
                      <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium text-gray-900">该项目本周暂无工作内容</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        项目"{projects.find(p => p.id === selectedProjectId)?.name}"在本周没有记录工作内容
                      </p>
                      <div className="mt-4">
                        <button
                          onClick={() => setSelectedProjectId('')}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          查看所有项目
                        </button>
                      </div>
                    </div>
                  )
                )}
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

      {/* 删除确认对话框 */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-3 md:p-6 max-w-md w-full mx-3 md:mx-4">
            <div className="mb-2 md:mb-4">
              <h3 className="text-base md:text-lg font-medium text-gray-900">确认删除</h3>
            </div>
            <div className="mb-4 md:mb-6">
              <p className="text-xs md:text-sm text-gray-700">确定要删除这个项目周报吗？此操作无法撤销。</p>
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

      {/* 演示模式组件 */}
      <PresentationMode
        isOpen={isPresentationMode}
        onClose={() => setIsPresentationMode(false)}
        reportData={groupedProjectData}
        reportPeriod={currentWeekData.report?.formattedPeriod || ''}
        isPlan={currentWeekData.report?.is_plan || false}
      />
    </div>
  );
}
