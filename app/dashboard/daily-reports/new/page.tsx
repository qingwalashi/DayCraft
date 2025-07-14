"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, PlusIcon, TrashIcon, SaveIcon, ArrowLeftIcon, CopyIcon, EyeIcon, FileTextIcon, PlusCircleIcon, AlertTriangleIcon, BookmarkIcon, ClipboardListIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { usePersistentState, clearPageState } from "@/lib/utils/page-persistence";

interface WorkItem {
  id?: string; // 添加可选的id字段，用于跟踪已有工作项
  content: string;
  projectId: string;
}

// 添加一些类型定义
interface DailyReportData {
  id: string;
  is_plan?: boolean; // 添加是否为工作计划字段
}

interface ReportItemData {
  id: string;
  content: string;
  project_id: string;
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
}

interface ProjectWithTodos {
  id: string;
  name: string;
  code: string;
  todos: Todo[];
}

export default function NewDailyReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  
  // 使用持久化状态替代普通状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // 添加暂存状态
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingExistingReport, setIsLoadingExistingReport] = useState(false);
  const [date, setDate] = usePersistentState<string>('new-daily-report-date', format(new Date(), 'yyyy-MM-dd'));
  const [workItems, setWorkItems] = usePersistentState<WorkItem[]>('new-daily-report-work-items', []);
  const [projects, setProjects] = usePersistentState<Project[]>('new-daily-report-projects', []);
  const [existingReport, setExistingReport] = usePersistentState<boolean>('new-daily-report-existing', false);
  const [existingReportId, setExistingReportId] = usePersistentState<string | null>('new-daily-report-id', null);
  const [existingReportItems, setExistingReportItems] = usePersistentState<{id: string}[]>('new-daily-report-items', []);
  const [showPreview, setShowPreview] = usePersistentState<boolean>('new-daily-report-preview', false);
  const [isPlan, setIsPlan] = usePersistentState<boolean>('new-daily-report-is-plan', false); // 添加是否为工作计划的状态
  const [selectedProjectId, setSelectedProjectId] = usePersistentState<string>('new-daily-report-selected-project', '');

  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const urlParamsCheckedRef = useRef(false);
  // 添加toast通知控制标志
  const reportContentLoadedNotificationRef = useRef(false);
  // 数据刷新间隔（毫秒），设置为10分钟
  const DATA_REFRESH_INTERVAL = 10 * 60 * 1000;
  // 添加请求状态跟踪，避免重复请求
  const isRequestingRef = useRef<Record<string, boolean>>({});
  // 防抖延迟
  const DEBOUNCE_DELAY = 300;

  // 添加未完成待办项目状态
  const [projectsWithTodos, setProjectsWithTodos] = useState<ProjectWithTodos[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [showTodos, setShowTodos] = useState(false); // 默认隐藏待办

  // 加载已有日报的内容 - 使用useCallback包装
  const loadExistingReportContent = useCallback(async (reportId: string) => {
    try {
      console.log(`正在加载日报ID: ${reportId} 的内容`);
      const { data, error } = await supabase
        .from('report_items')
        .select(`
          id,
          content,
          project_id
        `)
        .eq('report_id', reportId);
        
      if (error) {
        throw error;
      }
      
      console.log(`加载到 ${data?.length || 0} 条工作项`);
      
      // 使用类型断言
      const typedItems = data as ReportItemData[];
      
      // 保存已有工作项的ID，用于后续更新
      if (typedItems && typedItems.length > 0) {
        setExistingReportItems(typedItems.map(item => ({id: item.id})));
        
        // 将现有的日报项目转换为WorkItem格式，包含ID信息
        const existingItems: WorkItem[] = typedItems.map(item => ({
          id: item.id,
          content: item.content,
          projectId: item.project_id
        }));
        
        setWorkItems(existingItems);
        
        // 只在首次加载成功后显示通知
        if (!reportContentLoadedNotificationRef.current) {
          toast.info('已加载现有日报内容');
          reportContentLoadedNotificationRef.current = true;
        }
      } else {
        // 如果数据库中有日报记录但没有工作项
        // 不再自动添加空的工作项，让用户自己选择添加
        setWorkItems([]);
        
        // 只在首次加载时显示通知
        if (!reportContentLoadedNotificationRef.current) {
          toast.info('该日报没有工作内容，可以添加新内容');
          reportContentLoadedNotificationRef.current = true;
        }
      }
    } catch (error) {
      console.error('加载日报内容失败', error);
      toast.error('加载日报内容失败');
    }
  }, [supabase, setWorkItems, setExistingReportItems]);

  // 检查所选日期是否已存在日报 - 使用useCallback包装
  const checkExistingReport = useCallback(async (selectedDate: string) => {
    if (!user) return;
    
    // 检查是否正在请求中，避免重复请求
    if (isRequestingRef.current[`report-${selectedDate}`]) {
      console.log(`日报检查正在请求中，跳过重复请求: ${selectedDate}`);
      return;
    }
    
    try {
      // 设置请求状态
      isRequestingRef.current[`report-${selectedDate}`] = true;
      setIsLoadingExistingReport(true);
      // 重置已有日报状态
      setExistingReportId(null);
      setExistingReport(false);
      setExistingReportItems([]);
      
      // 重置工作项 - 当选择新日期时，不预先选择任何项目
      setWorkItems([]);
      
      const { data, error } = await supabase
        .from('daily_reports')
        .select('id, is_plan')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') { // 没有找到记录
          setIsLoadingExistingReport(false);
          return;
        }
        throw error;
      }
      
      // 使用类型断言
      const typedData = data as DailyReportData;
      if (typedData && typedData.id) {
        setExistingReport(true);
        setExistingReportId(typedData.id);
        setIsPlan(typedData.is_plan || false); // 设置是否为工作计划
        
        // 如果找到现有日报，加载它的内容
        await loadExistingReportContent(typedData.id);
      }
      
    } catch (error) {
      console.error('检查日报是否存在时出错', error);
    } finally {
      // 清除请求状态
      isRequestingRef.current[`report-${selectedDate}`] = false;
      setIsLoadingExistingReport(false);
    }
  }, [user, supabase, setExistingReport, setExistingReportId, setExistingReportItems, setIsPlan, loadExistingReportContent, setWorkItems]);

  // 加载活跃项目数据 - 使用useCallback包装
  const loadActiveProjects = useCallback(async () => {
    if (!user) return;
    
    // 检查是否正在请求中，避免重复请求
    if (isRequestingRef.current['projects']) {
      console.log('项目数据正在请求中，跳过重复请求');
      return;
    }
    
    // 检查是否已加载过数据
    if (dataLoadedRef.current && projects.length > 0) {
      console.log('已有项目数据，跳过重新获取');
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
    
    console.log('加载项目数据');
    
    // 设置请求状态
    isRequestingRef.current['projects'] = true;
    setIsLoading(true);
    try {
      // 获取所有活跃的项目
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (projectsError) {
        throw projectsError;
      }

      // 添加类型断言确保类型匹配
      const typedProjects = projectsData as Project[] || [];
      setProjects(typedProjects);
      
      // 更新加载状态和时间戳
      dataLoadedRef.current = true;
      lastLoadTimeRef.current = now;
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目数据失败');
    } finally {
      // 清除请求状态
      isRequestingRef.current['projects'] = false;
      setIsLoading(false);
    }
  }, [user, supabase, setProjects]);

  // 检查URL参数
  const checkUrlParams = useCallback(async () => {
    if (urlParamsCheckedRef.current) return;
    
    try {
      // 检查URL参数中是否有日期
      const urlParams = new URLSearchParams(window.location.search);
      const dateParam = urlParams.get('date');
      
      if (dateParam) {
        console.log(`从URL参数获取日期: ${dateParam}`);
        setDate(dateParam);
        await checkExistingReport(dateParam);
      } else if (date) {
        // 检查所选日期是否已存在日报
        await checkExistingReport(date);
      }
      
      urlParamsCheckedRef.current = true;
    } catch (error) {
      console.error('检查URL参数时出错', error);
    }
  }, [setDate, checkExistingReport]);

  // 处理日期变更
  const handleDateChange = useCallback(async (newDate: string) => {
    // 如果日期改变，清空之前的工作项内容
    reportContentLoadedNotificationRef.current = false; // 重置通知状态，允许新的通知
    
    setDate(newDate);
    await checkExistingReport(newDate);
  }, [setDate, checkExistingReport]);

  // 初始加载数据
  useEffect(() => {
    if (user) {
      loadActiveProjects();
      checkUrlParams();
    }
  }, [user]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('日报编辑页面恢复可见，检查数据状态');
          
          // 检查是否需要重新加载数据
          const now = Date.now();
          const timeSinceLastLoad = now - lastLoadTimeRef.current;
          
          // 如果超过刷新间隔，重新加载数据
          if (timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
            console.log('数据超过刷新间隔，重新加载');
            // 重置数据加载状态
            dataLoadedRef.current = false;
            // 使用setTimeout避免在事件处理中直接调用
            setTimeout(() => {
              loadActiveProjects().then(() => {
                console.log('项目数据已刷新');
              });
            }, 100);
          } else {
            console.log('数据在刷新间隔内，保持现有数据');
          }
          
          // 仅在必要时检查URL参数（避免频繁重新加载日报内容）
          if (!urlParamsCheckedRef.current) {
            setTimeout(() => {
              checkUrlParams().then(() => {
                console.log('URL参数已检查');
              });
            }, 100);
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, loadActiveProjects, checkUrlParams, DATA_REFRESH_INTERVAL]); // 添加必要的依赖项

  // 处理工作项内容变更
  const handleWorkItemContentChange = (index: number, content: string) => {
    if (index < 0 || index >= workItems.length) return; // 安全检查
    
    const newWorkItems = [...workItems];
    newWorkItems[index].content = content;
    setWorkItems(newWorkItems);
  };

  // 处理工作项项目变更
  const handleWorkItemProjectChange = (index: number, projectId: string) => {
    if (index < 0 || index >= workItems.length) return; // 安全检查
    
    const newWorkItems = [...workItems];
    newWorkItems[index].projectId = projectId;
    setWorkItems(newWorkItems);
  };

  // 添加新的工作项
  const addWorkItem = () => {
    // 使用选择的项目ID，如果没有则获取最后一个工作项的项目ID作为默认值
    const projectId = selectedProjectId || (workItems.length > 0 
      ? workItems[workItems.length - 1].projectId 
      : (projects.length > 0 ? projects[0].id : ''));
    
    if (projectId === '') {
      toast.error('请先选择一个项目');
      return;
    }
    
    setWorkItems([...workItems, { content: '', projectId }]);
    
    // 重置选择的项目ID
    setSelectedProjectId('');
  };
  
  // 添加特定项目的工作项
  const handleAddWorkItem = (projectId: string) => {
    if (!projectId) return; // 安全检查
    
    setWorkItems([...workItems, { content: '', projectId }]);
  };

  // 计算按项目分组的工作项，并确保每个项目都有一个稳定的唯一ID
  const workItemsGroupedByProject = projects
    .map(project => {
      const projectItems = workItems.filter(item => item.projectId === project.id)
        .map((item, index) => ({
          ...item,
          tempId: item.id || `temp-${project.id}-${index}-${Math.random().toString(36).substring(2, 9)}` 
        }));
      
      // 计算项目的首次出现时间
      const firstAppearanceIndex = workItems.findIndex(item => item.projectId === project.id);
      
      return {
        projectId: project.id,
        projectName: `${project.name} (${project.code})`,
        sortIndex: firstAppearanceIndex === -1 ? Number.MAX_SAFE_INTEGER : firstAppearanceIndex, // 如果项目未被使用，放到最后
        items: projectItems
      };
    })
    // 只显示用户已添加的项目（即已在workItems中使用的项目）
    .filter(group => workItems.some(item => item.projectId === group.projectId))
    .sort((a, b) => a.sortIndex - b.sortIndex); // 按项目在工作项中的首次出现顺序排序
  
  // 计算预览数据 - 这里只过滤有内容的工作项
  const projectWorkItems = projects
    .map(project => {
      return {
        id: project.id,
        name: project.name,
        code: project.code,
        workItems: workItems.filter(item => 
          item.projectId === project.id && item.content.trim() !== ''
        )
      };
    })
    // 只显示用户已添加的项目
    .filter(project => workItems.some(item => item.projectId === project.id));

  // 删除工作项
  const removeWorkItem = (index: number) => {
    if (index < 0 || index >= workItems.length) return; // 安全检查
    
    const newWorkItems = [...workItems];
    newWorkItems.splice(index, 1);
    setWorkItems(newWorkItems);
  };

  // 获取项目名称
  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project ? `${project.name} (${project.code})` : "";
  };

  // 复制预览内容为YAML格式
  const handleCopyPreview = () => {
    // 过滤有效的工作项
    const validWorkItems = workItems.filter(item => item.content.trim() !== '' && item.projectId);
    
    // 按项目组织工作内容
    const projectMap = new Map<string, {name: string, code: string, items: string[]}>();
    
    validWorkItems.forEach(item => {
      const project = projects.find(p => p.id === item.projectId);
      if (!project) return;
      
      if (!projectMap.has(project.id)) {
        projectMap.set(project.id, {
          name: project.name,
          code: project.code,
          items: []
        });
      }
      
      projectMap.get(project.id)?.items.push(item.content);
    });
    
    // 生成YAML格式内容
    let yamlContent = '';
    
    projectMap.forEach(project => {
      yamlContent += `${project.name}:\n`;
      project.items.forEach(content => {
        yamlContent += `  - ${content}\n`;
      });
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

  // 切换预览模式
  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  // 计算可用的项目（已选择的项目不再显示），并按项目名称排序
  const usedProjectIds = Array.from(new Set(workItems.map(item => item.projectId)))
    .filter(id => id !== ''); // 过滤空项目ID
  
  const availableProjects = projects
    .filter(project => 
      // 允许选择所有未被使用的项目
      !usedProjectIds.includes(project.id)
    );

  // 通过tempId查找工作项索引
  const findWorkItemIndex = (tempId: string) => {
    return workItems.findIndex((item, index) => {
      if (item.id && item.id === tempId) return true;
      
      // 如果没有id，则通过项目组查找
      for (const group of workItemsGroupedByProject) {
        const foundItemIndex = group.items.findIndex(groupItem => 
          groupItem.tempId === tempId
        );
        if (foundItemIndex !== -1) {
          return true;
        }
      }
      return false;
    });
  };

  // 暂存日报功能
  const handleSave = async () => {
    if (!user) {
      toast.error('用户未登录');
      return;
    }
    
    setIsSaving(true);

    // 过滤空的工作项
    const filteredItems = workItems.filter(item => 
      item.content.trim() !== '' && 
      item.projectId
    );
    
    try {
      let reportId: string;
      
      // 检查是否已存在日报
      if (existingReport && existingReportId) {
        reportId = existingReportId;
        console.log(`更新已有日报 ID: ${reportId}`);
        
        // 确保先删除原有工作项 - 改为逐条确认删除
        if (existingReportItems.length > 0) {
          console.log(`准备删除 ${existingReportItems.length} 条原有工作项`);
          
          // 使用事务或批量操作删除所有工作项
          const deletePromises = [];
          for (const item of existingReportItems) {
            const deletePromise = supabase
              .from('report_items')
              .delete()
              .eq('id', item.id);
            
            deletePromises.push(deletePromise);
          }
          
          // 等待所有删除操作完成
          const deleteResults = await Promise.all(deletePromises);
          
          // 检查是否有删除失败的情况
          let hasDeleteError = false;
          deleteResults.forEach((result, index) => {
            if (result.error) {
              console.error(`删除ID为 ${existingReportItems[index].id} 的工作项失败:`, result.error);
              hasDeleteError = true;
            }
          });
          
          if (hasDeleteError) {
            throw new Error('删除原有工作项时出现错误');
          }
          
          console.log(`已删除所有原有工作项`);
          
          // 额外验证：检查工作项是否真的已被删除
          const { data: remainingItems, error: checkError } = await supabase
            .from('report_items')
            .select('id')
            .eq('report_id', reportId);
            
          if (checkError) {
            throw checkError;
          }
          
          if (remainingItems && remainingItems.length > 0) {
            console.warn(`警告：仍有 ${remainingItems.length} 个工作项未被删除`);
            
            // 最后一次尝试删除所有剩余项
            const { error: finalDeleteError } = await supabase
              .from('report_items')
              .delete()
              .eq('report_id', reportId);
              
            if (finalDeleteError) {
              console.error('最终删除失败:', finalDeleteError);
              throw finalDeleteError;
            }
          }
        }
        
        // 等待一小段时间，确保删除操作完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 更新日报记录
        const { error: updateError } = await supabase
          .from('daily_reports')
          .update({ 
            updated_at: new Date().toISOString(),
            is_plan: isPlan // 更新是否为工作计划
          })
          .eq('id', reportId);
        
        if (updateError) {
          console.error('更新日报记录失败', updateError);
          throw updateError;
        }
      } else {
        console.log(`创建新日报，日期: ${date}`);
        // 创建新日报
        const { data: reportData, error: reportError } = await supabase
          .from('daily_reports')
          .insert({
            user_id: user.id,
            date: date,
            is_plan: isPlan // 添加是否为工作计划
          })
          .select()
          .single();
        
        if (reportError) {
          console.error('创建新日报失败', reportError);
          throw reportError;
        }
        
        reportId = reportData.id as string;
        setExistingReportId(reportId);
        setExistingReport(true);
        console.log(`新创建的日报 ID: ${reportId}`);
      }
      
      // 添加工作项
      const reportItems = filteredItems.map(item => ({
        report_id: reportId,
        project_id: item.projectId,
        content: item.content
      }));
      
      // 确保工作项不为空
      if (reportItems.length > 0) {
        console.log(`准备插入 ${reportItems.length} 条工作项`);
        console.log('工作项内容:', JSON.stringify(reportItems));
        
        // 等待一小段时间，确保上一个操作完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 创建新的工作项
        const { data: insertedItems, error: itemsError } = await supabase
          .from('report_items')
          .insert(reportItems)
          .select();
        
        if (itemsError) {
          console.error('添加工作项失败', itemsError);
          throw itemsError;
        }
        console.log(`成功添加了 ${insertedItems?.length || 0} 条工作项`);
        
        // 更新存在的工作项ID列表
        if (insertedItems && insertedItems.length > 0) {
          setExistingReportItems(insertedItems.map((item: any) => ({id: item.id})));
        }
        
        // 额外验证：检查插入后的工作项总数
        const { data: finalItems, error: finalCheckError } = await supabase
          .from('report_items')
          .select('id')
          .eq('report_id', reportId);
          
        if (finalCheckError) {
          console.warn('最终检查失败:', finalCheckError);
        } else {
          console.log(`日报现在共有 ${finalItems?.length || 0} 条工作项`);
          
          if (finalItems && reportItems.length !== finalItems.length) {
            console.warn(`警告：预期应有 ${reportItems.length} 条工作项，但实际有 ${finalItems.length} 条`);
          }
        }
      }
      
      toast.success('日报已暂存');
      
      // 暂存成功后重置加载通知标记，以便下次加载显示通知
      reportContentLoadedNotificationRef.current = false;
      
    } catch (error) {
      console.error('暂存日报失败', error);
      toast.error('暂存日报失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 提交日报
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('用户未登录');
      return;
    }
    
    setIsSubmitting(true);

    // 过滤空的工作项
    const filteredItems = workItems.filter(item => 
      item.content.trim() !== '' && 
      item.projectId
    );
    
    try {
      let reportId: string;
      
      // 检查是否已存在日报
      if (existingReport && existingReportId) {
        reportId = existingReportId;
        console.log(`更新已有日报 ID: ${reportId}`);
        
        // 确保先删除原有工作项 - 改为逐条确认删除
        if (existingReportItems.length > 0) {
          console.log(`准备删除 ${existingReportItems.length} 条原有工作项`);
          
          // 使用事务或批量操作删除所有工作项
          const deletePromises = [];
          for (const item of existingReportItems) {
            const deletePromise = supabase
              .from('report_items')
              .delete()
              .eq('id', item.id);
            
            deletePromises.push(deletePromise);
          }
          
          // 等待所有删除操作完成
          const deleteResults = await Promise.all(deletePromises);
          
          // 检查是否有删除失败的情况
          let hasDeleteError = false;
          deleteResults.forEach((result, index) => {
            if (result.error) {
              console.error(`删除ID为 ${existingReportItems[index].id} 的工作项失败:`, result.error);
              hasDeleteError = true;
            }
          });
          
          if (hasDeleteError) {
            throw new Error('删除原有工作项时出现错误');
          }
          
          console.log(`已删除所有原有工作项`);
          
          // 额外验证：检查工作项是否真的已被删除
          const { data: remainingItems, error: checkError } = await supabase
            .from('report_items')
            .select('id')
            .eq('report_id', reportId);
            
          if (checkError) {
            throw checkError;
          }
          
          if (remainingItems && remainingItems.length > 0) {
            console.warn(`警告：仍有 ${remainingItems.length} 个工作项未被删除`);
            
            // 最后一次尝试删除所有剩余项
            const { error: finalDeleteError } = await supabase
              .from('report_items')
              .delete()
              .eq('report_id', reportId);
              
            if (finalDeleteError) {
              console.error('最终删除失败:', finalDeleteError);
              throw finalDeleteError;
            }
          }
        }
        
        // 等待一小段时间，确保删除操作完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 更新日报记录
        const { error: updateError } = await supabase
          .from('daily_reports')
          .update({ 
            updated_at: new Date().toISOString(),
            is_plan: isPlan // 更新是否为工作计划
          })
          .eq('id', reportId);
        
        if (updateError) {
          console.error('更新日报记录失败', updateError);
          throw updateError;
        }
      } else {
        console.log(`创建新日报，日期: ${date}`);
        // 创建新日报
        const { data: reportData, error: reportError } = await supabase
          .from('daily_reports')
          .insert({
            user_id: user.id,
            date: date,
            is_plan: isPlan // 添加是否为工作计划
          })
          .select()
          .single();
        
        if (reportError) {
          console.error('创建新日报失败', reportError);
          throw reportError;
        }
        
        reportId = reportData.id as string;
        console.log(`新创建的日报 ID: ${reportId}`);
      }
      
      // 添加工作项
      const reportItems = filteredItems.map(item => ({
        report_id: reportId,
        project_id: item.projectId,
        content: item.content
      }));
      
      // 确保工作项不为空
      if (reportItems.length > 0) {
        console.log(`准备插入 ${reportItems.length} 条工作项`);
        console.log('工作项内容:', JSON.stringify(reportItems));
        
        // 等待一小段时间，确保上一个操作完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 创建新的工作项
        const { data: insertedItems, error: itemsError } = await supabase
          .from('report_items')
          .insert(reportItems)
          .select();
        
        if (itemsError) {
          console.error('添加工作项失败', itemsError);
          throw itemsError;
        }
        console.log(`成功添加了 ${insertedItems?.length || 0} 条工作项`);
        
        // 更新存在的工作项ID列表
        if (insertedItems && insertedItems.length > 0) {
          setExistingReportItems(insertedItems.map((item: any) => ({id: item.id})));
        }
        
        // 额外验证：检查插入后的工作项总数
        const { data: finalItems, error: finalCheckError } = await supabase
          .from('report_items')
          .select('id')
          .eq('report_id', reportId);
          
        if (finalCheckError) {
          console.warn('最终检查失败:', finalCheckError);
        } else {
          console.log(`日报现在共有 ${finalItems?.length || 0} 条工作项`);
          
          if (finalItems && reportItems.length !== finalItems.length) {
            console.warn(`警告：预期应有 ${reportItems.length} 条工作项，但实际有 ${finalItems.length} 条`);
          }
        }
      }
      
      toast.success(existingReport ? '日报更新成功' : '日报创建成功');
      
      // 清理页面状态
      clearPageState('new-daily-report-work-items');
      setWorkItems([]);
      setShowPreview(false);
      
      // 提交成功后重置加载通知标记，以便下次加载显示通知
      reportContentLoadedNotificationRef.current = false;
      
      // 延时导航回日报列表
      setTimeout(() => {
        router.push('/dashboard/daily-reports');
      }, 1000);
    } catch (error) {
      console.error('提交日报失败', error);
      toast.error('提交日报失败');
      setIsSubmitting(false);
    }
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

  // 添加待办显示切换功能
  const toggleTodosVisibility = () => {
    setShowTodos(!showTodos);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <Link href="/dashboard/daily-reports" className="mr-3 p-2 rounded-full text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{existingReport ? '编辑日报' : '新建日报'}</h1>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {existingReport && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  已有日报
                </span>
              )}
              {isPlan && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  工作计划
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
            onClick={handleSave}
            disabled={isSaving || projects.length === 0 || isLoadingExistingReport}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <BookmarkIcon className="h-4 w-4 mr-1.5" />
            {isSaving ? '保存中' : '暂存'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || projects.length === 0 || isLoadingExistingReport}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 shadow-sm text-sm font-medium rounded-md text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SaveIcon className="h-4 w-4 mr-1.5" />
            {isSubmitting ? '提交中' : (existingReport ? '更新' : '提交')}
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="bg-yellow-50 p-4 sm:p-6 rounded-lg border border-yellow-200 shadow-sm">
          <p className="text-yellow-800 text-sm sm:text-base">
            您目前没有活跃的项目。请先在 
            <Link href="/dashboard/projects" className="text-blue-600 hover:underline font-medium">
              项目管理
            </Link> 
            中创建并激活项目后再创建日报。
          </p>
        </div>
      ) : showPreview ? (
        <div className="bg-white shadow rounded-lg p-4 sm:p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4 pb-3 border-b">
            <div>
            <h2 className="text-lg font-medium">日报预览</h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">查看格式化后的日报内容</p>
            </div>
            <button
              onClick={handleCopyPreview}
              className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <CopyIcon className="h-3.5 w-3.5 mr-1" />
              复制
            </button>
          </div>
          
          <div className="border-b pb-3 mb-4">
            <div className="flex items-center">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 mr-2" />
              <p className="font-medium text-sm sm:text-base text-gray-800">{date} ({format(new Date(date), 'EEEE', { locale: zhCN })})</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 text-xs rounded-full inline-flex items-center ${existingReport ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {existingReport ? '已提交' : '未提交'}
            </span>
              {isPlan && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 inline-flex items-center">
                  工作计划
                </span>
              )}
            </div>
          </div>
          
          <div className="space-y-5">
            {projects.map(project => {
              const projectWorkItems = workItems.filter(item => 
                item.projectId === project.id && item.content.trim() !== ''
              );
              
              if (projectWorkItems.length === 0) return null;
              
              return (
                <div key={project.id} className="border-l-3 border-blue-500 pl-3 sm:pl-4 py-1 rounded bg-blue-50/30">
                  <div className="text-xs sm:text-sm font-medium text-blue-700 mb-1.5 sm:mb-2 flex items-center">
                    <FileTextIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                    {project.name} <span className="mx-1.5 text-blue-300">|</span> <span className="text-blue-600">{project.code}</span>
                  </div>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {projectWorkItems.map((item, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-600 flex items-start">
                        <span className="mr-1.5 sm:mr-2 text-blue-500">•</span>
                        <span>{item.content}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          
          {/* 当没有工作项或所有工作项都为空时显示提示 */}
          {(workItems.length === 0 || workItems.every(item => !item.content.trim())) && (
            <div className="text-center text-gray-500 py-6 sm:py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <p className="text-xs sm:text-sm">预览将在此处显示</p>
              <p className="text-xs mt-0.5 sm:mt-1">请先使用"选择项目..."下拉框添加工作项</p>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* 日期选择 */}
          <div className="bg-white shadow rounded-lg p-4 sm:p-6 border border-gray-100">
            <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
              <div className="md:col-span-2">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                日报日期
              </label>
                <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 sm:py-2.5 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
                  required
                  disabled={isLoadingExistingReport}
                />
              </div>
              {existingReport && (
                <div className="mt-1.5 sm:mt-2 flex items-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    已有日报
                  </span>
                  <span className="ml-2 text-xs sm:text-sm text-gray-600">
                    已加载该日期的日报内容
                  </span>
                </div>
              )}
              </div>
              
              {/* 工作计划区域 */}
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
                    标记为工作计划
                  </label>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  计划任务将显示蓝色标签，且不会被统计到周报或月报中
                </p>
              </div>
            </div>
          </div>

          {/* 未完成待办项目部分 - 移到工作内容上方 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div 
              className="flex items-center justify-between p-3 md:p-4 border-b border-gray-200 cursor-pointer"
              onClick={toggleTodosVisibility}
            >
              <div className="flex items-center">
                <ClipboardListIcon className="h-4 w-4 md:h-5 md:w-5 text-blue-600 mr-2" />
                <h2 className="text-sm md:text-base font-medium text-gray-800">未完成待办</h2>
              </div>
              <div className="text-xs md:text-sm text-gray-500">
                {showTodos ? '点击隐藏' : '点击显示'}
              </div>
            </div>
            
            {showTodos && (
              <div className="p-3 md:p-4">
                {isLoadingTodos ? (
                  <div className="flex justify-center items-center py-4">
                    <Loader2Icon className="h-5 w-5 text-blue-500 animate-spin" />
                    <span className="ml-2 text-sm text-gray-500">加载中...</span>
                  </div>
                ) : projectsWithTodos.length === 0 ? (
                  <div className="text-center py-4 text-sm text-gray-500">
                    暂无未完成待办
                  </div>
                ) : (
                  <>
                    <div className="mb-3 text-xs text-gray-500 flex flex-wrap gap-3">
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
                    <div className="space-y-4">
                      {projectsWithTodos.map(project => (
                        <div key={project.id} className="border-l-2 border-blue-500 pl-3 py-1">
                          <div className="text-sm font-medium text-blue-600 mb-1">
                            {project.name} ({project.code})
                          </div>
                          <ul className="space-y-1">
                            {project.todos.map(todo => (
                              <li key={todo.id} className="text-xs md:text-sm text-gray-600 flex items-center">
                                <span className={`mr-2 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                                  todo.priority === 'high' ? 'bg-red-500' : 
                                  todo.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                }`}></span>
                                <span className="flex-1">{todo.content}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                  {todo.due_date}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 工作内容和预览区域 */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* 工作内容区域 - 移动端下占满宽度 */}
            <div className="w-full lg:w-2/3">
              <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-800 flex items-center">
                <FileTextIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />今日工作内容
              </h3>
              <div className="space-y-3 sm:space-y-4 mb-4">
                {/* 添加新项目工作 - 移到上方 */}
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
                        <PlusCircleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> 添加
                      </button>
                        </div>
                      </div>
                )}

                {workItemsGroupedByProject.map((group, groupIndex) => (
                  <div key={groupIndex} className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-2 sm:mb-3">
                      <h4 className="font-medium text-sm text-blue-600">{group.projectName}</h4>
                      <button
                        type="button"
                        onClick={() => handleAddWorkItem(group.projectId)}
                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium flex items-center transition-colors"
                      >
                        <PlusCircleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" /> 添加
                      </button>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {group.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 p-2 sm:p-3 rounded-md hover:bg-gray-100 transition-colors">
                          <div className="flex-grow">
                            <input
                              type="text"
                              value={item.content}
                              onChange={(e) => {
                                const index = workItems.findIndex(wi => 
                                  (item.id && wi.id === item.id) || 
                                  (!item.id && !wi.id && wi.content === item.content && wi.projectId === item.projectId)
                                );
                                
                                if (index !== -1) {
                                  handleWorkItemContentChange(index, e.target.value);
                                }
                              }}
                              placeholder="请输入工作内容..."
                              className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm transition-all"
                            />
                          </div>
                  <button
                    type="button"
                            onClick={() => {
                              const index = workItems.findIndex(wi => 
                                (item.id && wi.id === item.id) || 
                                (!item.id && !wi.id && wi.content === item.content && wi.projectId === item.projectId)
                              );
                              
                              if (index !== -1) {
                                removeWorkItem(index);
                              }
                            }}
                            className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                        </div>
                      ))}
                      {group.items.length === 0 && (
                        <div className="text-center py-2 sm:py-3 text-gray-500 text-xs sm:text-sm">
                          点击"添加"按钮开始添加工作内容
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 当没有工作项时显示引导提示 */}
                {workItems.length === 0 && projects.length > 0 && (
                  <div className="text-center text-gray-500 py-6 sm:py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <div className="flex flex-col items-center">
                      <FileTextIcon className="h-6 w-6 sm:h-8 sm:w-8 text-gray-300 mb-2" />
                      <p className="text-sm">请使用上方"选择项目..."下拉框添加工作项</p>
                    </div>
                  </div>
                )}
              </div>
              {/* 项目管理提示 */}
              {(!projects || projects.length === 0) && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 sm:p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400" />
                    </div>
                    <div className="ml-2 sm:ml-3">
                      <p className="text-xs sm:text-sm text-yellow-700">
                        请先在"项目管理"中创建并激活项目，然后才能添加工作内容。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 预览区域 - 移动端下隐藏，或使用可折叠面板 */}
            <div className="w-full lg:w-1/3 hidden lg:block">
              <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-800 flex items-center justify-between">
                <div className="flex items-center">
                  <EyeIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />实时预览
                </div>
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <CopyIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />复制
                </button>
              </h3>
              <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200 h-full">
                {isLoadingExistingReport ? (
                  <div className="flex justify-center items-center py-6 sm:py-8">
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-t-2 border-b-2 border-blue-500"></div>
                    <span className="ml-2 sm:ml-3 text-xs sm:text-sm text-gray-600">加载中...</span>
                </div>
              ) : (
                  <div className="space-y-3 sm:space-y-4 max-h-[350px] sm:max-h-[500px] overflow-y-auto pr-1 sm:pr-2">
                    {[...projectWorkItems]
                      .sort((a, b) => {
                        // 按添加顺序排序，获取项目在工作项中的首次出现位置
                        const indexA = workItems.findIndex(item => item.projectId === a.id);
                        const indexB = workItems.findIndex(item => item.projectId === b.id);
                        
                        // 如果项目未被使用，则放在最后
                        const sortIndexA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
                        const sortIndexB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
                        
                        return sortIndexA - sortIndexB;
                      })
                      .map(project => {
                      if (project.workItems.length === 0) return null;
                    
                    return (
                        <div key={project.id} className="border-l-2 border-blue-500 pl-2 sm:pl-3 py-1.5 sm:py-2 bg-blue-50/30 rounded">
                          <div className="text-xs sm:text-sm font-medium text-blue-700 mb-1 sm:mb-1.5 flex items-center">
                            <FileTextIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                            {project.name} <span className="mx-0.5 sm:mx-1 text-blue-300 text-xs">|</span> <span className="text-blue-600 text-xs">{project.code}</span>
                        </div>
                          <ul className="space-y-1 sm:space-y-1.5">
                            {project.workItems.map((item, idx) => (
                              <li key={idx} className="text-xs sm:text-sm text-gray-600 flex items-start">
                                <span className="mr-1 sm:mr-1.5 text-blue-500">•</span>
                              <span>{item.content}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  
                  {/* 当没有工作项或所有工作项都为空时显示提示 */}
                  {(workItems.length === 0 || workItems.every(item => !item.content.trim())) && (
                    <div className="text-center text-gray-500 py-6 sm:py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      <p className="text-xs sm:text-sm">预览将在此处显示</p>
                      <p className="text-xs mt-0.5 sm:mt-1">请先使用"选择项目..."下拉框添加工作项</p>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* 移动端预览按钮 - 仅在移动端显示 */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={togglePreview}
              className="w-full flex items-center justify-center px-4 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <EyeIcon className="h-4 w-4 mr-1.5" />
              预览日报内容
            </button>
          </div>
        </form>
      )}
    </div>
  );
} 