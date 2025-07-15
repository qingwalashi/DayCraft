"use client";

import { useState, useEffect, useRef, WheelEvent } from "react";
import { format, addDays, startOfDay, differenceInDays, isWithinInterval, isSameDay, parseISO, startOfWeek, startOfMonth, startOfYear, addWeeks, addMonths, addYears, getWeek, getMonth, getYear } from "date-fns";
import { zhCN } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Calendar, Clock, X, ZoomIn, ZoomOut } from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";

interface GanttItem {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  startDate: string;
  endDate: string;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  progress: number;
  status?: string;
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
  const [editForm, setEditForm] = useState({
    plannedStartDate: "",
    plannedEndDate: "",
    actualStartDate: "",
    actualEndDate: "",
    status: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'planned' | 'actual'>('planned');
  const [currentEditingViewMode, setCurrentEditingViewMode] = useState<'planned' | 'actual'>('planned');
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 新增状态
  const [dateViewMode, setDateViewMode] = useState<DateViewMode>('day');
  const [columnWidth, setColumnWidth] = useState<number>(40);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  
  // 处理数据，构建树形结构
  useEffect(() => {
    if (!data || data.length === 0) return;

    // 初始化所有项为展开状态
    const initialExpandedState: Record<string, boolean> = {};
    data.forEach(item => {
      initialExpandedState[item.id] = true;
    });
    setExpandedItems(initialExpandedState);

    // 找出所有日期范围
    let minDate = new Date();
    let maxDate = new Date();
    
    // 记录是否有任何有效日期
    let hasValidDates = false;
    
    data.forEach(item => {
      if (item.startDate) {
        const start = parseISO(item.startDate);
        if (!hasValidDates || start < minDate) minDate = start;
        hasValidDates = true;
      }
      
      if (item.endDate) {
        const end = parseISO(item.endDate);
        if (!hasValidDates || end > maxDate) maxDate = end;
        hasValidDates = true;
      }
      
      // 考虑实际日期
      if (item.actualStartDate) {
        const actualStart = parseISO(item.actualStartDate);
        if (!hasValidDates || actualStart < minDate) minDate = actualStart;
        hasValidDates = true;
      }
      
      if (item.actualEndDate) {
        const actualEnd = parseISO(item.actualEndDate);
        if (!hasValidDates || actualEnd > maxDate) maxDate = actualEnd;
        hasValidDates = true;
      }
    });
    
    // 如果没有有效日期，使用当前日期作为默认范围
    if (!hasValidDates) {
      minDate = new Date();
      maxDate = addDays(new Date(), 30);
    }
    // 确保至少有30天的范围
    else if (differenceInDays(maxDate, minDate) < 30) {
      maxDate = addDays(minDate, 30);
    }
    
    // 设置日期范围
    setStartDate(startOfDay(minDate));
    setEndDate(startOfDay(addDays(maxDate, 1)));
    
  }, [data]);

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
    const end = item.actualEndDate ? parseISO(item.actualEndDate) : new Date();
    
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

  // 判断是否为今天
  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };

  // 获取工作项状态标签
  const getStatusBadge = (item: GanttItem) => {
    // 直接使用数据库中的状态，不再根据实际起止时间推断
    if (item.status) {
      switch (item.status) {
        case '已完成':
          return <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-800 text-xs rounded-full whitespace-nowrap">已完成</span>;
        case '进行中':
          return <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full whitespace-nowrap">进行中</span>;
        case '已暂停':
          return <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full whitespace-nowrap">已暂停</span>;
        default:
          return <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-800 text-xs rounded-full whitespace-nowrap">{item.status}</span>;
      }
    } else {
      return <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-800 text-xs rounded-full whitespace-nowrap">未开始</span>;
    }
  };

  // 处理工作项点击事件
  const handleItemClick = (item: GanttItem) => {
    setSelectedItem(item);
    
    // 初始化表单数据
    const plannedStart = item.startDate ? new Date(item.startDate) : null;
    const plannedEnd = item.endDate ? new Date(item.endDate) : null;
    const actualStart = item.actualStartDate ? new Date(item.actualStartDate) : null;
    const actualEnd = item.actualEndDate ? new Date(item.actualEndDate) : null;
    
    setEditForm({
      plannedStartDate: plannedStart ? format(plannedStart, 'yyyy-MM-dd') : "",
      plannedEndDate: plannedEnd ? format(plannedEnd, 'yyyy-MM-dd') : "",
      actualStartDate: actualStart ? format(actualStart, 'yyyy-MM-dd') : "",
      actualEndDate: actualEnd ? format(actualEnd, 'yyyy-MM-dd') : "",
      status: item.status || "" // 直接使用数据库中的状态
    });
    
    // 记录当前编辑时的视图模式
    setCurrentEditingViewMode(viewMode);
    setIsDialogOpen(true);
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedItem || !onUpdateItem) return;
    
    setIsSubmitting(true);
    
    try {
      // 构建更新后的工作项 - 状态与实际起止时间完全独立
      const updatedItem: GanttItem = {
        ...selectedItem,
        startDate: editForm.plannedStartDate ? 
          `${editForm.plannedStartDate}T00:00:00` : selectedItem.startDate,
        endDate: editForm.plannedEndDate ? 
          `${editForm.plannedEndDate}T23:59:59` : selectedItem.endDate,
        actualStartDate: editForm.actualStartDate ? 
          `${editForm.actualStartDate}T00:00:00` : null,
        actualEndDate: editForm.actualEndDate ? 
          `${editForm.actualEndDate}T23:59:59` : null,
        status: editForm.status // 直接使用表单中的状态
      };
      
      // 调用更新回调
      const success = await onUpdateItem(updatedItem);
      
      if (success) {
        // 关闭对话框并保持当前视图模式
        setIsDialogOpen(false);
        // 保持在当前标签页
        setViewMode(currentEditingViewMode);
      }
    } catch (error) {
      console.error('更新工作项失败:', error);
    } finally {
      setIsSubmitting(false);
    }
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
          onClick={() => setViewMode('planned')}
        >
          进度计划
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm ${
            viewMode === 'actual' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
          onClick={() => setViewMode('actual')}
        >
          实际进度
        </button>
        
        {/* 日期视图模式切换 */}
        <div className="ml-auto flex items-center mr-4 space-x-2">
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
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* 左侧固定区域 */}
          <div className="w-64 flex-shrink-0 flex flex-col border-r border-gray-200">
            {/* 左侧工作项表头 */}
            <div className="bg-gray-100 border-b border-gray-200">
              <div className="p-3 font-medium text-sm text-gray-600 flex items-center" style={{ height: '64px' }}>
                工作项
              </div>
            </div>
            
            {/* 左侧工作项列表 */}
            <div className="flex-1 overflow-y-auto bg-white">
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
            </div>
          </div>
          
          {/* 右侧甘特图区域 - 整体水平滚动 */}
          <div className="flex-1 overflow-x-auto" ref={containerRef}>
            <div>
              {/* 右侧时间表头 - 固定在顶部 */}
              <div className="sticky top-0 z-30 bg-gray-100 border-b border-gray-200" style={{ height: '64px' }}>
                <div className="flex h-full">
                  {timeScale.map((date, index) => (
                    <div 
                      key={index} 
                      className={`flex-shrink-0 p-2 text-xs font-medium text-center border-r border-gray-200 flex flex-col justify-center
                        ${isToday(date) ? 'bg-blue-50 text-blue-600' : ''}`}
                      style={{ width: `${columnWidth}px` }}
                    >
                      {formatDateHeader(date)}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 右侧甘特图内容 - 可垂直滚动 */}
              <div className="overflow-y-auto" style={{ height: 'calc(100% - 64px)' }}>
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
                            ${isToday(date) && dateViewMode === 'day' ? 'bg-blue-50/20' : dateIndex % 2 === 0 ? 'bg-gray-50/50' : ''}`}
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
      </div>

      {/* 编辑对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑工作项: {selectedItem?.name}</DialogTitle>
            <DialogDescription>
              修改工作项的计划和实际时间信息
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* 计划时间 */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                计划时间
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={editForm.plannedStartDate}
                    onChange={(e) => setEditForm({...editForm, plannedStartDate: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={editForm.plannedEndDate}
                    onChange={(e) => setEditForm({...editForm, plannedEndDate: e.target.value})}
                    required
                  />
                </div>
              </div>
            </div>
            
            {/* 实际时间 */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                实际时间
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={editForm.actualStartDate}
                    onChange={(e) => setEditForm({...editForm, actualStartDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={editForm.actualEndDate}
                    onChange={(e) => setEditForm({...editForm, actualEndDate: e.target.value})}
                    disabled={!editForm.actualStartDate}
                  />
                </div>
              </div>
            </div>
            
            {/* 工作状态 */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">工作状态</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={editForm.status}
                onChange={(e) => setEditForm({...editForm, status: e.target.value})}
              >
                <option value="">选择状态</option>
                <option value="未开始">未开始</option>
                <option value="进行中">进行中</option>
                <option value="已暂停">已暂停</option>
                <option value="已完成">已完成</option>
              </select>
            </div>
            
            <DialogFooter>
              <button
                type="button"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                onClick={() => setIsDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GanttChart; 