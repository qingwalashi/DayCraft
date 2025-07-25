"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, WorkBreakdownItem } from "@/lib/supabase/client";
import { toast } from "sonner";
import { FilterIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GanttChart from "@/components/gantt/GanttChart";
import MilestoneTimeline from "@/components/milestone/MilestoneTimeline";
import { calculateWorkItemProgress } from "@/lib/utils/progress-calculator";

export default function ProjectProgressPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workItems, setWorkItems] = useState<any[]>([]);
  const supabase = createClient();
  
  // 添加数据加载状态跟踪
  const dataLoadedRef = useRef<boolean>(false);
  const lastLoadTimeRef = useRef<number>(0);
  // 移除数据刷新间隔

  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
      
      // 如果有项目，默认选择第一个
      if (data && data.length > 0) {
        setSelectedProject(data[0] as Project);
      }
      
      // 更新数据加载时间戳
      lastLoadTimeRef.current = Date.now();
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // 加载项目的工作分解数据
  const fetchWorkItems = useCallback(async (projectId: string) => {
    if (!projectId || !user?.id) {
      setWorkItems([]);
      return;
    }
    
    setIsLoading(true);
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
      
      setWorkItems(data || []);
      
      // 更新数据加载状态和时间戳
      dataLoadedRef.current = true;
      lastLoadTimeRef.current = Date.now();
    } catch (error) {
      console.error('获取工作分解数据失败', error);
      toast.error('获取工作分解数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // 更新工作项
  const handleUpdateWorkItem = async (item: any) => {
    if (!user?.id) return false;
    
    try {
      // 将甘特图组件中的数据格式转换为数据库格式
      const updateData = {
        planned_start_time: item.startDate,
        planned_end_time: item.endDate,
        actual_start_time: item.actualStartDate,
        actual_end_time: item.actualEndDate,
        status: item.status
      };
      
      const { error } = await supabase
        .from('work_breakdown_items')
        .update(updateData)
        .eq('id', item.id)
        .eq('user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      toast.success('工作项更新成功');
      
      // 重新加载工作项数据
      if (selectedProject) {
        fetchWorkItems(selectedProject.id);
      }
      
      return true;
    } catch (error) {
      console.error('更新工作项失败:', error);
      toast.error('更新工作项失败');
      return false;
    }
  };

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('进度管理页面恢复可见，保持现有数据');
          // 不再自动刷新数据
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // 当选择的项目变化时，加载该项目的工作分解数据
  useEffect(() => {
    if (selectedProject?.id && user?.id) {
      // 只有在数据未加载时才重新加载数据
      if (!dataLoadedRef.current) {
      fetchWorkItems(selectedProject.id);
      }
    }
  }, [selectedProject, user, fetchWorkItems]);

  // 转换工作项数据为甘特图所需格式，使用新的进度计算逻辑
  const ganttData = workItems.map(item => {
    // 构建用于进度计算的数据结构
    const buildProgressItem = (workItem: any): any => ({
      id: workItem.id,
      status: workItem.status,
      children: workItems
        .filter(child => child.parent_id === workItem.id)
        .map(buildProgressItem)
    });

    const progressItem = buildProgressItem(item);
    const calculatedProgress = calculateWorkItemProgress(progressItem);

    return {
      id: item.id,
      name: item.name,
      level: item.level,
      parentId: item.parent_id,
      startDate: item.planned_start_time || null,
      endDate: item.planned_end_time || null,
      actualStartDate: item.actual_start_time,
      actualEndDate: item.actual_end_time,
      progress: calculatedProgress,
      status: item.status,
      description: item.description,
      tags: item.tags,
      members: item.members,
      progress_notes: item.progress_notes
    };
  });

  // 筛选出里程碑数据
  const milestoneData = workItems
    .filter(item => item.is_milestone)
    .map(item => ({
      id: item.id,
      name: item.name,
      planned_end_time: item.planned_end_time,
      actual_end_time: item.actual_end_time,
      status: item.status
    }));

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {selectedProject ? `${selectedProject.name} 进度管理` : '项目进度管理'}
        </h1>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-500">项目筛选:</span>
          </div>
          <Select
            value={selectedProject?.id || ""}
            onValueChange={(value: string) => {
              const project = projects.find(p => p.id === value);
              setSelectedProject(project || null);

              // 切换项目时重置数据加载状态
              if (project && project.id !== selectedProject?.id) {
                dataLoadedRef.current = false;
              }
            }}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 里程碑时间轴 */}
          {selectedProject && workItems.length > 0 && (
            <MilestoneTimeline milestones={milestoneData} />
          )}

          {/* 甘特图 - 移动端适配高度 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-[calc(100vh-320px)] sm:h-[calc(100vh-280px)]">
            {selectedProject ? (
              workItems.length > 0 ? (
              <GanttChart
                data={ganttData}
                projectName={selectedProject.name}
                onUpdateItem={handleUpdateWorkItem}
              />
              ) : (
                <div className="flex justify-center items-center h-full">
                  <p className="text-gray-500">该项目暂无工作项，请先在工作分解页面添加工作项</p>
                </div>
              )
            ) : (
              <div className="flex justify-center items-center h-full">
                <p className="text-gray-500">请选择一个项目</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 