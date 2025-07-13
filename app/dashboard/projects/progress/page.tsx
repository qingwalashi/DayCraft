"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project, WorkBreakdownItem } from "@/lib/supabase/client";
import { toast } from "sonner";
import { FilterIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GanttChart from "@/components/gantt/GanttChart";

export default function ProjectProgressPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workItems, setWorkItems] = useState<any[]>([]);
  const supabase = createClient();

  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
      
      // 如果有项目，默认选择第一个
      if (data && data.length > 0) {
        setSelectedProject(data[0] as Project);
      }
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
    } catch (error) {
      console.error('获取工作分解数据失败', error);
      toast.error('获取工作分解数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // 初始加载
  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // 当选择的项目变化时，加载该项目的工作分解数据
  useEffect(() => {
    if (selectedProject?.id && user?.id) {
      fetchWorkItems(selectedProject.id);
    }
  }, [selectedProject, user, fetchWorkItems]);

  // 转换工作项数据为甘特图所需格式
  const ganttData = workItems.map(item => ({
    id: item.id,
    name: item.name,
    level: item.level,
    parentId: item.parent_id,
    startDate: item.planned_start_time || new Date().toISOString(),
    endDate: item.planned_end_time || new Date().toISOString(),
    actualStartDate: item.actual_start_time,
    actualEndDate: item.actual_end_time,
    progress: item.actual_start_time ? (item.actual_end_time ? 100 : 50) : 0
  }));

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {selectedProject ? `${selectedProject.name} 进度管理` : '项目进度管理'}
        </h1>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-500">项目筛选:</span>
          </div>
          <Select
            value={selectedProject?.id || ""}
            onValueChange={(value: string) => {
              const project = projects.find(p => p.id === value);
              setSelectedProject(project || null);
            }}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[200px]">
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-[calc(100vh-200px)]">
          {selectedProject ? (
            <GanttChart 
              data={ganttData}
              projectName={selectedProject.name}
            />
          ) : (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-500">请选择一个项目</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 