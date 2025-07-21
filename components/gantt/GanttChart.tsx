"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format, addDays, startOfDay, differenceInDays, isWithinInterval, isSameDay, parseISO, startOfWeek, startOfMonth, addWeeks, addMonths } from "date-fns";
import { zhCN } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Calendar, Clock, X, User, Tag, FileText, MessageSquare, Target, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getStatusBadgeClass } from '@/lib/utils/status-colors';

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
  persistExpandState?: boolean; // 是否持久化展开状态，默认为true
}

type ViewMode = 'week' | 'month';

interface TimeUnit {
  date: Date;
  label: string;
  isToday?: boolean;
}

const GanttChart = ({ data, projectName, onUpdateItem, persistExpandState = true }: GanttChartProps) => {
  // 核心状态
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [visibleItems, setVisibleItems] = useState<GanttItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [expandLevel, setExpandLevel] = useState<number>(0); // 0-4级，0表示1级展开
  const [isStateLoaded, setIsStateLoaded] = useState<boolean>(false); // 标记是否已加载保存的状态
  
  // 时间轴状态
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [timeUnits, setTimeUnits] = useState<TimeUnit[]>([]);
  
  // 编辑表单状态
  const [editForm, setEditForm] = useState({
    plannedStartDate: "",
    plannedEndDate: "",
    actualStartDate: "",
    actualEndDate: "",
    status: "未开始"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 视图状态
  const [showActual, setShowActual] = useState(false);
  const [columnWidth] = useState(80);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  
  // 引用
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelScrollRef = useRef<HTMLDivElement>(null);
  const timeAxisScrollRef = useRef<HTMLDivElement>(null);
  const ganttContentRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // 生成时间轴数据
  const generateTimeUnits = useCallback(() => {
    const units: TimeUnit[] = [];
    const today = new Date();
    
    if (viewMode === 'week') {
      // 生成前后各8周，共17周的数据
      const startWeek = addWeeks(currentDate, -8);
      for (let i = 0; i < 17; i++) {
        const weekStart = addWeeks(startWeek, i);
        const weekEnd = addDays(weekStart, 6);
        units.push({
          date: weekStart,
          label: `${format(weekStart, 'M/d', { locale: zhCN })} - ${format(weekEnd, 'M/d', { locale: zhCN })}`,
          isToday: isWithinInterval(today, { start: weekStart, end: weekEnd })
        });
      }
    } else {
      // 生成前后各6个月，共13个月的数据
      const startMonth = addMonths(startOfMonth(currentDate), -6);
      for (let i = 0; i < 13; i++) {
        const month = addMonths(startMonth, i);
        units.push({
          date: month,
          label: format(month, 'yyyy年M月', { locale: zhCN }),
          isToday: format(month, 'yyyy-MM') === format(today, 'yyyy-MM')
        });
      }
    }
    
    setTimeUnits(units);
  }, [viewMode, currentDate]);

  // 计算任务条的位置和宽度
  const getTaskBarStyle = useCallback((item: GanttItem) => {
    if (!item.startDate || !item.endDate) return null;
    
    const startDate = parseISO(item.startDate);
    const endDate = parseISO(item.endDate);
    
    // 找到开始时间对应的列索引
    let startIndex = -1;
    let endIndex = -1;
    
    timeUnits.forEach((unit, index) => {
      if (viewMode === 'week') {
        const weekEnd = addDays(unit.date, 6);
        if (isWithinInterval(startDate, { start: unit.date, end: weekEnd })) {
          startIndex = index;
        }
        if (isWithinInterval(endDate, { start: unit.date, end: weekEnd })) {
          endIndex = index;
        }
      } else {
        const monthEnd = addDays(addMonths(unit.date, 1), -1);
        if (isWithinInterval(startDate, { start: unit.date, end: monthEnd })) {
          startIndex = index;
        }
        if (isWithinInterval(endDate, { start: unit.date, end: monthEnd })) {
          endIndex = index;
        }
      }
    });
    
    if (startIndex === -1 || endIndex === -1) return null;
    
    const width = (endIndex - startIndex + 1) * columnWidth;
    const left = startIndex * columnWidth;
    
    return {
      left: `${left}px`,
      width: `${width}px`,
    };
  }, [timeUnits, viewMode, columnWidth]);

  // 处理工作项展开/折叠
  const toggleExpand = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newState = {
        ...prev,
        [itemId]: !prev[itemId]
      };
      // 根据配置决定是否保存展开状态到localStorage
      if (persistExpandState) {
        localStorage.setItem('gantt_expanded_items', JSON.stringify(newState));
      }
      return newState;
    });
  }, [persistExpandState]);

  // 处理展开层级变化
  const handleExpandLevelChange = useCallback((level: number) => {
    setExpandLevel(level);

    // 根据层级设置展开状态
    const newExpandedState: Record<string, boolean> = {};

    const setExpandStateByLevel = (items: GanttItem[], currentLevel: number = 0) => {
      items.forEach(item => {
        // 如果当前层级小于设定的展开级别，则展开
        newExpandedState[item.id] = currentLevel < level;

        // 处理子项
        const children = data.filter(child => child.parentId === item.id);
        if (children.length > 0) {
          setExpandStateByLevel(children, currentLevel + 1);
        }
      });
    };

    // 获取顶级项目
    const rootItems = data.filter(item => !item.parentId);
    setExpandStateByLevel(rootItems);

    setExpandedItems(newExpandedState);

    // 根据配置决定是否保存展开状态和层级到localStorage
    if (persistExpandState) {
      localStorage.setItem('gantt_expanded_items', JSON.stringify(newExpandedState));
      localStorage.setItem('gantt_expand_level', level.toString());
    }
  }, [data, persistExpandState]);

  // 计算可见的工作项
  const calculateVisibleItems = useCallback(() => {
    if (data.length === 0) {
      setVisibleItems([]);
      return;
    }

    const result: GanttItem[] = [];

    const addItemAndChildren = (item: GanttItem, currentLevel: number = 0) => {
      result.push({ ...item, level: currentLevel });

      // 如果项目展开，添加子项目
      if (expandedItems[item.id] !== false) {
        const children = data.filter(child => child.parentId === item.id);
        children.forEach(child => addItemAndChildren(child, currentLevel + 1));
      }
    };

    // 添加根级项目
    const rootItems = data.filter(item => !item.parentId);
    rootItems.forEach(item => addItemAndChildren(item, 0));

    setVisibleItems(result);
  }, [data, expandedItems]);

  // 处理项目点击
  const handleItemClick = useCallback((item: GanttItem) => {
    setSelectedItem(item);
    setEditForm({
      plannedStartDate: item.startDate ? format(parseISO(item.startDate), 'yyyy-MM-dd') : '',
      plannedEndDate: item.endDate ? format(parseISO(item.endDate), 'yyyy-MM-dd') : '',
      actualStartDate: item.actualStartDate ? format(parseISO(item.actualStartDate), 'yyyy-MM-dd') : '',
      actualEndDate: item.actualEndDate ? format(parseISO(item.actualEndDate), 'yyyy-MM-dd') : '',
      status: item.status || '未开始'
    });
    setIsEditMode(false);
    setIsDialogOpen(true);
  }, []);

  // 处理表单提交
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !onUpdateItem) return;

    setIsSubmitting(true);
    try {
      const updatedItem: GanttItem = {
        ...selectedItem,
        startDate: editForm.plannedStartDate ? `${editForm.plannedStartDate}T00:00:00` : null,
        endDate: editForm.plannedEndDate ? `${editForm.plannedEndDate}T23:59:59` : null,
        actualStartDate: editForm.actualStartDate ? `${editForm.actualStartDate}T00:00:00` : null,
        actualEndDate: editForm.actualEndDate ? `${editForm.actualEndDate}T23:59:59` : null,
        status: editForm.status
      };

      const success = await onUpdateItem(updatedItem);
      if (success) {
        setIsDialogOpen(false);
        setIsEditMode(false);
        setSelectedItem(null);
        // 不需要额外的刷新操作，因为父组件会通过props更新data
        // 这样可以保持当前的展开状态和层级关系
      }
    } catch (error) {
      console.error('更新失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedItem, editForm, onUpdateItem]);

  // 导航函数
  const goToPrevious = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentDate(prev => addWeeks(prev, -1));
    } else {
      setCurrentDate(prev => addMonths(prev, -1));
    }
  }, [viewMode]);

  const goToNext = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentDate(prev => addWeeks(prev, 1));
    } else {
      setCurrentDate(prev => addMonths(prev, 1));
    }
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // 重置展开状态
  const resetExpandState = useCallback(() => {
    if (persistExpandState) {
      localStorage.removeItem('gantt_expanded_items');
      localStorage.removeItem('gantt_expand_level');
    }
    setExpandLevel(0); // 重置为1级展开
    setExpandedItems({}); // 清空当前展开状态
    setIsStateLoaded(false); // 重置状态标记
    // 延迟执行handleExpandLevelChange，确保状态重置完成
    setTimeout(() => {
      handleExpandLevelChange(0);
      setIsStateLoaded(true);
    }, 0);
  }, [persistExpandState, handleExpandLevelChange]);

  // 处理纵向滚动同步
  const handleVerticalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;

    // 同步甘特图内容区域的纵向滚动
    if (ganttContentRef.current && ganttContentRef.current !== e.currentTarget) {
      ganttContentRef.current.scrollTop = scrollTop;
    }

    // 同步左侧面板的纵向滚动
    if (leftPanelScrollRef.current && leftPanelScrollRef.current !== e.currentTarget) {
      leftPanelScrollRef.current.scrollTop = scrollTop;
    }
  }, []);

  // 处理横向滚动同步
  const handleHorizontalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;

    // 同步时间轴的横向滚动
    if (timeAxisScrollRef.current && timeAxisScrollRef.current !== e.currentTarget) {
      timeAxisScrollRef.current.scrollLeft = scrollLeft;
    }

    // 同步甘特图内容区域的横向滚动
    if (ganttContentRef.current && ganttContentRef.current !== e.currentTarget) {
      ganttContentRef.current.scrollLeft = scrollLeft;
    }

    // 同步主滚动条的横向滚动
    if (mainScrollRef.current && mainScrollRef.current !== e.currentTarget) {
      mainScrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  // 效果钩子
  useEffect(() => {
    generateTimeUnits();
  }, [generateTimeUnits]);

  // 当数据或展开状态变化时重新计算可见项目
  useEffect(() => {
    calculateVisibleItems();
  }, [calculateVisibleItems]);

  // 当数据更新时，确保新增的项目有默认的展开状态
  useEffect(() => {
    if (isStateLoaded && data.length > 0) {
      setExpandedItems(prevExpandedItems => {
        const newExpandedState = { ...prevExpandedItems };
        let hasNewItems = false;

        data.forEach(item => {
          if (!(item.id in newExpandedState)) {
            // 新项目默认展开状态根据当前展开级别决定
            const itemLevel = getItemLevel(item.id, data);
            newExpandedState[item.id] = itemLevel < expandLevel;
            hasNewItems = true;
          }
        });

        if (hasNewItems) {
          // 根据配置决定是否保存更新后的状态
          if (persistExpandState) {
            localStorage.setItem('gantt_expanded_items', JSON.stringify(newExpandedState));
          }
          return newExpandedState;
        }

        return prevExpandedItems;
      });
    }
  }, [isStateLoaded, data, expandLevel, persistExpandState]);

  // 获取项目层级的辅助函数
  const getItemLevel = (itemId: string, items: GanttItem[]): number => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.parentId) return 0;
    return 1 + getItemLevel(item.parentId, items);
  };

  // 从localStorage加载保存的状态
  useEffect(() => {
    if (!persistExpandState) {
      setIsStateLoaded(true);
      return;
    }

    let hasLoadedState = false;

    // 加载保存的展开层级
    const savedExpandLevel = localStorage.getItem('gantt_expand_level');
    if (savedExpandLevel) {
      const level = parseInt(savedExpandLevel);
      if (level >= 0 && level <= 4) {
        setExpandLevel(level);
        hasLoadedState = true;
      }
    }

    // 加载保存的展开状态
    const savedExpandedItems = localStorage.getItem('gantt_expanded_items');
    if (savedExpandedItems) {
      try {
        const parsedState = JSON.parse(savedExpandedItems);
        setExpandedItems(parsedState);
        hasLoadedState = true;
      } catch (error) {
        console.warn('Failed to parse saved expanded items:', error);
      }
    }

    // 标记状态已加载
    setIsStateLoaded(true);
  }, [persistExpandState]);

  // 初始化展开状态 - 只在状态已加载且没有保存状态时设置默认状态
  useEffect(() => {
    if (isStateLoaded && data.length > 0 && Object.keys(expandedItems).length === 0) {
      // 没有保存的状态，使用默认的展开层级
      handleExpandLevelChange(expandLevel);
    }
  }, [isStateLoaded, data, expandedItems, expandLevel, handleExpandLevelChange]);

  // 获取状态样式 - 与时间轴里程碑颜色一致
  const getStatusColor = (status?: string) => {
    switch (status) {
      case '进行中': return 'bg-blue-500';
      case '已完成': return 'bg-green-500';
      case '已暂停': return 'bg-yellow-500';
      case '已延期': return 'bg-red-500';
      case '未开始': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  // 获取状态标签样式 - 用于工作项列表中的状态标签
  const getStatusBadgeColor = (status?: string) => {
    switch (status) {
      case '进行中': return 'bg-blue-500 text-white';
      case '已完成': return 'bg-green-500 text-white';
      case '已暂停': return 'bg-yellow-500 text-white';
      case '已延期': return 'bg-red-500 text-white';
      case '未开始': return 'bg-gray-400 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 添加全局样式来隐藏滚动条 */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .hide-scrollbar {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `
      }} />
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">{projectName}</h2>
          
          {/* 视图切换 */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'week' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              周视图
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'month' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              月视图
            </button>
          </div>
        </div>

        {/* 导航控件 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={goToPrevious}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            今天
          </button>
          
          <button
            onClick={goToNext}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* 展开层级控制 */}
          <div className="flex items-center space-x-2 ml-4">
            <label className="text-sm text-gray-600">展开层级:</label>
            <select
              value={expandLevel}
              onChange={(e) => handleExpandLevelChange(parseInt(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="0">1级</option>
              <option value="1">2级</option>
              <option value="2">3级</option>
              <option value="3">4级</option>
              <option value="4">全部</option>
            </select>

            {/* 重置展开状态按钮 */}
            {persistExpandState && (
              <button
                onClick={resetExpandState}
                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="重置展开状态"
              >
                重置
              </button>
            )}
          </div>

          {/* 显示选项 */}
          <div className="flex items-center space-x-2 ml-4">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showActual}
                onChange={(e) => setShowActual(e.target.checked)}
                className="mr-2"
              />
              显示实际进度
            </label>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧工作项列表 */}
        <div
          className="flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col"
          style={{ width: `${leftPanelWidth}px` }}
        >
          {/* 表头 */}
          <div className="h-12 flex items-center px-4 bg-gray-100 border-b border-gray-200 font-medium text-gray-700 flex-shrink-0">
            工作项
          </div>

          {/* 工作项列表 - 添加滚动同步 */}
          <div
            ref={leftPanelScrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
            onScroll={handleVerticalScroll}
          >
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="h-12 flex items-center px-4 border-b border-gray-100 hover:bg-gray-100 cursor-pointer transition-colors flex-shrink-0"
                style={{ paddingLeft: `${16 + item.level * 20}px` }}
                onClick={() => handleItemClick(item)}
              >
                {/* 展开/折叠按钮 */}
                {data.some(child => child.parentId === item.id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.id);
                    }}
                    className="mr-2 p-1 hover:bg-gray-200 rounded"
                  >
                    {expandedItems[item.id] !== false ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                )}

                {/* 工作项名称和状态 */}
                <div className="flex-1 flex items-center min-w-0">
                  <span className="text-sm text-gray-900 truncate flex-shrink">{item.name}</span>
                  {item.status && (
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full whitespace-nowrap flex-shrink-0 ${getStatusBadgeColor(item.status)}`}>
                      {item.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧甘特图区域 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 时间轴表头 - 添加横向滚动同步 */}
          <div
            ref={timeAxisScrollRef}
            className="h-12 bg-gray-100 border-b border-gray-200 overflow-x-auto overflow-y-hidden flex-shrink-0 hide-scrollbar"
            onScroll={handleHorizontalScroll}
          >
            <div
              className="flex h-full"
              style={{ width: `${timeUnits.length * columnWidth}px` }}
            >
              {timeUnits.map((unit, index) => (
                <div
                  key={index}
                  className={`flex-shrink-0 flex items-center justify-center text-xs font-medium border-r border-gray-200 ${
                    unit.isToday ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                  }`}
                  style={{ width: `${columnWidth}px` }}
                >
                  {unit.label}
                </div>
              ))}
            </div>
          </div>

          {/* 甘特图内容 - 添加双向滚动同步 */}
          <div
            ref={ganttContentRef}
            className="flex-1 overflow-auto hide-scrollbar"
            onScroll={(e) => {
              handleHorizontalScroll(e);
              handleVerticalScroll(e);
            }}
          >
            <div
              className="relative"
              style={{
                width: `${timeUnits.length * columnWidth}px`,
                height: `${visibleItems.length * 48}px`
              }}
            >
              {/* 背景网格 */}
              {timeUnits.map((unit, index) => (
                <div
                  key={`grid-${index}`}
                  className={`absolute top-0 bottom-0 border-r border-gray-100 ${
                    unit.isToday ? 'bg-blue-50' : index % 2 === 0 ? 'bg-gray-25' : ''
                  }`}
                  style={{
                    left: `${index * columnWidth}px`,
                    width: `${columnWidth}px`
                  }}
                />
              ))}

              {/* 今天线 */}
              {timeUnits.some(unit => unit.isToday) && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                  style={{
                    left: `${timeUnits.findIndex(unit => unit.isToday) * columnWidth + columnWidth / 2}px`
                  }}
                />
              )}

              {/* 任务条 */}
              {visibleItems.map((item, itemIndex) => {
                const taskStyle = getTaskBarStyle(item);
                if (!taskStyle) return null;

                return (
                  <div key={`task-${item.id}`}>
                    {/* 计划任务条 */}
                    {item.startDate && item.endDate && (
                      <div
                        className={`absolute h-6 rounded-md cursor-pointer transition-all hover:shadow-md ${getStatusColor(item.status)} opacity-80`}
                        style={{
                          top: `${itemIndex * 48 + 12}px`,
                          ...taskStyle
                        }}
                        onClick={() => handleItemClick(item)}
                      >
                        <div className="px-2 py-1 text-xs text-white truncate">
                          {item.name}
                        </div>

                        {/* 进度条 */}
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-white bg-opacity-50 rounded-b-md"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {/* 实际任务条（如果启用显示实际进度） */}
                    {showActual && item.actualStartDate && item.actualEndDate && (
                      <div
                        className="absolute h-4 bg-gray-600 rounded-md cursor-pointer opacity-60"
                        style={{
                          top: `${itemIndex * 48 + 28}px`,
                          ...getTaskBarStyle({
                            ...item,
                            startDate: item.actualStartDate,
                            endDate: item.actualEndDate
                          })
                        }}
                        onClick={() => handleItemClick(item)}
                      >
                        <div className="px-1 text-xs text-white truncate">
                          实际
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 主横向滚动条 - 位于底部 */}
        <div
          ref={mainScrollRef}
          className="absolute bottom-0 left-0 right-0 h-4 overflow-x-auto overflow-y-hidden bg-gray-100 border-t border-gray-200"
          onScroll={handleHorizontalScroll}
          style={{ left: `${leftPanelWidth}px` }}
        >
          <div style={{ width: `${timeUnits.length * columnWidth}px`, height: '1px' }} />
        </div>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? '编辑工作项' : '查看工作项'} - {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    状态
                  </label>
                  {isEditMode ? (
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="未开始">未开始</option>
                      <option value="进行中">进行中</option>
                      <option value="已暂停">已暂停</option>
                      <option value="已完成">已完成</option>
                      <option value="已延期">已延期</option>
                    </select>
                  ) : (
                    <div className={`inline-flex px-3 py-1 rounded-full text-sm ${getStatusBadgeColor(selectedItem.status)}`}>
                      {selectedItem.status || '未开始'}
                    </div>
                  )}
                </div>
              </div>

              {/* 计划时间 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  计划时间
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">开始日期</label>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editForm.plannedStartDate}
                        onChange={(e) => setEditForm({...editForm, plannedStartDate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {selectedItem.startDate ? format(parseISO(selectedItem.startDate), 'yyyy-MM-dd') : '未设置'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editForm.plannedEndDate}
                        onChange={(e) => setEditForm({...editForm, plannedEndDate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {selectedItem.endDate ? format(parseISO(selectedItem.endDate), 'yyyy-MM-dd') : '未设置'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 实际时间 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  实际时间
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">实际开始</label>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editForm.actualStartDate}
                        onChange={(e) => setEditForm({...editForm, actualStartDate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {selectedItem.actualStartDate ? format(parseISO(selectedItem.actualStartDate), 'yyyy-MM-dd') : '未开始'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">实际结束</label>
                    {isEditMode ? (
                      <input
                        type="date"
                        value={editForm.actualEndDate}
                        onChange={(e) => setEditForm({...editForm, actualEndDate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {selectedItem.actualEndDate ? format(parseISO(selectedItem.actualEndDate), 'yyyy-MM-dd') : '未完成'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 其他信息 */}
              {(selectedItem.description || selectedItem.tags || selectedItem.members) && (
                <div className="space-y-3">
                  {selectedItem.description && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        描述
                      </label>
                      <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                        {selectedItem.description}
                      </div>
                    </div>
                  )}

                  {selectedItem.tags && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                        <Tag className="h-4 w-4 mr-2" />
                        标签
                      </label>
                      <div className="text-sm text-gray-900">
                        {selectedItem.tags}
                      </div>
                    </div>
                  )}

                  {selectedItem.members && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        成员
                      </label>
                      <div className="text-sm text-gray-900">
                        {selectedItem.members}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {!isEditMode && onUpdateItem && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    编辑
                  </button>
                )}
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setIsDialogOpen(false);
                    setIsEditMode(false);
                    setSelectedItem(null);
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {isEditMode ? '取消' : '关闭'}
                </button>

                {isEditMode && (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? '保存中...' : '保存'}
                  </button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GanttChart;
