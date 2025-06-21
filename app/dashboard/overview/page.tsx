"use client";

import { useEffect, useState } from "react";
import { BarChart3Icon, CalendarIcon, FileTextIcon, FolderIcon, CopyIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, parseISO, getWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Project } from "@/lib/supabase/client";
import Link from "next/link";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface WorkItem {
  content: string;
  project: Project;
}

interface Report {
  id: string;
  date: string;
  status: string;
  workItems: WorkItem[];
}

interface Stats {
  weeklyReportCount: number;
  pendingWeeklyReports: number;
  projectCount: number;
  monthlyWorkItemCount: number;
}

export default function DashboardOverview() {
  const { user: authUser, loading } = useAuth();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats>({
    weeklyReportCount: 0,
    pendingWeeklyReports: 0,
    projectCount: 0,
    monthlyWorkItemCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 使用Supabase的用户信息
    if (authUser) {
      setUser({
        id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '用户',
        email: authUser.email || '',
        role: 'user'
      });
      
      fetchData(authUser.id);
    }
  }, [authUser]);

  // 获取所有数据
  const fetchData = async (userId: string) => {
    setIsLoading(true);
    try {
      // 并行请求数据
      await Promise.all([
        fetchProjects(),
        fetchRecentReports(userId),
        fetchStats(userId)
      ]);
    } catch (error) {
      console.error("获取数据失败", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 获取项目数据
  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      setProjects(data as Project[] || []);
      return data;
    } catch (error) {
      console.error("获取项目数据失败", error);
      return [];
    }
  };

  // 获取最近日报
  const fetchRecentReports = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select(`
          id,
          date,
          report_items (
            id,
            content,
            projects:project_id (
              id,
              name,
              code,
              description
            )
          )
        `)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      
      // 使用类型断言处理数据
      const formattedReports = (data || []).map(report => ({
        id: report.id as string,
        date: report.date as string,
        status: '已提交',
        workItems: ((report.report_items || []) as unknown as any[]).map((item: any) => ({
          content: item.content as string,
          project: item.projects as Project
        }))
      }));
      
      setRecentReports(formattedReports);
      return formattedReports;
    } catch (error) {
      console.error("获取最近日报失败", error);
      return [];
    }
  };

  // 获取统计数据
  const fetchStats = async (userId: string) => {
    try {
      // 获取本周日报数量
      const today = new Date();
      const weekStart = format(startOfWeek(today, { locale: zhCN }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(today, { locale: zhCN }), 'yyyy-MM-dd');
      
      const { data: weeklyReports, error: weeklyError } = await supabase
        .from('daily_reports')
        .select('date')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd);
      
      if (weeklyError) throw weeklyError;
      
      // 获取本月工作项数量
      const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
      
      const { data: monthlyItems, error: monthlyError } = await supabase
        .from('daily_reports')
        .select(`
          report_items (id)
        `)
        .eq('user_id', userId)
        .gte('date', monthStart)
        .lte('date', format(today, 'yyyy-MM-dd'));
      
      if (monthlyError) throw monthlyError;
      
      // 计算本月工作项总数
      let monthlyWorkItemCount = 0;
      monthlyItems?.forEach(report => {
        monthlyWorkItemCount += (report.report_items || []).length;
      });
      
      // 获取当前周的周报是否已生成
      const currentYear = today.getFullYear();
      const currentWeek = getWeek(today, { locale: zhCN });
      
      const { data: existingWeeklyReport, error: weeklyReportError } = await supabase
        .from('weekly_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('year', currentYear)
        .eq('week_number', currentWeek)
        .maybeSingle();
      
      if (weeklyReportError && weeklyReportError.code !== 'PGRST116') {
        throw weeklyReportError;
      }
      
      // 只有当本周有日报记录且周报尚未生成时，才显示待生成周报
      const pendingWeeklyReports = (weeklyReports && weeklyReports.length > 0 && !existingWeeklyReport) ? 1 : 0;
      
      // 获取项目数量
      const { count: projectCount, error: projectError } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      
      if (projectError) throw projectError;
      
      setStats({
        weeklyReportCount: weeklyReports?.length || 0,
        pendingWeeklyReports,
        projectCount: projectCount || 0,
        monthlyWorkItemCount
      });
      
    } catch (error) {
      console.error("获取统计数据失败", error);
    }
  };

  // 获取报告涉及的所有项目
  const getReportProjects = (report: Report) => {
    const projectMap = new Map<string, Project>();
    
    report.workItems.forEach(item => {
      if (item.project && !projectMap.has(item.project.id)) {
        projectMap.set(item.project.id, item.project);
      }
    });
    
    return Array.from(projectMap.values());
  };

  // 根据项目ID获取该项目的工作项
  const getProjectWorkItems = (report: Report, projectId: string) => {
    return report.workItems.filter(item => item.project?.id === projectId);
  };

  // 生成统计卡片数据
  const generateStatsCards = () => {
    return [
      {
        id: 1,
        name: "本周填写日报",
        value: stats.weeklyReportCount.toString(),
        unit: "天",
        icon: <FileTextIcon className="h-6 w-6 text-blue-600" />,
        description: `本周已填写${stats.weeklyReportCount}天日报`,
      },
      {
        id: 2,
        name: "待生成周报",
        value: stats.pendingWeeklyReports.toString(),
        unit: "份",
        icon: <CalendarIcon className="h-6 w-6 text-green-600" />,
        description: `有${stats.pendingWeeklyReports}份周报待生成`,
      },
      {
        id: 3,
        name: "项目数量",
        value: stats.projectCount.toString(),
        unit: "个",
        icon: <FolderIcon className="h-6 w-6 text-orange-600" />,
        description: `当前共有${stats.projectCount}个项目`,
      },
      {
        id: 4,
        name: "本月工作量",
        value: stats.monthlyWorkItemCount.toString(),
        unit: "项",
        icon: <BarChart3Icon className="h-6 w-6 text-purple-600" />,
        description: `本月已完成${stats.monthlyWorkItemCount}项工作`,
      },
    ];
  };

  // 复制日报内容为YAML格式
  const handleCopyReport = (e: React.MouseEvent, report: Report) => {
    e.stopPropagation();
    
    // 获取报告中涉及的所有项目
    const reportProjects = getReportProjects(report);
    
    let yamlContent = '';
    
    // 按项目组织工作内容
    reportProjects.forEach(project => {
      yamlContent += `${project.name} (${project.code}):\n`;
      
      // 获取该项目下的所有工作项
      const projectItems = getProjectWorkItems(report, project.id);
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

  if (loading || isLoading || !user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">欢迎回来，{user.name}</h1>
        <p className="text-gray-500">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {generateStatsCards().map((stat) => (
          <div
            key={stat.id}
            className="bg-white rounded-lg shadow p-6 flex items-start space-x-4"
          >
            <div className="rounded-full p-3 bg-gray-50">
              {stat.icon}
            </div>
            <div>
              <p className="text-gray-500 text-sm">{stat.name}</p>
              <p className="text-2xl font-bold">
                {stat.value}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  {stat.unit}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 最近日报 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium">最近日报</h2>
          <Link href="/dashboard/daily-reports" className="text-sm text-blue-600 hover:text-blue-800">
            查看全部
          </Link>
        </div>
        <div className="divide-y divide-gray-200">
          {recentReports.length > 0 ? (
            recentReports.map((report) => (
              <div key={report.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="w-full">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{format(parseISO(report.date), 'yyyy-MM-dd')}</h3>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={(e) => handleCopyReport(e, report)}
                          className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors"
                          title="复制日报内容"
                        >
                          <CopyIcon className="h-4 w-4" />
                        </button>
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                          {report.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">今日工作内容</p>
                    
                    <div className="mt-3 space-y-3">
                      {getReportProjects(report).map(project => (
                        <div key={project.id} className="border-l-2 border-blue-500 pl-3">
                          <div className="text-sm font-medium text-blue-600 mb-1">
                            {project.name} ({project.code})
                          </div>
                          <ul className="space-y-1">
                            {getProjectWorkItems(report, project.id).map((item, idx) => (
                              <li key={idx} className="text-sm text-gray-500 flex items-start">
                                <span className="mr-2 text-gray-400">•</span>
                                <span>{item.content}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-gray-500">
              暂无日报记录，<Link href="/dashboard/daily-reports/new" className="text-blue-600 hover:text-blue-800">去创建一个</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}