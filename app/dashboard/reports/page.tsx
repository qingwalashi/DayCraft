"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CalendarIcon, DownloadIcon, FileTextIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, EyeIcon, CopyIcon, XIcon, PencilIcon, SparklesIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient, DailyReport, ReportItem, UserAISettings } from "@/lib/supabase/client";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getWeek, getMonth, getYear, parseISO, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { usePersistentState } from "@/lib/utils/page-persistence";

interface DailyReportData {
  date: string;
  content?: string;
  is_plan?: boolean;
}

type ReportType = "weekly" | "monthly";
type ReportStatus = "generated" | "pending" | "generating" | "not_available";

interface DailyReportStatus {
  date: string; // ISO格式日期
  hasReport: boolean;
  is_plan?: boolean; // 是否为计划日报
}

interface WeekData {
  weekNumber: number;
  year: number;
  startDate: Date;
  endDate: Date;
  formattedPeriod: string;
  reportStatus: ReportStatus;
  dailyReportStatus: DailyReportStatus[];
  generatedAt?: string;
  reportContent?: string;
}

interface MonthData {
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
  formattedPeriod: string;
  reportStatus: ReportStatus;
  dailyReportStatus: DailyReportStatus[];
  generatedAt?: string;
  reportContent?: string;
}

interface ReportPreviewProps {
  title: string;
  content: string;
  onClose: () => void;
  onSave?: (content: string) => Promise<void>;
  readOnly?: boolean;
}

