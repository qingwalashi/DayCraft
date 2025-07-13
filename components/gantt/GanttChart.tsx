"use client";

import { useState, useEffect, useRef } from "react";
import { format, addDays, startOfDay, differenceInDays, isWithinInterval, isSameDay, parseISO } from "date-fns";
import { ChevronRight, ChevronDown } from "lucide-react";

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
}

interface GanttChartProps {
  data: GanttItem[];
  projectName: string;
}

const GanttChart = ({ data, projectName }: GanttChartProps) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [visibleItems, setVisibleItems] = useState<GanttItem[]>([]);
  const [timeScale, setTimeScale] = useState<Date[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 30));
  const containerRef = useRef<HTMLDivElement>(null);
  
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
    
    data.forEach(item => {
      const start = item.startDate ? parseISO(item.startDate) : new Date();
      const end = item.endDate ? parseISO(item.endDate) : addDays(new Date(), 1);
      
      if (start < minDate) minDate = start;
      if (end > maxDate) maxDate = end;
      
      // 考虑实际日期
      if (item.actualStartDate) {
        const actualStart = parseISO(item.actualStartDate);
        if (actualStart < minDate) minDate = actualStart;
      }
      
      if (item.actualEndDate) {
        const actualEnd = parseISO(item.actualEndDate);
        if (actualEnd > maxDate) maxDate = actualEnd;
      }
    });
    
    // 确保至少有30天的范围
    if (differenceInDays(maxDate, minDate) < 30) {
      maxDate = addDays(minDate, 30);
    }
    
    // 设置日期范围
    setStartDate(startOfDay(minDate));
    setEndDate(startOfDay(addDays(maxDate, 1)));
    
  }, [data]);

  // 生成时间刻度
  useEffect(() => {
    const scale: Date[] = [];
    let current = startDate;
    
    while (current <= endDate) {
      scale.push(current);
      current = addDays(current, 1);
    }
    
    setTimeScale(scale);
  }, [startDate, endDate]);

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

  // 计算任务条的位置和宽度
  const getBarPosition = (item: GanttItem) => {
    const start = parseISO(item.startDate);
    const end = parseISO(item.endDate);
    
    const startDiff = differenceInDays(start, startDate);
    const duration = differenceInDays(end, start) + 1; // 包含开始和结束日
    
    return {
      left: `${startDiff * 40}px`,
      width: `${duration * 40}px`,
    };
  };

  // 计算实际进度条的位置和宽度
  const getActualBarPosition = (item: GanttItem) => {
    if (!item.actualStartDate) return null;
    
    const start = parseISO(item.actualStartDate);
    const end = item.actualEndDate ? parseISO(item.actualEndDate) : new Date();
    
    const startDiff = differenceInDays(start, startDate);
    const duration = differenceInDays(end, start) + 1; // 包含开始和结束日
    
    return {
      left: `${startDiff * 40}px`,
      width: `${duration * 40}px`,
    };
  };

  // 判断是否为今天
  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题 */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">{projectName} 进度管理</h2>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧任务列表 */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 overflow-y-auto">
          <div className="sticky top-0 bg-gray-100 p-3 font-medium text-sm text-gray-600 border-b border-gray-200">
            工作项
          </div>
          <div>
            {visibleItems.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center p-2 border-b border-gray-100 hover:bg-gray-50"
                style={{ paddingLeft: `${item.level * 16 + 8}px` }}
              >
                {/* 展开/折叠图标 */}
                <div 
                  className="w-6 h-6 flex items-center justify-center cursor-pointer"
                  onClick={() => toggleExpand(item.id)}
                >
                  {data.some(i => i.parentId === item.id) && (
                    expandedItems[item.id] ? 
                      <ChevronDown className="h-4 w-4 text-gray-500" /> : 
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </div>
                <span className="text-sm truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* 右侧甘特图 */}
        <div className="flex-1 overflow-auto">
          <div ref={containerRef} className="relative">
            {/* 时间刻度 */}
            <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
              <div className="flex">
                {timeScale.map((date, index) => (
                  <div 
                    key={index} 
                    className={`flex-shrink-0 w-[40px] p-2 text-xs font-medium text-center border-r border-gray-200 
                      ${isToday(date) ? 'bg-blue-50 text-blue-600' : ''}`}
                  >
                    <div>{format(date, 'MM/dd')}</div>
                    <div>{format(date, 'EEE')}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 甘特图内容 */}
            <div className="relative">
              {/* 今天的垂直线 */}
              {timeScale.findIndex(date => isToday(date)) >= 0 && (
                <div 
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                  style={{ 
                    left: `${timeScale.findIndex(date => isToday(date)) * 40 + 20}px`,
                    height: `${visibleItems.length * 40}px`
                  }}
                ></div>
              )}
              
              {/* 行和任务条 */}
              {visibleItems.map((item, index) => (
                <div 
                  key={item.id} 
                  className="flex h-10 border-b border-gray-100 relative"
                >
                  {/* 背景网格 */}
                  {timeScale.map((date, dateIndex) => (
                    <div 
                      key={dateIndex}
                      className={`flex-shrink-0 w-[40px] h-full border-r border-gray-100
                        ${isToday(date) ? 'bg-blue-50/20' : dateIndex % 2 === 0 ? 'bg-gray-50/50' : ''}`}
                    ></div>
                  ))}
                  
                  {/* 计划任务条 */}
                  <div 
                    className="absolute top-2 h-6 rounded-sm bg-blue-100 border border-blue-300 z-20 flex items-center px-2"
                    style={{
                      ...getBarPosition(item),
                    }}
                  >
                    <span className="text-xs font-medium text-blue-800 truncate">
                      计划
                    </span>
                  </div>
                  
                  {/* 实际任务条 */}
                  {item.actualStartDate && getActualBarPosition(item) && (
                    <div 
                      className={`absolute top-2 h-6 rounded-sm z-30 flex items-center px-2
                        ${item.actualEndDate ? 'bg-green-100 border border-green-300' : 'bg-yellow-100 border border-yellow-300'}`}
                      style={{
                        ...getActualBarPosition(item),
                      }}
                    >
                      <span className={`text-xs font-medium truncate
                        ${item.actualEndDate ? 'text-green-800' : 'text-yellow-800'}`}>
                        {item.actualEndDate ? '已完成' : '进行中'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart; 