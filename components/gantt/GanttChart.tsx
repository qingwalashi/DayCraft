"use client";

import { useState, useEffect, useRef, useCallback, WheelEvent } from "react";
import { format, addDays, startOfDay, differenceInDays, isWithinInterval, isSameDay, parseISO, startOfWeek, startOfMonth, startOfYear, addWeeks, addMonths, addYears, getWeek, getMonth, getYear } from "date-fns";
import { zhCN } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Calendar, Clock, X, ZoomIn, ZoomOut, User, Tag, FileText, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { getStatusBadgeClass } from '@/lib/utils/status-colors';

// 修复GanttItem接口定义
interface GanttItem {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  startDate: string | null;
  endDate: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  progress: number;
  status?: string;
  description?: string;
  tags?: string;
  members?: string;
  progress_notes?: string;
}

interface GanttChartProps {
  data: GanttItem[];
  projectName: string;
  onUpdateItem?: (item: GanttItem) => Promise<boolean>;
}

// 日期视图模式类型
type DateViewMode = 'day' | 'week' | 'month' | 'year';

const GanttChart = ({ data, projectName, onUpdateItem }: GanttChartProps) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [visibleItems, setVisibleItems] = useState<GanttItem[]>([]);
  const [timeScale, setTimeScale] = useState<Date[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 30));
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'planned' | 'actual'>('planned');
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 新增状态
  const [dateViewMode, setDateViewMode] = useState<DateViewMode>('day');
  const [columnWidth, setColumnWidth] = useState<number>(40);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [expandLevel, setExpandLevel] = useState<number>(4); // 默认展开所有层级
  
  // 添加工作项列宽度状态
  const [itemColumnWidth, setItemColumnWidth] = useState<number>(256); // 默认宽度16rem = 256px
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [startX, setStartX] = useState<number>(0);
  const [startWidth, setStartWidth] = useState<number>(0);
  
  // 从localStorage读取视图模式
  useEffect(() => {
    // 读取视图模式（计划/实际）
    const savedViewMode = localStorage.getItem('gantt_view_mode');
    if (savedViewMode === 'actual' || savedViewMode === 'planned') {
      setViewMode(savedViewMode);
    }
    
    // 读取日期视图模式
    const savedDateViewMode = localStorage.getItem('gantt_date_view_mode');
    if (savedDateViewMode === 'day' || savedDateViewMode === 'week' || 
        savedDateViewMode === 'month' || savedDateViewMode === 'year') {
      setDateViewMode(savedDateViewMode as DateViewMode);
      
      // 设置相应的缩放级别
      switch (savedDateViewMode) {
        case 'day':
          setZoomLevel(1.5);
          setColumnWidth(60);
          break;
        case 'week':
          setZoomLevel(1);
          setColumnWidth(40);
          break;
        case 'month':
          setZoomLevel(0.8);
          setColumnWidth(32);
          break;
        case 'year':
          setZoomLevel(0.6);
          setColumnWidth(24);
          break;
      }
    }
  }, []);
  
  // 处理数据，构建树形结构
  useEffect(() => {
    if (!data || data.length === 0) return;

    // 初始化所有项为展开状态，根据当前展开级别设置
    const initialExpandedState: Record<string, boolean> = {};
    
    // 创建ID到项目的映射
    const itemMap: Record<string, GanttItem & { children: string[] }> = {};
    data.forEach(item => {
      itemMap[item.id] = { ...item, children: [] };
    });

    // 构建父子关系
    data.forEach(item => {
      if (item.parentId && itemMap[item.parentId]) {
        itemMap[item.parentId].children.push(item.id);
      }
    });

    // 根据层级设置展开状态
    const setExpandStateByLevel = (items: GanttItem[], currentLevel: number = 0) => {
      items.forEach(item => {
        // 如果当前层级小于展开级别，则展开
        initialExpandedState[item.id] = currentLevel < expandLevel;
        
        // 处理子项
        if (itemMap[item.id]?.children.length > 0) {
          const children = itemMap[item.id].children.map(childId => itemMap[childId]);
          setExpandStateByLevel(children, currentLevel + 1);
        }
      });
    };

    // 获取顶级项目
    const rootItems = data.filter(item => !item.parentId);
    setExpandStateByLevel(rootItems);
    
    setExpandedItems(initialExpandedState);

    // 找出所有日期范围
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    data.forEach(item => {
      if (item.startDate) {
        const start = parseISO(item.startDate);
        if (!minDate || start < minDate) minDate = start;
      }
      
      if (item.endDate) {
        const end = parseISO(item.endDate);
        if (!maxDate || end > maxDate) maxDate = end;
      }
      
      // 考虑实际日期
      if (item.actualStartDate) {
        const actualStart = parseISO(item.actualStartDate);
        if (!minDate || actualStart < minDate) minDate = actualStart;
      }
      
      if (item.actualEndDate) {
        const actualEnd = parseISO(item.actualEndDate);
        if (!maxDate || actualEnd > maxDate) maxDate = actualEnd;
      }
    });
    
    // 如果没有任何有效日期，设置一个默认的日期范围用于显示空的甘特图
    if (!minDate || !maxDate) {
      const today = new Date();
      setStartDate(startOfDay(today));
      setEndDate(startOfDay(addDays(today, 30)));
      return;
    }
    
    // 确保至少有30天的范围
    if (differenceInDays(maxDate, minDate) < 30) {
      maxDate = addDays(minDate, 30);
    }
    
    // 设置日期范围
    setStartDate(startOfDay(minDate));
    setEndDate(startOfDay(addDays(maxDate, 1)));
    
  }, [data, expandLevel]);

  // 生成时间刻度 - 修改为支持不同视图模式
  useEffect(() => {
    const scale: Date[] = [];
    let current = startDate;
    
    switch (dateViewMode) {
      case 'day':
        while (current <= endDate) {
          scale.push(current);
          current = addDays(current, 1);
        }
        break;
      case 'week':
        current = startOfWeek(current, { weekStartsOn: 1 }); // 从周一开始
        while (current <= endDate) {
          scale.push(current);
          current = addWeeks(current, 1);
        }
        break;
      case 'month':
        current = startOfMonth(current);
        while (current <= endDate) {
          scale.push(current);
          current = addMonths(current, 1);
        }
        break;
      case 'year':
        current = startOfYear(current);
        while (current <= endDate) {
          scale.push(current);
          current = addYears(current, 1);
        }
        break;
    }
    
    setTimeScale(scale);
  }, [startDate, endDate, dateViewMode]);

  // 计算可见的项目
  useEffect(() => {
    if (!data || data.length === 0) return;

    const buildVisibleItems = () => {
      // 创建ID到项目的映射
      const itemMap: Record<string, GanttItem & { children: string[] }> = {};
      data.forEach(item => {
        itemMap[item.id] = { ...item, children: [] };
      });

      // 构建父子关系
      data.forEach(item => {
        if (item.parentId && itemMap[item.parentId]) {
          itemMap[item.parentId].children.push(item.id);
        }
      });

      // 获取顶级项目
      const rootItems = data.filter(item => !item.parentId);

      // 递归构建可见项目列表
      const visible: GanttItem[] = [];
      
      const addVisibleItems = (items: GanttItem[], level = 0) => {
        items.forEach(item => {
          visible.push({ ...item, level });
          
          // 如果该项是展开的，添加其子项
          if (expandedItems[item.id] && itemMap[item.id].children.length > 0) {
            const children = itemMap[item.id].children.map(childId => itemMap[childId]);
            addVisibleItems(children, level + 1);
          }
        });
      };
      
      addVisibleItems(rootItems);
      return visible;
    };

    setVisibleItems(buildVisibleItems());
  }, [data, expandedItems]);

  // 切换项目展开/折叠状态
  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // 计算任务条的位置和宽度 - 修改以适应不同的视图模式
  const getBarPosition = (item: GanttItem) => {
    // 如果没有开始或结束日期，返回null
    if (!item.startDate || !item.endDate) return null;
    
    const start = parseISO(item.startDate);
    const end = parseISO(item.endDate);
    
    let startPos = 0;
    let duration = 0;
    
    switch (dateViewMode) {
      case 'day':
        startPos = differenceInDays(start, startDate);
        duration = differenceInDays(end, start) + 1; // 包含开始和结束日
        break;
      case 'week':
        const startWeekStart = startOfWeek(startDate, { weekStartsOn: 1 });
        const itemWeekStart = startOfWeek(start, { weekStartsOn: 1 });
        startPos = Math.floor(differenceInDays(itemWeekStart, startWeekStart) / 7);
        duration = Math.ceil((differenceInDays(end, start) + 1) / 7);
        break;
      case 'month':
        startPos = (getYear(start) - getYear(startDate)) * 12 + getMonth(start) - getMonth(startDate);
        const endMonth = (getYear(end) - getYear(startDate)) * 12 + getMonth(end) - getMonth(startDate);
        duration = endMonth - startPos + 1;
        break;
      case 'year':
        startPos = getYear(start) - getYear(startDate);
        duration = getYear(end) - getYear(start) + 1;
        break;
    }
    
    return {
      left: `${startPos * columnWidth}px`,
      width: `${duration * columnWidth}px`,
    };
  };

  // 计算实际进度条的位置和宽度 - 修改以适应不同的视图模式
  const getActualBarPosition = (item: GanttItem) => {
    if (!item.actualStartDate) return null;
    
    const start = parseISO(item.actualStartDate);
    const end = item.actualEndDate ? parseISO(item.actualEndDate) : start;
    
    let startPos = 0;
    let duration = 0;
    
    switch (dateViewMode) {
      case 'day':
        startPos = differenceInDays(start, startDate);
        duration = item.actualEndDate ? differenceInDays(end, start) + 1 : 1; // 如果没有结束日期，显示1天宽度
        break;
      case 'week':
        const startWeekStart = startOfWeek(startDate, { weekStartsOn: 1 });
        const itemWeekStart = startOfWeek(start, { weekStartsOn: 1 });
        startPos = Math.floor(differenceInDays(itemWeekStart, startWeekStart) / 7);
        duration = item.actualEndDate ? Math.ceil((differenceInDays(end, start) + 1) / 7) : 1; // 如果没有结束日期，显示1周宽度
        break;
      case 'month':
        startPos = (getYear(start) - getYear(startDate)) * 12 + getMonth(start) - getMonth(startDate);
        if (item.actualEndDate) {
        const endMonth = (getYear(end) - getYear(startDate)) * 12 + getMonth(end) - getMonth(startDate);
        duration = endMonth - startPos + 1;
        } else {
          duration = 1; // 如果没有结束日期，显示1个月宽度
        }
        break;
      case 'year':
        startPos = getYear(start) - getYear(startDate);
        duration = item.actualEndDate ? getYear(end) - getYear(start) + 1 : 1; // 如果没有结束日期，显示1年宽度
        break;
    }
    
    return {
      left: `${startPos * columnWidth}px`,
      width: `${duration * columnWidth}px`,
    };
  };

  // 判断日期是否为今天
  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };

  // 获取日期单元格的样式类
  const getDateCellClass = (date: Date, index: number) => {
    const classes = ['flex-shrink-0', 'border-r', 'border-gray-200'];
    
    // 添加今天的高亮样式
    if (isToday(date)) {
      classes.push('bg-blue-50', 'text-blue-600');
    } 
    // 添加交替背景色
    else if (index % 2 === 0) {
      classes.push('bg-gray-50/30');
    }
    
    return classes.join(' ');
  };

  // 获取工作项状态标签
  const getStatusBadge = (item: GanttItem) => {
    const status = item.status || '未开始';
    const badgeClass = getStatusBadgeClass(status);
    return (
      <span className={`ml-1 px-1.5 py-0.5 border text-xs rounded-full whitespace-nowrap ${badgeClass}`}>
        {status}
      </span>
    );
  };

  // 解析标签字符串为数组
  const parseTags = (tagsString?: string): string[] => {
    if (!tagsString) return [];
    return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  };

  // 解析成员字符串为数组
  const parseMembers = (membersString?: string): string[] => {
    if (!membersString) return [];
    return membersString.split(',').map(member => member.trim()).filter(member => member.length > 0);
  };

  // 格式化日期显示
  const formatDisplayDate = (dateString?: string | null): string => {
    if (!dateString) return '未设置';
    try {
      const date = parseISO(dateString);
      return format(date, 'yyyy年MM月dd日', { locale: zhCN });
    } catch {
      return '日期格式错误';
    }
  };

  // 处理工作项点击事件
  const handleItemClick = (item: GanttItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  // 格式化日期显示 - 使用中文格式
  const formatDateHeader = (date: Date) => {
    switch (dateViewMode) {
      case 'day':
        return (
          <>
            <div>{format(date, 'MM月dd日', { locale: zhCN })}</div>
            <div>{format(date, 'EEE', { locale: zhCN })}</div>
          </>
        );
      case 'week':
        return (
          <>
            <div>{format(date, 'yyyy年', { locale: zhCN })}</div>
            <div>{`第${getWeek(date, { weekStartsOn: 1 })}周`}</div>
          </>
        );
      case 'month':
        return format(date, 'yyyy年MM月', { locale: zhCN });
      case 'year':
        return format(date, 'yyyy年', { locale: zhCN });
    }
  };

  // 切换日期视图模式
  const changeDateViewMode = (mode: DateViewMode) => {
    setDateViewMode(mode);
    
    // 保存视图模式到localStorage
    localStorage.setItem('gantt_date_view_mode', mode);
    
    // 根据视图模式调整缩放级别
    switch (mode) {
      case 'day':
        setZoomLevel(1.5);
        setColumnWidth(60);
        break;
      case 'week':
        setZoomLevel(1);
        setColumnWidth(40);
        break;
      case 'month':
        setZoomLevel(0.8);
        setColumnWidth(32);
        break;
      case 'year':
        setZoomLevel(0.6);
        setColumnWidth(24);
        break;
    }
  };

  // 处理滚动事件，控制只能垂直滚动，水平滚动需要拖动
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop += e.deltaY;
    }
  };

  // 处理水平滚动事件
  const handleHorizontalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    if (containerRef.current) {
      containerRef.current.scrollLeft = scrollLeft;
    }
    
    // 同步其他甘特图内容区域的滚动位置
    const contentElements = document.querySelectorAll('.gantt-content-scroll');
    contentElements.forEach(el => {
      if (el instanceof HTMLElement && el !== e.currentTarget) {
        el.scrollLeft = scrollLeft;
      }
    });
  };

  // 获取时间表头高度
  const getTimeHeaderHeight = () => {
    switch (dateViewMode) {
      case 'day':
        return 96; // 4层: 年月周日 (24px * 4)
      case 'week':
        return 72; // 3层: 年月周 (24px * 3)
      case 'month':
        return 48; // 2层: 年月 (24px * 2)
      case 'year':
        return 24; // 1层: 年 (24px * 1)
      default:
        return 96;
    }
  };

  // 处理展开层级变化
  const handleExpandLevelChange = (level: number) => {
    setExpandLevel(level);
    
    // 更新所有工作项的展开状态
    const updateExpandState = (items: GanttItem[], currentLevel: number = 0): void => {
      items.forEach(item => {
        // 如果当前层级小于展开级别，则展开
        setExpandedItems(prev => ({
          ...prev,
          [item.id]: currentLevel < level
        }));
        
        // 处理子项
        const children = data.filter(child => child.parentId === item.id);
        if (children.length > 0) {
          updateExpandState(children, currentLevel + 1);
        }
      });
    };
    
    // 获取顶级项目
    const rootItems = data.filter(item => !item.parentId);
    updateExpandState(rootItems);
  };

  // 处理拖动开始事件
  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(itemColumnWidth);
    document.body.classList.add('resizing');
  };
  
  // 处理拖动移动事件
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(160, Math.min(500, startWidth + (e.clientX - startX)));
    setItemColumnWidth(newWidth);
  }, [isResizing, startWidth, startX]);

  // 处理拖动结束事件
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    document.body.classList.remove('resizing');
  }, []);
  
  // 使用useEffect处理拖动事件
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.classList.remove('resizing');
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 视图切换标签 */}
      <div className="flex border-b border-gray-200">
        <button
          className={`px-4 py-2 font-medium text-sm ${
            viewMode === 'planned' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
          onClick={() => {
            setViewMode('planned');
            localStorage.setItem('gantt_view_mode', 'planned');
          }}
        >
          进度计划
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm ${
            viewMode === 'actual' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
          onClick={() => {
            setViewMode('actual');
            localStorage.setItem('gantt_view_mode', 'actual');
          }}
        >
          实际进度
        </button>
        
        {/* 日期视图模式切换 */}
        <div className="ml-auto flex items-center mr-4 space-x-2">
          {/* 展开层级控制 */}
          <select
            value={expandLevel}
            onChange={(e) => handleExpandLevelChange(parseInt(e.target.value))}
            className="mr-4 px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700"
          >
            <option value="0">仅展开1级</option>
            <option value="1">展开到2级</option>
            <option value="2">展开到3级</option>
            <option value="3">展开到4级</option>
            <option value="4">展开全部</option>
          </select>

          <button
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'day' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('day')}
          >
            日
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'week' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('week')}
          >
            周
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'month' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('month')}
          >
            月
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'year' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('year')}
          >
            年
          </button>
          
          <div className="flex items-center border-l border-gray-200 pl-2">
            <button 
              className="p-1 text-gray-500 hover:text-gray-700"
              onClick={() => {
                const newZoomLevel = Math.max(0.5, zoomLevel - 0.2);
                setZoomLevel(newZoomLevel);
                setColumnWidth(40 * newZoomLevel);
                
                // 根据缩放级别自动切换日期视图模式
                if (newZoomLevel < 0.7 && dateViewMode !== 'year') {
                  setDateViewMode('year');
                } else if (newZoomLevel < 1 && newZoomLevel >= 0.7 && dateViewMode !== 'month') {
                  setDateViewMode('month');
                } else if (newZoomLevel < 1.5 && newZoomLevel >= 1 && dateViewMode !== 'week') {
                  setDateViewMode('week');
                } else if (newZoomLevel >= 1.5 && dateViewMode !== 'day') {
                  setDateViewMode('day');
                }
              }}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="mx-1 text-xs text-gray-500">{Math.round(zoomLevel * 100)}%</span>
            <button 
              className="p-1 text-gray-500 hover:text-gray-700"
              onClick={() => {
                const newZoomLevel = Math.min(3, zoomLevel + 0.2);
                setZoomLevel(newZoomLevel);
                setColumnWidth(40 * newZoomLevel);
                
                // 根据缩放级别自动切换日期视图模式
                if (newZoomLevel < 0.7 && dateViewMode !== 'year') {
                  setDateViewMode('year');
                } else if (newZoomLevel < 1 && newZoomLevel >= 0.7 && dateViewMode !== 'month') {
                  setDateViewMode('month');
                } else if (newZoomLevel < 1.5 && newZoomLevel >= 1 && dateViewMode !== 'week') {
                  setDateViewMode('week');
                } else if (newZoomLevel >= 1.5 && dateViewMode !== 'day') {
                  setDateViewMode('day');
                }
              }}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {/* 表头区域 */}
        <div className="flex">
          {/* 左侧工作项表头 */}
          <div 
            className="flex-shrink-0 bg-gray-100 border-b border-r border-gray-200 relative"
            style={{ width: `${itemColumnWidth}px` }}
          >
            <div className="font-medium text-sm text-gray-600 flex items-center justify-center" 
                style={{ height: `${getTimeHeaderHeight()}px` }}>
              工作项
            </div>
            
            {/* 添加拖动调整宽度的分隔线 */}
            <div 
              className="absolute top-0 right-0 w-1 h-full bg-gray-300 hover:bg-blue-500 cursor-col-resize z-50"
              onMouseDown={handleResizeStart}
            ></div>
          </div>
          
          {/* 右侧时间表头 - 固定在顶部，与甘特图内容同步水平滚动 */}
          <div className="flex-1 overflow-hidden">
            <div 
              className="bg-gray-100 border-b border-gray-200 overflow-hidden"
              ref={containerRef}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div style={{ width: `${timeScale.length * columnWidth}px` }}>
                {/* 年份行 - 所有视图模式下都显示 */}
                <div className="flex border-b border-gray-200 bg-blue-50/30">
                  {timeScale.map((date, index) => {
                    const prevDate = index > 0 ? timeScale[index - 1] : null;
                    const isSameYear = prevDate && getYear(date) === getYear(prevDate);
                    
                    // 只在年份变化或第一个项目时显示年份
                    if (!isSameYear) {
                      // 计算同年的单元格数量
                      let sameYearCount = 1;
                      for (let i = index + 1; i < timeScale.length; i++) {
                        if (getYear(timeScale[i]) === getYear(date)) {
                          sameYearCount++;
                        } else {
                          break;
                        }
                      }
                      
                      // 确保年份有足够宽度显示完整文字
                      const minYearWidth = dateViewMode === 'year' ? 80 : 60;
                      const yearWidth = Math.max(minYearWidth, columnWidth * sameYearCount);
                      
                      return (
                        <div
                          key={`year-${index}`}
                          className="flex-shrink-0 py-1 text-xs font-medium text-center border-r border-gray-200 whitespace-nowrap overflow-hidden"
                          style={{ 
                            width: `${yearWidth}px`,
                            height: '24px'
                          }}
                        >
                          {format(date, 'yyyy年', { locale: zhCN })}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                
                {/* 月份行 - 天/周/月视图模式下显示 */}
                {dateViewMode !== 'year' && (
                <div className="flex border-b border-gray-200 bg-green-50/30">
                  {timeScale.map((date, index) => {
                    const prevDate = index > 0 ? timeScale[index - 1] : null;
                    const isSameMonth = prevDate && 
                                       getYear(date) === getYear(prevDate) && 
                                       getMonth(date) === getMonth(prevDate);
                    
                    // 只在月份变化或第一个项目时显示月份
                    if (!isSameMonth) {
                      // 计算同月的单元格数量
                      let sameMonthCount = 1;
                      for (let i = index + 1; i < timeScale.length; i++) {
                        if (getYear(timeScale[i]) === getYear(date) && 
                            getMonth(timeScale[i]) === getMonth(date)) {
                          sameMonthCount++;
                        } else {
                          break;
                        }
                      }
                      
                      // 确保月份有足够宽度显示完整文字
                      const minMonthWidth = 60;
                      const monthWidth = Math.max(minMonthWidth, columnWidth * sameMonthCount);
                      
                      return (
                        <div
                          key={`month-${index}`}
                          className="flex-shrink-0 py-1 text-xs font-medium text-center border-r border-gray-200 whitespace-nowrap overflow-hidden"
                          style={{ 
                            width: `${monthWidth}px`,
                            height: '24px'
                          }}
                        >
                          {format(date, 'MM月', { locale: zhCN })}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                )}
                
                {/* 周行 - 天/周视图模式下显示 */}
                {(dateViewMode === 'day' || dateViewMode === 'week') && (
                <div className="flex border-b border-gray-200 bg-yellow-50/30">
                  {timeScale.map((date, index) => {
                    const prevDate = index > 0 ? timeScale[index - 1] : null;
                    const isSameWeek = prevDate && 
                                      getWeek(date, { weekStartsOn: 1 }) === getWeek(prevDate, { weekStartsOn: 1 }) &&
                                      getYear(date) === getYear(prevDate);
                    
                    // 只在周变化或第一个项目时显示周
                    if (!isSameWeek) {
                      // 计算同周的单元格数量
                      let sameWeekCount = 1;
                      for (let i = index + 1; i < timeScale.length; i++) {
                        if (getWeek(timeScale[i], { weekStartsOn: 1 }) === getWeek(date, { weekStartsOn: 1 }) &&
                            getYear(timeScale[i]) === getYear(date)) {
                          sameWeekCount++;
                        } else {
                          break;
                        }
                      }
                      
                      return (
                        <div
                          key={`week-${index}`}
                          className="flex-shrink-0 py-1 text-xs font-medium text-center border-r border-gray-200 whitespace-nowrap overflow-hidden"
                          style={{ 
                            width: `${columnWidth * sameWeekCount}px`,
                            height: '24px'
                          }}
                        >
                          {`第${getWeek(date, { weekStartsOn: 1 })}周`}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                )}
                
                {/* 日期行 - 仅在天视图模式下显示 */}
                {dateViewMode === 'day' && (
                <div className="flex bg-orange-50/30">
                  {timeScale.map((date, index) => (
                    <div 
                      key={`day-${index}`} 
                      className={`${isToday(date) ? 'bg-blue-100 text-blue-600' : index % 2 === 0 ? 'bg-gray-50/30' : ''} flex-shrink-0 border-r border-gray-200 py-1 text-xs font-medium text-center whitespace-nowrap overflow-hidden`}
                      style={{ width: `${Math.max(50, columnWidth)}px`, height: '24px' }}
                    >
                      {format(date, 'd日', { locale: zhCN })}{isToday(date) ? ' (今)' : ''}
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* 主体内容区域 - 垂直滚动 */}
        <div 
          className="flex-1 overflow-y-auto" 
          ref={scrollContainerRef}
          onWheel={handleWheel}
        >
          <div className="flex">
            {/* 左侧工作项列表 - 固定不动 */}
            <div 
              className="flex-shrink-0 bg-white sticky left-0 relative"
              style={{ width: `${itemColumnWidth}px` }}
            >
              {visibleItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center border-b border-gray-100 hover:bg-gray-50 cursor-pointer bg-white"
                  style={{ paddingLeft: `${item.level * 16 + 8}px`, height: '40px' }}
                  onClick={() => handleItemClick(item)}
                >
                  {/* 展开/折叠图标 */}
                  <div 
                    className="w-6 h-6 flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.id);
                    }}
                  >
                    {data.some(i => i.parentId === item.id) && (
                      expandedItems[item.id] ? 
                        <ChevronDown className="h-4 w-4 text-gray-500" /> : 
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex flex-1 items-center overflow-hidden pr-2">
                    <span className="text-sm truncate mr-1">{item.name}</span>
                    {getStatusBadge(item)}
                  </div>
                </div>
              ))}
              
              {/* 添加内容区域的分隔线 */}
              <div 
                className="absolute top-0 right-0 w-1 h-full bg-gray-300 hover:bg-blue-500 cursor-col-resize z-50"
                onMouseDown={handleResizeStart}
              ></div>
            </div>
            
            {/* 右侧甘特图内容 - 可水平滚动 */}
            <div className="flex-1 overflow-x-auto gantt-content-scroll" onScroll={handleHorizontalScroll} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div style={{ width: `${timeScale.length * columnWidth}px` }}>
            <div className="relative">
              {/* 今天的垂直线 */}
              {timeScale.findIndex(date => {
                switch (dateViewMode) {
                  case 'day': return isToday(date);
                  case 'week': return isWithinInterval(new Date(), { start: date, end: addWeeks(date, 1) });
                  case 'month': return getMonth(new Date()) === getMonth(date) && getYear(new Date()) === getYear(date);
                  case 'year': return getYear(new Date()) === getYear(date);
                      default: return false;
                }
              }) >= 0 && (
                <div 
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                  style={{ 
                    left: `${timeScale.findIndex(date => {
                      switch (dateViewMode) {
                        case 'day': return isToday(date);
                        case 'week': return isWithinInterval(new Date(), { start: date, end: addWeeks(date, 1) });
                        case 'month': return getMonth(new Date()) === getMonth(date) && getYear(new Date()) === getYear(date);
                        case 'year': return getYear(new Date()) === getYear(date);
                            default: return false;
                      }
                    }) * columnWidth + columnWidth / 2}px`,
                    height: `${visibleItems.length * 40}px`
                  }}
                ></div>
              )}
              
                  {/* 行和任务条 */}
                  {visibleItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex border-b border-gray-100 relative"
                  style={{ height: '40px' }}
                  onClick={() => handleItemClick(item)}
                >
                  {/* 背景网格 */}
                  {timeScale.map((date, dateIndex) => (
                    <div 
                      key={dateIndex}
                      className={`flex-shrink-0 h-full border-r border-gray-100
                        ${isToday(date) && dateViewMode === 'day' ? 'bg-blue-50/20' : dateIndex % 2 === 0 ? 'bg-gray-50/30' : ''}`}
                      style={{ width: `${columnWidth}px` }}
                    ></div>
                  ))}
                  
                      {/* 计划任务条 */}
                      {viewMode === 'planned' && getBarPosition(item) && (
                    <div 
                      className="absolute top-2 h-6 rounded-sm bg-blue-100 border border-blue-300 z-20 flex items-center px-2 cursor-pointer hover:bg-blue-200"
                      style={{
                        ...getBarPosition(item),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                    >
                          {/* 移除计划文字 */}
                    </div>
                  )}
                  
                      {/* 实际任务条 */}
                  {viewMode === 'actual' && item.actualStartDate && getActualBarPosition(item) && (
                    <div 
                      className={`absolute top-2 h-6 rounded-sm z-30 flex items-center px-2 cursor-pointer
                        ${item.actualEndDate ? 'bg-green-100 border border-green-300 hover:bg-green-200' : 'bg-yellow-100 border border-yellow-300 hover:bg-yellow-200'}`}
                      style={{
                        ...getActualBarPosition(item),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                    >
                          {/* 移除实际完成/实际进行中文字 */}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
        </div>
        
        {/* 底部水平滚动条 - 固定显示 */}
        <div className="h-6 flex border-t border-gray-200">
          <div 
            className="flex-shrink-0" 
            style={{ width: `${itemColumnWidth}px` }}
          ></div>
          <div className="flex-1 overflow-x-auto gantt-content-scroll gantt-bottom-scroll" onScroll={handleHorizontalScroll}>
            <div style={{ width: `${timeScale.length * columnWidth}px`, height: '1px' }}></div>
          </div>
        </div>
      </div>

      {/* 添加全局样式 */}
      <style jsx global>{`
        .gantt-content-scroll:not(.gantt-bottom-scroll)::-webkit-scrollbar {
          display: none;
        }
        
        .gantt-bottom-scroll::-webkit-scrollbar {
          height: 6px;
        }
        
        .gantt-bottom-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        
        .gantt-bottom-scroll::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 3px;
        }
        
        .gantt-bottom-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        
        /* 添加拖动相关样式 */
        body.resizing {
          cursor: col-resize;
          user-select: none;
        }
      `}</style>

      {/* 工作项详情对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col p-0">
          {/* 固定的标题区域 */}
          <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              {selectedItem?.name}
            </DialogTitle>
            <DialogDescription>
              工作项详细信息
            </DialogDescription>
          </DialogHeader>

          {/* 可滚动的内容区域 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              {/* 工作描述 */}
              {selectedItem?.description && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                    <FileText className="h-4 w-4 mr-1" />
                    工作描述
                  </h3>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {selectedItem.description}
                    </p>
                  </div>
                </div>
              )}

              {/* 参与人员 */}
              {selectedItem?.members && parseMembers(selectedItem.members).length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                    <User className="h-4 w-4 mr-1" />
                    参与人员
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {parseMembers(selectedItem.members).map((member, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        <User className="h-3 w-3 mr-1" />
                        {member}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 工作标签 */}
              {selectedItem?.tags && parseTags(selectedItem.tags).length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                    <Tag className="h-4 w-4 mr-1" />
                    工作标签
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {parseTags(selectedItem.tags).map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 工作进展 */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  工作进展
                </h3>
                <div className="bg-gray-50 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-600">当前状态:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedItem?.status === '已完成'
                        ? 'bg-green-100 text-green-800'
                        : selectedItem?.status === '进行中'
                        ? 'bg-blue-100 text-blue-800'
                        : selectedItem?.status === '已暂停'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {selectedItem?.status || '未开始'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 工作进展备注 */}
              {selectedItem?.progress_notes && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    工作进展备注
                  </h3>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {selectedItem.progress_notes}
                    </p>
                  </div>
                </div>
              )}

              {/* 时间信息 */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  时间信息
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 计划时间 */}
                  <div className="bg-blue-50 rounded-md p-3">
                    <h4 className="font-medium text-blue-800 mb-2">计划时间</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">开始:</span>
                        <span className="text-gray-800">{formatDisplayDate(selectedItem?.startDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">结束:</span>
                        <span className="text-gray-800">{formatDisplayDate(selectedItem?.endDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 实际时间 */}
                  <div className="bg-green-50 rounded-md p-3">
                    <h4 className="font-medium text-green-800 mb-2">实际时间</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">开始:</span>
                        <span className="text-gray-800">{formatDisplayDate(selectedItem?.actualStartDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">结束:</span>
                        <span className="text-gray-800">{formatDisplayDate(selectedItem?.actualEndDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 固定的底部按钮区域 */}
          <DialogFooter className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              onClick={() => setIsDialogOpen(false)}
            >
              关闭
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GanttChart; 