// 报告预览组件
const ReportPreview: React.FC<ReportPreviewProps> = ({ title, content, onClose, onSave, readOnly = false }) => {
  const { user } = useAuth();
  const supabase = createClient();
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [aiSettings, setAiSettings] = useState<UserAISettings | null>(null);
  
  // 加载用户AI设置
  useEffect(() => {
    const loadAISettings = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from("user_ai_settings")
          .select("*")
          .eq("user_id", user.id)
          .single();
          
        if (error) {
          console.error("加载AI设置失败:", error);
          return;
        }
        
        if (data) {
          setAiSettings(data as UserAISettings);
        }
      } catch (error) {
        console.error("加载AI设置时出错:", error);
      }
    };
    
    loadAISettings();
  }, [user, supabase]);
  
  // 检查AI功能是否启用
  const isAIEnabled = useMemo(() => {
    return aiSettings?.is_enabled === true;
  }, [aiSettings]);
  
  const handleCopy = () => {
    if (textAreaRef.current) {
      textAreaRef.current.select();
      document.execCommand('copy');
      toast.success('内容已复制到剪贴板');
    }
  };
  
  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([editedContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('报告已下载');
  };

  const handleEdit = () => {
    setIsEditing(true);
  };
  
  const handleSave = async () => {
    if (!onSave) return;
    
    setIsSaving(true);
    try {
      await onSave(editedContent);
      toast.success('报告已保存');
      setIsEditing(false);
    } catch (error) {
      console.error('保存报告失败:', error);
      toast.error('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    setEditedContent(content);
    setIsEditing(false);
  };
  
  // AI润色功能
  const handlePolish = async () => {
    if (!aiSettings) {
      toast.error('未找到AI设置，请先在设置页面配置AI');
      return;
    }
    
    if (!aiSettings.api_key) {
      toast.error('未设置API密钥，请先在设置页面配置');
      return;
    }
    
    setIsPolishing(true);
    toast.info('正在使用AI润色报告...');
    
    try {
      // 准备提示词
      const reportType = title.includes('周报') ? '周报' : '月报';
      const systemPrompt = aiSettings.system_prompt || '你是一个专业的工作报告助手，负责帮助用户整理和生成日报、周报和月报。';
      
      // 替换用户提示词中的占位符
      let userPrompt = aiSettings.user_prompt || '请根据我的工作内容，生成一份专业的{report_type}。以下是我的工作记录：\n\n{report_content}';
      userPrompt = userPrompt
        .replace('{report_type}', reportType)
        .replace('{report_content}', editedContent);
      
      // 添加润色指令
      userPrompt = `请对以下${reportType}进行润色和优化，使其更加专业、条理清晰，并保持原有的工作内容不变。\n\n${editedContent}`;
      
      // 调用AI API
      const apiUrl = aiSettings.api_url || 'https://api.openai.com/v1';
      // 确保API URL以/v1结尾，然后拼接/chat/completions
      const endpoint = `${apiUrl.endsWith('/v1') ? apiUrl : `${apiUrl}/v1`}/chat/completions`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiSettings.api_key}`
        },
        body: JSON.stringify({
          model: aiSettings.model_name || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '调用AI API失败');
      }
      
      const result = await response.json();
      const polishedContent = result.choices?.[0]?.message?.content;
      
      if (polishedContent) {
        setEditedContent(polishedContent);
        toast.success('AI润色完成');
        // 自动进入编辑模式以便用户可以进一步修改
        setIsEditing(true);
      } else {
        throw new Error('未收到有效的AI响应');
      }
    } catch (error: any) {
      console.error('AI润色失败:', error);
      toast.error(`润色失败: ${error.message || '未知错误'}`);
    } finally {
      setIsPolishing(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-2 md:p-0">
      <div className="bg-white rounded-lg p-3 md:p-6 max-w-4xl w-full mx-2 md:mx-4 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-2 md:mb-4">
          <h3 className="text-sm md:text-lg font-medium text-gray-900 truncate pr-2">{title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XIcon className="h-4 w-4 md:h-5 md:w-5" />
          </button>
        </div>
        
        <div className="flex-grow overflow-auto">
          <textarea
            ref={textAreaRef}
            className={`w-full h-full min-h-[200px] md:min-h-[400px] p-2 md:p-4 border border-gray-300 rounded-md font-mono text-xs md:text-sm ${isEditing ? 'bg-white' : 'bg-gray-50'}`}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            readOnly={readOnly || !isEditing}
          />
        </div>
        
        <div className="flex flex-wrap justify-end gap-2 md:space-x-3 mt-3 md:mt-4">
          <button
            onClick={handleCopy}
            className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <CopyIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
            复制
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <DownloadIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
            下载
          </button>
          
          {!readOnly && (
            <>
              {isAIEnabled && (
              <button
                onClick={handlePolish}
                disabled={isPolishing || isEditing}
                  className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-purple-300 text-xs md:text-sm font-medium rounded-md text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50"
              >
                  <SparklesIcon className={`h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1 ${isPolishing ? 'animate-pulse' : ''}`} />
                  {isPolishing ? '润色中...' : 'AI润色'}
              </button>
              )}
              
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <XIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-transparent text-xs md:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving && <RefreshCwIcon className="animate-spin h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />}
                    {!isSaving && <CheckCircleIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />}
                    保存
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEdit}
                  className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <PencilIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                  编辑
                </button>
              )}
            </>
          )}
          
          <button
            onClick={onClose}
            className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-transparent text-xs md:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

// 面包屑组件
interface BreadcrumbsProps {
  year: number;
  month: number;
  onYearMonthChange: (year: number, month: number) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ year, month, onYearMonthChange }) => {
  return (
    <div className="flex items-center text-xs md:text-sm text-gray-500 mb-2 md:mb-4">
      <button 
        onClick={() => onYearMonthChange(year, month - 1 > 0 ? month - 1 : 12)}
        className="mr-1 md:mr-2 p-1 rounded-full hover:bg-gray-100"
        aria-label="上个月"
      >
        <ChevronLeftIcon className="h-3 w-3 md:h-4 md:w-4" />
      </button>
      <span className="font-medium text-gray-700 whitespace-nowrap">{year}年{month}月</span>
      <button 
        onClick={() => onYearMonthChange(year, month + 1 <= 12 ? month + 1 : 1)}
        className="ml-1 md:ml-2 p-1 rounded-full hover:bg-gray-100"
        aria-label="下个月"
      >
        <ChevronRightIcon className="h-3 w-3 md:h-4 md:w-4" />
      </button>
    </div>
  );
};

export default function ReportsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  
  // 替换普通状态为持久化状态
  const [activeTab, setActiveTab] = usePersistentState<ReportType>("reports-active-tab", "weekly");
  const [isLoading, setIsLoading] = useState(true);
  const [generatingReportId, setGeneratingReportId] = usePersistentState<string | null>("reports-generating-id", null);
  const [weeklyData, setWeeklyData] = usePersistentState<WeekData[]>("reports-weekly-data", []);
  const [monthlyData, setMonthlyData] = usePersistentState<MonthData[]>("reports-monthly-data", []);
  const [dailyReports, setDailyReports] = usePersistentState<DailyReportData[]>("reports-daily-reports", []);
  const [previewData, setPreviewData] = usePersistentState<{
    title: string;
    content: string;
    type: ReportType;
    period: string;
  } | null>("reports-preview-data", null);
  
  // 分页控制 - 持久化
  const [currentYear, setCurrentYear] = usePersistentState<number>("reports-current-year", new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = usePersistentState<number>("reports-current-month", new Date().getMonth() + 1);

  // 添加数据加载状态引用
  const dataLoadedRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  // 数据刷新间隔（毫秒），设置为5分钟
  const DATA_REFRESH_INTERVAL = 5 * 60 * 1000;

  // 按年月筛选的周报数据
  const filteredWeeklyData = useMemo(() => {
    return weeklyData.filter(week => {
      // 确保日期是Date对象
      const startDate = week.startDate instanceof Date ? week.startDate : new Date(week.startDate);
      const endDate = week.endDate instanceof Date ? week.endDate : new Date(week.endDate);
      
      // 获取周起始日期所在的月份
      const weekStartMonth = startDate.getMonth() + 1;
      const weekStartYear = startDate.getFullYear();
      
      // 获取周结束日期所在的月份
      const weekEndMonth = endDate.getMonth() + 1;
      const weekEndYear = endDate.getFullYear();
      
      // 如果周跨月，只要有一部分在当前选择的月份就显示
      return (
        (weekStartYear === currentYear && weekStartMonth === currentMonth) ||
        (weekEndYear === currentYear && weekEndMonth === currentMonth)
      );
    });
  }, [weeklyData, currentYear, currentMonth]);
  
  // 按年筛选的月报数据
  const filteredMonthlyData = useMemo(() => {
    return monthlyData.filter(month => {
      // 确保日期是Date对象
      const startDate = month.startDate instanceof Date ? month.startDate : new Date(month.startDate);
      return startDate.getFullYear() === currentYear;
    });
  }, [monthlyData, currentYear]);

  // 处理数据恢复，确保日期字段正确转换为Date对象
  useEffect(() => {
    if (weeklyData.length > 0) {
      const processedWeeklyData = weeklyData.map(week => ({
        ...week,
        startDate: week.startDate instanceof Date ? week.startDate : new Date(week.startDate),
        endDate: week.endDate instanceof Date ? week.endDate : new Date(week.endDate)
      }));
      
      // 只有当数据需要转换时才更新
      if (processedWeeklyData.some((week, index) => 
        !(weeklyData[index].startDate instanceof Date) || 
        !(weeklyData[index].endDate instanceof Date))) {
        setWeeklyData(processedWeeklyData);
      }
    }
    
    if (monthlyData.length > 0) {
      const processedMonthlyData = monthlyData.map(month => ({
        ...month,
        startDate: month.startDate instanceof Date ? month.startDate : new Date(month.startDate),
        endDate: month.endDate instanceof Date ? month.endDate : new Date(month.endDate)
      }));
      
      // 只有当数据需要转换时才更新
      if (processedMonthlyData.some((month, index) => 
        !(monthlyData[index].startDate instanceof Date) || 
        !(monthlyData[index].endDate instanceof Date))) {
        setMonthlyData(processedMonthlyData);
      }
    }
  }, [weeklyData, monthlyData, setWeeklyData, setMonthlyData]);

  // 处理年月切换 - 使用useCallback包装
  const handleYearMonthChange = useCallback((year: number, month: number) => {
    // 处理月份溢出
    if (month < 1) {
      setCurrentYear(year - 1);
      setCurrentMonth(12);
    } else if (month > 12) {
      setCurrentYear(year + 1);
      setCurrentMonth(1);
    } else {
      setCurrentYear(year);
      setCurrentMonth(month);
    }
  }, [setCurrentYear, setCurrentMonth]);

  // 处理年份切换（用于月报）- 使用useCallback包装
  const handleYearChange = useCallback((year: number) => {
    setCurrentYear(year);
  }, [setCurrentYear]);

  // 生成周报数据 - 使用useCallback包装
  const generateWeeklyData = useCallback((reports: DailyReportData[]) => {
    const today = new Date();
    const weeks: WeekData[] = [];
    
    // 生成最近12周的数据
    for (let i = 0; i < 12; i++) {
      const currentWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 7);
      const weekStartDate = startOfWeek(currentWeek, { locale: zhCN });
      const weekEndDate = endOfWeek(weekStartDate, { locale: zhCN });
      const weekNumber = getWeek(weekStartDate, { locale: zhCN });
      const year = getYear(weekStartDate);
      
      // 获取这一周的日报状态
      const dailyStatus: DailyReportStatus[] = [];
      
      // 生成周期内每天的日报状态
      eachDayOfInterval({ start: weekStartDate, end: weekEndDate }).forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const report = reports.find(r => r.date === dateStr && !r.is_plan);
        const planReport = reports.find(r => r.date === dateStr && r.is_plan);
        
        dailyStatus.push({
                date: dateStr,
          hasReport: !!report || !!planReport,
          is_plan: !report && !!planReport
        });
      });
      
      weeks.push({
        weekNumber,
        year,
        startDate: weekStartDate,
        endDate: weekEndDate,
        formattedPeriod: `${format(weekStartDate, 'yyyy-MM-dd')} 至 ${format(weekEndDate, 'yyyy-MM-dd')}`,
        reportStatus: 'pending',
        dailyReportStatus: dailyStatus,
      });
    }
    
    setWeeklyData(weeks);
  }, [setWeeklyData]);

  // 生成月报数据 - 使用useCallback包装
  const generateMonthlyData = useCallback((reports: DailyReportData[]) => {
    const today = new Date();
    const months: MonthData[] = [];
    
    // 生成最近24个月的数据，确保有更多历史数据
    for (let i = 0; i < 24; i++) {
      const currentMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStartDate = startOfMonth(currentMonth);
      const monthEndDate = endOfMonth(currentMonth);
      const month = getMonth(monthStartDate);
      const year = getYear(monthStartDate);
      
      // 获取这个月每天的日报状态和内容
      const dailyStatus: DailyReportStatus[] = [];
      const monthlyReportsByProject: Record<string, {projectName: string, projectCode: string, items: {date: string, content: string}[]}> = {};
      
      // 按日期降序排序这个月的日期
      const monthDates = eachDayOfInterval({ start: monthStartDate, end: monthEndDate })
        .sort((a, b) => a.getTime() - b.getTime());
      
      monthDates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const reportForDate = reports.find(report => {
          const reportDate = format(parseISO(report.date), 'yyyy-MM-dd');
          return reportDate === dateStr;
        });
        
        const hasReport = !!reportForDate;
        const isPlan = reportForDate?.is_plan || false;
        
        dailyStatus.push({ date: dateStr, hasReport, is_plan: isPlan });
        
        // 只有不是计划的日报才参与月报生成
        if (hasReport && reportForDate?.content && !isPlan) {
          // 解析内容，按项目分组
          const contentLines = reportForDate.content.split('\n');
          contentLines.forEach(line => {
            // 匹配 [项目名称 (项目编号)] 内容
            const match = line.match(/\[(.*?) \((.*?)\)\] (.*)/);
            if (match) {
              const projectName = match[1];
              const projectCode = match[2];
              const content = match[3];
              const projectKey = `${projectName}-${projectCode}`;
              
              if (!monthlyReportsByProject[projectKey]) {
                monthlyReportsByProject[projectKey] = {
                  projectName,
                  projectCode,
                  items: []
                };
              }
              
              monthlyReportsByProject[projectKey].items.push({
                date: dateStr,
                content
              });
            }
          });
        }
      });
      
      // 计算填报完整度
      const filledDays = dailyStatus.filter(day => day.hasReport).length;
      const totalWorkDays = dailyStatus.length;
      const completionRate = filledDays / totalWorkDays;
      
      // 确定报告状态
      let reportStatus: ReportStatus = "not_available";
      if (completionRate >= 0.5) {
        reportStatus = "pending"; // 一半以上工作日有日报，可以生成
      } else if (completionRate > 0) {
        reportStatus = "pending"; // 部分工作日有日报，可以生成但不完整
      }
      
      // 生成月报内容
      let reportContent = '';
      
      // 添加项目分组内容
      Object.values(monthlyReportsByProject).forEach(project => {
        reportContent += `${project.projectName}\n`;
        
        // 项目下的工作内容
        project.items.forEach(item => {
          reportContent += `- ${item.date}: ${item.content}\n`;
        });
        
        reportContent += '\n';
      });
      
      months.push({
        month: month + 1,
        year,
        startDate: monthStartDate,
        endDate: monthEndDate,
        formattedPeriod: format(monthStartDate, 'yyyy年MM月'),
        reportStatus,
        dailyReportStatus: dailyStatus,
        reportContent: reportContent.trim()
      });
    }
    
    setMonthlyData(months);
  }, [setMonthlyData]);

  // 获取已保存的周报 - 使用useCallback包装
  const fetchSavedWeeklyReports = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('week_number', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        // 更新周报数据
        setWeeklyData(prevData => {
          const updatedData = [...prevData];
          
          data.forEach((report: any) => {
            const index = updatedData.findIndex(
              week => week.year === report.year && week.weekNumber === report.week_number
            );
            
            if (index !== -1) {
              updatedData[index].reportStatus = 'generated';
              updatedData[index].reportContent = report.content as string;
              updatedData[index].generatedAt = format(new Date(report.updated_at as string), 'yyyy-MM-dd HH:mm:ss');
            }
          });
          
          return updatedData;
        });
      }
    } catch (error) {
      console.error('获取周报数据失败', error);
    }
  }, [user, supabase, setWeeklyData]);
  
  // 获取已保存的月报 - 使用useCallback包装
  const fetchSavedMonthlyReports = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        // 更新月报数据
        setMonthlyData(prevData => {
          const updatedData = [...prevData];
          
          data.forEach((report: any) => {
            const index = updatedData.findIndex(
              month => month.year === report.year && month.month === report.month
            );
            
            if (index !== -1) {
              updatedData[index].reportStatus = 'generated';
              updatedData[index].reportContent = report.content as string;
              updatedData[index].generatedAt = format(new Date(report.updated_at as string), 'yyyy-MM-dd HH:mm:ss');
            }
          });
          
          return updatedData;
        });
      }
    } catch (error) {
      console.error('获取月报数据失败', error);
    }
  }, [user, supabase, setMonthlyData]);

  // 获取日报数据 - 使用useCallback包装
  const fetchDailyReports = useCallback(async () => {
    if (!user) return;
    
    // 检查是否已加载过数据
    if (dataLoadedRef.current && dailyReports.length > 0) {
      console.log('已有日报数据，跳过重新获取');
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
    
    console.log('加载日报数据');
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select(`
          date,
          is_plan,
          report_items (
            content,
            projects:project_id (
              name, code
            )
          )
        `)
        .eq('user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      // 处理日报数据，添加内容字段
      const processedData = data?.map((report: any) => {
        return {
          date: report.date as string,
          is_plan: report.is_plan || false,
          content: report.report_items?.map((item: any) => 
            `[${item.projects?.name} (${item.projects?.code})] ${item.content}`
          ).join('\n')
        };
      }) || [];
      
      setDailyReports(processedData);
      
      // 生成周报和月报数据
      generateWeeklyData(processedData);
      generateMonthlyData(processedData);
      
      // 加载已保存的周报和月报
      await Promise.all([
        fetchSavedWeeklyReports(),
        fetchSavedMonthlyReports()
      ]);
      
      // 更新加载状态和时间戳
      dataLoadedRef.current = true;
      lastLoadTimeRef.current = now;
    } catch (error) {
      console.error('获取日报数据失败', error);
      toast.error('获取日报数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase, dailyReports.length, setDailyReports, generateWeeklyData, generateMonthlyData, fetchSavedWeeklyReports, fetchSavedMonthlyReports]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('周报月报页面恢复可见，检查数据状态');
          
          // 检查是否需要重新加载数据
          const now = Date.now();
          const timeSinceLastLoad = now - lastLoadTimeRef.current;
          
          // 如果超过刷新间隔，重新加载数据
          if (timeSinceLastLoad > DATA_REFRESH_INTERVAL) {
            console.log('数据超过刷新间隔，重新加载');
            // 重置数据加载状态
            dataLoadedRef.current = false;
            fetchDailyReports();
          } else {
            console.log('数据在刷新间隔内，保持现有数据');
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [fetchDailyReports]);

  // 初始加载数据
  useEffect(() => {
    if (user) {
      fetchDailyReports();
    }
  }, [user, fetchDailyReports]);

  // 处理报告生成
  const handleGenerateReport = async (type: ReportType, period: string) => {
    // 设置生成状态
    setGeneratingReportId(`${type}-${period}`);
    
    try {
      let content = '';
      
      if (type === 'weekly') {
        // 查找对应的周报数据
        const weekData = weeklyData.find(w => w.formattedPeriod === period);
        if (!weekData) throw new Error('未找到周报数据');
        
        // 收集该周的日报内容，过滤掉已计划的日报
        const dailyContents = dailyReports
          .filter(report => {
            const reportDate = parseISO(report.date);
            return reportDate >= weekData.startDate && reportDate <= weekData.endDate && !report.is_plan;
          })
          .map(report => {
            return {
              date: report.date,
              content: report.content || '无内容'
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));
        
        // 生成简化的周报内容
        content = '';
        
        // 按项目分组收集内容
        const projectGroups: Record<string, {projectName: string, items: {date: string, content: string}[]}> = {};
        
        dailyContents.forEach(day => {
          const contentLines = day.content.split('\n');
          contentLines.forEach(line => {
            // 匹配 [项目名称 (项目编号)] 内容
            const match = line.match(/\[(.*?) \((.*?)\)\] (.*)/);
            if (match) {
              const projectName = match[1];
              const projectKey = projectName;
              
              if (!projectGroups[projectKey]) {
                projectGroups[projectKey] = {
                  projectName,
                  items: []
                };
              }
              
              projectGroups[projectKey].items.push({
                date: day.date,
                content: match[3]
              });
            }
          });
        });
        
        // 生成YAML格式内容
        Object.values(projectGroups).forEach(project => {
          content += `${project.projectName}\n`;
          project.items.forEach(item => {
            content += `- ${item.date}: ${item.content}\n`;
          });
          content += '\n';
        });
        
        // 保存到数据库
        if (user) {
          const { data: existingReport } = await supabase
            .from('weekly_reports')
            .select('id')
            .eq('user_id', user.id)
            .eq('year', weekData.year)
            .eq('week_number', weekData.weekNumber)
            .maybeSingle();
          
          if (existingReport) {
            // 更新现有周报
            const { error: updateError } = await supabase
              .from('weekly_reports')
              .update({
                content,
                updated_at: new Date().toISOString(),
                status: 'generated'
              })
              .eq('id', existingReport.id as string);
            
            if (updateError) throw updateError;
          } else {
            // 创建新周报
            const { error: insertError } = await supabase
              .from('weekly_reports')
              .insert({
                user_id: user.id,
                year: weekData.year,
                week_number: weekData.weekNumber,
                start_date: format(weekData.startDate, 'yyyy-MM-dd'),
                end_date: format(weekData.endDate, 'yyyy-MM-dd'),
                content,
                status: 'generated'
              });
            
            if (insertError) throw insertError;
          }
        }
        
        // 更新状态
        setWeeklyData(prev => {
          return prev.map(w => {
            if (w.year === weekData.year && w.weekNumber === weekData.weekNumber) {
              return {
                ...w,
                reportStatus: 'generated',
                reportContent: content,
                generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              };
            }
            return w;
          });
        });
      } else if (type === 'monthly') {
        // 查找对应的月报数据
        const monthData = monthlyData.find(m => m.formattedPeriod === period);
        if (!monthData) throw new Error('未找到月报数据');
        
        // 收集该月的日报内容，过滤掉已计划日报
        const dailyContents = dailyReports
          .filter(report => {
            const reportDate = parseISO(report.date);
            return reportDate >= monthData.startDate && reportDate <= monthData.endDate && !report.is_plan;
          })
          .map(report => {
            return {
              date: report.date,
              content: report.content || '无内容'
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));
        
        // 生成简化的月报内容
        content = '';
        
        // 按项目分组收集内容
        const projectGroups: Record<string, {projectName: string, items: {date: string, content: string}[]}> = {};
        
        dailyContents.forEach(day => {
          const contentLines = day.content.split('\n');
          contentLines.forEach(line => {
            // 匹配 [项目名称 (项目编号)] 内容
            const match = line.match(/\[(.*?) \((.*?)\)\] (.*)/);
            if (match) {
              const projectName = match[1];
              const projectKey = projectName;
              
              if (!projectGroups[projectKey]) {
                projectGroups[projectKey] = {
                  projectName,
                  items: []
                };
              }
              
              projectGroups[projectKey].items.push({
                date: day.date,
                content: match[3]
              });
            }
          });
        });
        
        // 生成YAML格式内容
        Object.values(projectGroups).forEach(project => {
          content += `${project.projectName}\n`;
          project.items.forEach(item => {
            content += `- ${item.date}: ${item.content}\n`;
          });
          content += '\n';
        });
        
        // 保存到数据库
        if (user) {
          const { data: existingReport } = await supabase
            .from('monthly_reports')
            .select('id')
            .eq('user_id', user.id)
            .eq('year', monthData.year)
            .eq('month', monthData.month)
            .maybeSingle();
          
          if (existingReport) {
            // 更新现有月报
            const { error: updateError } = await supabase
              .from('monthly_reports')
              .update({
                content,
                updated_at: new Date().toISOString(),
                status: 'generated'
              })
              .eq('id', existingReport.id as string);
            
            if (updateError) throw updateError;
          } else {
            // 创建新月报
            const { error: insertError } = await supabase
              .from('monthly_reports')
              .insert({
                user_id: user.id,
                year: monthData.year,
                month: monthData.month,
                start_date: format(monthData.startDate, 'yyyy-MM-dd'),
                end_date: format(monthData.endDate, 'yyyy-MM-dd'),
                content,
                status: 'generated'
              });
            
            if (insertError) throw insertError;
          }
        }
        
        // 更新状态
        setMonthlyData(prev => {
          return prev.map(m => {
            if (m.year === monthData.year && m.month === monthData.month) {
              return {
                ...m,
                reportStatus: 'generated',
                reportContent: content,
                generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              };
            }
            return m;
          });
        });
      }
      
      // 显示成功消息
      toast.success(`${type === 'weekly' ? '周报' : '月报'}生成成功`);
      
      // 移除自动打开预览
      // handlePreviewReport(type, period);
    } catch (error: any) {
      console.error('生成报告失败', error);
      toast.error(`生成失败: ${error.message || '未知错误'}`);
    } finally {
      setGeneratingReportId(null);
    }
  };

  // 处理预览报告
  const handlePreviewReport = (type: ReportType, period: string) => {
    if (type === 'weekly') {
      const week = weeklyData.find(w => w.formattedPeriod === period);
      if (week && week.reportContent) {
        setPreviewData({
          title: `周报`,
          content: week.reportContent,
          type: 'weekly',
          period: period
        });
      }
    } else {
      const month = monthlyData.find(m => m.formattedPeriod === period);
      if (month && month.reportContent) {
        setPreviewData({
          title: `月报`,
          content: month.reportContent,
          type: 'monthly',
          period: period
        });
      }
    }
  };

  // 保存编辑后的报告
  const handleSaveReport = async (content: string) => {
    if (!previewData || !user) return;
    
    try {
      if (previewData.type === 'weekly') {
        const week = weeklyData.find(w => w.formattedPeriod === previewData.period);
        if (!week) throw new Error('未找到对应周报');
        
        // 检查是否已存在该周报
        const { data: existingReport, error: checkError } = await supabase
          .from('weekly_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('year', week.year)
          .eq('week_number', week.weekNumber)
          .single();
        
        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 是"未找到结果"错误
          throw checkError;
        }
        
        if (existingReport) {
          // 更新现有周报
          const { error: updateError } = await supabase
            .from('weekly_reports')
            .update({
              content: content,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingReport.id as string);
          
          if (updateError) throw updateError;
        } else {
          // 创建新周报
          const { error: insertError } = await supabase
            .from('weekly_reports')
            .insert({
              user_id: user.id,
              year: week.year,
              week_number: week.weekNumber,
              start_date: format(week.startDate, 'yyyy-MM-dd'),
              end_date: format(week.endDate, 'yyyy-MM-dd'),
              content: content,
              status: 'generated'
            });
          
          if (insertError) throw insertError;
        }
        
        // 更新本地数据
        setWeeklyData(prev => prev.map(w => 
          w.formattedPeriod === previewData.period 
            ? { 
                ...w, 
                reportContent: content,
                reportStatus: 'generated',
                generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              } 
            : w
        ));
      } else {
        const month = monthlyData.find(m => m.formattedPeriod === previewData.period);
        if (!month) throw new Error('未找到对应月报');
        
        // 检查是否已存在该月报
        const { data: existingReport, error: checkError } = await supabase
          .from('monthly_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('year', month.year)
          .eq('month', month.month)
          .single();
        
        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 是"未找到结果"错误
          throw checkError;
        }
        
        if (existingReport) {
          // 更新现有月报
          const { error: updateError } = await supabase
            .from('monthly_reports')
            .update({
              content: content,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingReport.id as string);
          
          if (updateError) throw updateError;
        } else {
          // 创建新月报
          const { error: insertError } = await supabase
            .from('monthly_reports')
            .insert({
              user_id: user.id,
              year: month.year,
              month: month.month,
              start_date: format(month.startDate, 'yyyy-MM-dd'),
              end_date: format(month.endDate, 'yyyy-MM-dd'),
              content: content,
              status: 'generated'
            });
          
          if (insertError) throw insertError;
        }
        
        // 更新本地数据
        setMonthlyData(prev => prev.map(m => 
          m.formattedPeriod === previewData.period 
            ? { 
                ...m, 
                reportContent: content,
                reportStatus: 'generated',
                generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              } 
            : m
        ));
      }
    } catch (error) {
      console.error('保存报告失败:', error);
      throw error;
    }
  };

  // 关闭预览
  const handleClosePreview = () => {
    setPreviewData(null);
  };

  // 渲染日报状态指示器
  const renderDailyStatusIndicators = (dailyStatus: DailyReportStatus[]) => {
    return (
      <div className="flex space-x-1">
        {dailyStatus.map((day, index) => {
          const date = parseISO(day.date);
          const dayOfWeek = date.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          // 已计划的日报使用蓝色
          let bgColor = day.is_plan 
            ? 'bg-blue-500'
            : day.hasReport 
              ? 'bg-green-500' 
              : 'bg-gray-200';
          
          if (isWeekend) {
            bgColor = day.is_plan 
              ? 'bg-blue-400'
              : day.hasReport 
                ? 'bg-green-400' 
                : 'bg-gray-100';
          }
          
          // 设置提示文本
          let statusText = day.hasReport ? '已填报' : '未填报';
          if (day.is_plan) {
            statusText = '已计划';
          }
          
          return (
            <div 
              key={index}
              className={`w-3 h-3 rounded-sm ${bgColor}`}
              title={`${day.date}${isWeekend ? ' (周末)' : ''}: ${statusText}`}
            />
          );
        })}
      </div>
    );
  };

  // 渲染报告状态
  const renderReportStatus = (status: ReportStatus) => {
    switch (status) {
      case 'generated':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            已生成
          </span>
        );
      case 'generating':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            <RefreshCwIcon className="h-3 w-3 mr-1 animate-spin" />
            生成中
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            <AlertCircleIcon className="h-3 w-3 mr-1" />
            可生成
          </span>
        );
      case 'not_available':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            <XCircleIcon className="h-3 w-3 mr-1" />
            无法生成
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold">周报月报</h1>
      </div>

      {/* 切换标签 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 md:space-x-8">
          <button
            onClick={() => setActiveTab("weekly")}
            className={`py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm ${
              activeTab === "weekly"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            周报
          </button>
          <button
            onClick={() => setActiveTab("monthly")}
            className={`py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm ${
              activeTab === "monthly"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            月报
          </button>
        </nav>
      </div>

      {/* 报告列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 md:px-4 py-3 md:py-5 sm:px-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-base md:text-lg font-medium">
            {activeTab === "weekly" ? "周报列表" : "月报列表"}
          </h2>
            {activeTab === "weekly" ? (
              <Breadcrumbs 
                year={currentYear}
                month={currentMonth}
                onYearMonthChange={handleYearMonthChange}
              />
            ) : (
              <div className="flex items-center text-xs md:text-sm text-gray-500 mb-2 md:mb-4">
                <button 
                  onClick={() => handleYearChange(currentYear - 1)}
                  className="mr-1 md:mr-2 p-1 rounded-full hover:bg-gray-100"
                  aria-label="上一年"
                >
                  <ChevronLeftIcon className="h-3 w-3 md:h-4 md:w-4" />
                </button>
                <span className="font-medium text-gray-700">{currentYear}年</span>
                <button 
                  onClick={() => handleYearChange(currentYear + 1)}
                  className="ml-1 md:ml-2 p-1 rounded-full hover:bg-gray-100"
                  aria-label="下一年"
                >
                  <ChevronRightIcon className="h-3 w-3 md:h-4 md:w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center p-6 md:p-12">
            <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm md:text-base text-gray-500">加载中...</span>
          </div>
        ) : (
          <div>
            {activeTab === "weekly" ? (
              <ul className="divide-y divide-gray-200">
                {filteredWeeklyData.length > 0 ? (
                  filteredWeeklyData.map((week) => (
                    <li key={`${week.year}-${week.weekNumber}`} className="p-3 md:p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start flex-grow">
                          <div className="flex-shrink-0">
                            <FileTextIcon className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                          </div>
                          <div className="ml-3 md:ml-4 flex-grow">
                            <div className="flex flex-wrap items-center gap-1 md:gap-2 justify-between w-full">
                              <div className="flex items-center gap-1 md:gap-2">
                                <h3 className="text-sm md:text-base font-medium">{week.year}年第{week.weekNumber}周</h3>
                              {renderReportStatus(week.reportStatus)}
                            </div>
                              <div className="flex items-center space-x-1 md:space-x-2">
                          {week.reportStatus === "generated" && (
                            <button
                              onClick={() => handlePreviewReport("weekly", week.formattedPeriod)}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                            >
                                    <EyeIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                              预览
                            </button>
                          )}
                          {(week.reportStatus === "pending" || week.reportStatus === "generated") && (
                            <button
                              onClick={() => handleGenerateReport("weekly", week.formattedPeriod)}
                              disabled={generatingReportId === `weekly-${week.formattedPeriod}`}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                            >
                                    <RefreshCwIcon className={`h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1 ${generatingReportId === `weekly-${week.formattedPeriod}` ? 'animate-spin' : ''}`} />
                                    <span className="hidden md:inline">{generatingReportId === `weekly-${week.formattedPeriod}` ? '生成中...' : '生成周报'}</span>
                                    <span className="inline md:hidden">{generatingReportId === `weekly-${week.formattedPeriod}` ? '生成中' : '生成'}</span>
                            </button>
                          )}
                              </div>
                            </div>
                            <div className="mt-0.5 md:mt-1 flex items-center text-xs md:text-sm text-gray-500">
                              <CalendarIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                              <span>{week.formattedPeriod}</span>
                            </div>
                            <div className="mt-1 md:mt-2">
                              {renderDailyStatusIndicators(week.dailyReportStatus)}
                            </div>
                            {week.generatedAt && (
                              <p className="mt-0.5 md:mt-1 text-xs text-gray-500">
                                生成于 {week.generatedAt}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="p-3 md:p-4 text-center text-xs md:text-sm text-gray-500">
                    {currentYear}年第{currentMonth}月暂无周报记录
                  </li>
                )}
              </ul>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredMonthlyData.length > 0 ? (
                  filteredMonthlyData.map((month) => (
                    <li key={`${month.year}-${month.month}`} className="p-3 md:p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start flex-grow">
                          <div className="flex-shrink-0">
                            <FileTextIcon className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                          </div>
                          <div className="ml-3 md:ml-4 flex-grow">
                            <div className="flex flex-wrap items-center gap-1 md:gap-2 justify-between w-full">
                              <div className="flex items-center gap-1 md:gap-2">
                                <h3 className="text-sm md:text-base font-medium">{month.formattedPeriod}工作月报</h3>
                              {renderReportStatus(month.reportStatus)}
                            </div>
                              <div className="flex items-center space-x-1 md:space-x-2">
                                {month.reportStatus === "generated" && (
                                  <button
                                    onClick={() => handlePreviewReport("monthly", month.formattedPeriod)}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-gray-300 text-xs md:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                  >
                                    <EyeIcon className="h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1" />
                                    预览
                                  </button>
                                )}
                                {(month.reportStatus === "pending" || month.reportStatus === "generated") && (
                                  <button
                                    onClick={() => handleGenerateReport("monthly", month.formattedPeriod)}
                                    disabled={generatingReportId === `monthly-${month.formattedPeriod}`}
                                    className="inline-flex items-center px-2 md:px-3 py-1 md:py-1.5 border border-blue-300 text-xs md:text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                                  >
                                    <RefreshCwIcon className={`h-3 w-3 md:h-4 md:w-4 mr-0.5 md:mr-1 ${generatingReportId === `monthly-${month.formattedPeriod}` ? 'animate-spin' : ''}`} />
                                    <span className="hidden md:inline">{generatingReportId === `monthly-${month.formattedPeriod}` ? '生成中...' : '生成月报'}</span>
                                    <span className="inline md:hidden">{generatingReportId === `monthly-${month.formattedPeriod}` ? '生成中' : '生成'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-0.5 md:mt-1 flex items-center text-xs md:text-sm text-gray-500">
                              <CalendarIcon className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                              <span>{format(month.startDate, 'yyyy-MM-dd')} 至 {format(month.endDate, 'yyyy-MM-dd')}</span>
                            </div>
                            <div className="mt-1 md:mt-2">
                              <div className="flex flex-wrap gap-0.5 md:gap-1 max-w-md">
                                {month.dailyReportStatus.map((day, index) => {
                                  const date = parseISO(day.date);
                                  const dayOfWeek = date.getDay();
                                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                  
                                  // 已计划的日报使用蓝色
                                  let bgColor = day.is_plan 
                                    ? 'bg-blue-500'
                                    : day.hasReport 
                                      ? 'bg-green-500' 
                                      : 'bg-gray-200';
                                  
                                  if (isWeekend) {
                                    bgColor = day.is_plan 
                                      ? 'bg-blue-400'
                                      : day.hasReport 
                                        ? 'bg-green-400' 
                                        : 'bg-gray-100';
                                  }
                                  
                                  // 设置提示文本
                                  let statusText = day.hasReport ? '已填报' : '未填报';
                                  if (day.is_plan) {
                                    statusText = '已计划';
                                  }
                                  
                                  return (
                                    <div 
                                      key={day.date + '-' + index}
                                      className={`w-2 h-2 md:w-3 md:h-3 rounded-sm ${bgColor}`}
                                      title={`${day.date}${isWeekend ? ' (周末)' : ''}: ${statusText}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            {month.generatedAt && (
                              <p className="mt-0.5 md:mt-1 text-xs text-gray-500">
                                生成于 {month.generatedAt}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="p-3 md:p-4 text-center text-xs md:text-sm text-gray-500">
                    {currentYear}年暂无月报记录
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      
      {/* 报告预览模态框 */}
      {previewData && (
        <ReportPreview 
          title={previewData.title}
          content={previewData.content}
          onClose={handleClosePreview}
          onSave={handleSaveReport}
        />
      )}
    </div>
  );
}