"use client";

import { useState, useEffect, useRef, useCallback, WheelEvent } from "react";
import { format, addDays, startOfDay, differenceInDays, isWithinInterval, isSameDay, parseISO, startOfWeek, startOfMonth, startOfYear, addWeeks, addMonths, addYears, getWeek, getMonth, getYear, getQuarter, startOfQuarter, addQuarters, getISOWeek, getWeekYear } from "date-fns";
import { zhCN } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Calendar, Clock, X, ZoomIn, ZoomOut, User, Tag, FileText, MessageSquare, Target, ChevronLeft } from "lucide-react";
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
type DateViewMode = 'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year';

// 时间轴单元格接口
interface TimeCell {
  date: Date;
  label: string;
  span: number; // 跨越的列数
  isHighlight?: boolean; // 是否高亮（今天/当前月等）
}

// 时间轴数据接口
interface TimeAxisData {
  upperRow: TimeCell[]; // 上级时间单位行
  lowerRow: TimeCell[]; // 下级时间单位行
  totalColumns: number; // 总列数
}

const GanttChart = ({ data, projectName, onUpdateItem }: GanttChartProps) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [visibleItems, setVisibleItems] = useState<GanttItem[]>([]);
  const [timeScale, setTimeScale] = useState<Date[]>([]);
  const [timeAxisData, setTimeAxisData] = useState<TimeAxisData>({ upperRow: [], lowerRow: [], totalColumns: 0 });
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 30));
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // 区分编辑模式和只读模式
  const [editForm, setEditForm] = useState({
    plannedStartDate: "",
    plannedEndDate: "",
    actualStartDate: "",
    actualEndDate: "",
    status: "未开始"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'planned' | 'actual'>('planned');
  const [currentEditingViewMode, setCurrentEditingViewMode] = useState<'planned' | 'actual'>('planned');
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 新增状态
  const [dateViewMode, setDateViewMode] = useState<DateViewMode>('month');
  const [columnWidth, setColumnWidth] = useState<number>(50);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [expandLevel, setExpandLevel] = useState<number>(4); // 默认展开所有层级
  
  // 添加工作项列宽度状态
  const [itemColumnWidth, setItemColumnWidth] = useState<number>(256); // 默认宽度16rem = 256px
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [startX, setStartX] = useState<number>(0);
  const [startWidth, setStartWidth] = useState<number>(0);

  // 添加是否需要自动滚动到今天的状态
  const [shouldScrollToToday, setShouldScrollToToday] = useState<boolean>(false);

  // 添加今天是否在可见范围内的状态
  const [isTodayVisible, setIsTodayVisible] = useState<boolean>(true);

  // 添加无限滚动相关状态
  const [isExtending, setIsExtending] = useState<boolean>(false);
  const [lastScrollLeft, setLastScrollLeft] = useState<number>(0);
  const [pendingScrollAdjustment, setPendingScrollAdjustment] = useState<number | null>(null);
  const [showExtendingHint, setShowExtendingHint] = useState<string | null>(null);
  
  // 从localStorage读取视图模式
  useEffect(() => {
    // 读取视图模式（计划/实际）
    const savedViewMode = localStorage.getItem('gantt_view_mode');
    if (savedViewMode === 'actual' || savedViewMode === 'planned') {
      setViewMode(savedViewMode);
    }
    
    // 读取日期视图模式
    const savedDateViewMode = localStorage.getItem('gantt_date_view_mode');
    const initialMode = (savedDateViewMode === 'day' || savedDateViewMode === 'week' ||
        savedDateViewMode === 'month' || savedDateViewMode === 'quarter' ||
        savedDateViewMode === 'halfyear' || savedDateViewMode === 'year')
        ? savedDateViewMode as DateViewMode
        : 'month'; // 默认为月视图

    setDateViewMode(initialMode);

    // 设置相应的缩放级别
    const minWidth = getMinColumnWidth(initialMode);
    switch (initialMode) {
      case 'day':
        setZoomLevel(1.5);
        setColumnWidth(Math.max(minWidth, 80));
        break;
      case 'week':
        setZoomLevel(1.2);
        setColumnWidth(Math.max(minWidth, 64));
        break;
      case 'month':
        setZoomLevel(1);
        setColumnWidth(Math.max(minWidth, 50));
        break;
      case 'quarter':
        setZoomLevel(0.8);
        setColumnWidth(Math.max(minWidth, 80));
        break;
      case 'halfyear':
        setZoomLevel(0.7);
        setColumnWidth(Math.max(minWidth, 60));
        break;
      case 'year':
        setZoomLevel(0.6);
        setColumnWidth(Math.max(minWidth, 60));
        break;
    }

    // 初始化时设置以今天为中心的时间范围
    const today = new Date();
    let initialStartDate: Date;
    let initialEndDate: Date;

    switch (initialMode) {
      case 'day':
        initialStartDate = startOfDay(addDays(today, -15));
        initialEndDate = startOfDay(addDays(today, 15));
        break;
      case 'week':
        const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        initialStartDate = startOfWeek(addWeeks(todayWeekStart, -8), { weekStartsOn: 1 });
        initialEndDate = addDays(startOfWeek(addWeeks(todayWeekStart, 8), { weekStartsOn: 1 }), 6);
        break;
      case 'month':
        const todayMonthStart = startOfMonth(today);
        initialStartDate = startOfMonth(addMonths(todayMonthStart, -6));
        initialEndDate = addDays(startOfMonth(addMonths(todayMonthStart, 7)), -1);
        break;
      case 'quarter':
        const todayQuarterStart = startOfQuarter(today);
        initialStartDate = startOfQuarter(addQuarters(todayQuarterStart, -4));
        initialEndDate = addDays(startOfQuarter(addQuarters(todayQuarterStart, 5)), -1);
        break;
      case 'halfyear':
        initialStartDate = startOfYear(addYears(today, -2));
        initialEndDate = addDays(startOfYear(addYears(today, 3)), -1);
        break;
      case 'year':
        initialStartDate = startOfYear(addYears(today, -5));
        initialEndDate = addDays(startOfYear(addYears(today, 6)), -1);
        break;
      default:
        initialStartDate = startOfDay(addDays(today, -15));
        initialEndDate = startOfDay(addDays(today, 15));
        break;
    }

    setStartDate(initialStartDate);
    setEndDate(initialEndDate);

    // 标记需要滚动到今天
    setShouldScrollToToday(true);
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

    // 检查是否已经有设置的时间范围（避免覆盖用户的视图选择）
    const hasExistingTimeRange = startDate && endDate &&
      Math.abs(differenceInDays(startDate, new Date())) < 365; // 如果时间范围在合理范围内，认为已设置

    if (hasExistingTimeRange) {
      // 如果已经有合理的时间范围，只确保包含所有数据
      if (minDate && maxDate) {
        const currentStart = startDate;
        const currentEnd = endDate;

        // 只在数据超出当前范围时才扩展
        if (minDate < currentStart || maxDate > currentEnd) {
          const newStart = minDate < currentStart ? minDate : currentStart;
          const newEnd = maxDate > currentEnd ? maxDate : currentEnd;

          setStartDate(newStart);
          setEndDate(newEnd);
        }
      }
      return;
    }

    // 如果没有设置时间范围，使用以今天为中心的默认范围，并确保包含所有数据
    const today = new Date();
    let defaultStartDate: Date;
    let defaultEndDate: Date;

    // 根据当前视图模式设置默认的时间范围，以今天为中心
    switch (dateViewMode) {
      case 'day':
        defaultStartDate = startOfDay(addDays(today, -30));
        defaultEndDate = startOfDay(addDays(today, 30));
        break;
      case 'week':
        const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        defaultStartDate = startOfWeek(addWeeks(todayWeekStart, -12), { weekStartsOn: 1 });
        defaultEndDate = addDays(startOfWeek(addWeeks(todayWeekStart, 12), { weekStartsOn: 1 }), 6);
        break;
      case 'month':
        const todayMonthStart = startOfMonth(today);
        defaultStartDate = startOfMonth(addMonths(todayMonthStart, -12));
        defaultEndDate = addDays(startOfMonth(addMonths(todayMonthStart, 13)), -1);
        break;
      case 'quarter':
        const todayQuarterStart = startOfQuarter(today);
        defaultStartDate = startOfQuarter(addQuarters(todayQuarterStart, -8));
        defaultEndDate = addDays(startOfQuarter(addQuarters(todayQuarterStart, 9)), -1);
        break;
      case 'halfyear':
        defaultStartDate = startOfYear(addYears(today, -3));
        defaultEndDate = addDays(startOfYear(addYears(today, 4)), -1);
        break;
      case 'year':
        defaultStartDate = startOfYear(addYears(today, -10));
        defaultEndDate = addDays(startOfYear(addYears(today, 11)), -1);
        break;
      default:
        defaultStartDate = startOfDay(addDays(today, -180));
        defaultEndDate = startOfDay(addDays(today, 180));
        break;
    }

    // 如果有数据，确保时间范围包含所有数据
    if (minDate && maxDate) {
      if (minDate < defaultStartDate) {
        defaultStartDate = minDate;
      }
      if (maxDate > defaultEndDate) {
        defaultEndDate = maxDate;
      }
    }

    // 设置最终的时间范围
    setStartDate(startOfDay(defaultStartDate));
    setEndDate(startOfDay(defaultEndDate));
    
  }, [data, expandLevel]);

  // 生成时间刻度和时间轴数据
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
        // 确保包含endDate所在的周
        const endWeekStart = startOfWeek(endDate, { weekStartsOn: 1 });
        while (current <= endWeekStart) {
          scale.push(current);
          current = addWeeks(current, 1);
        }
        break;
      case 'month':
      case 'halfyear':
        current = startOfMonth(current);
        // 确保包含endDate所在的月
        const endMonthStart = startOfMonth(endDate);
        while (current <= endMonthStart) {
          scale.push(current);
          current = addMonths(current, 1);
        }
        break;
      case 'quarter':
        current = startOfQuarter(current);
        // 确保包含endDate所在的季度
        const endQuarterStart = startOfQuarter(endDate);
        while (current <= endQuarterStart) {
          scale.push(current);
          current = addQuarters(current, 1);
        }
        break;
      case 'year':
        current = startOfYear(current);
        // 确保包含endDate所在的年
        const endYearStart = startOfYear(endDate);
        while (current <= endYearStart) {
          scale.push(current);
          current = addYears(current, 1);
        }
        break;
    }

    setTimeScale(scale);

    // 生成新的时间轴数据
    const generateAxisData = (): TimeAxisData => {
      const upperRow: TimeCell[] = [];
      const lowerRow: TimeCell[] = [];
      let totalColumns = 0;

      switch (dateViewMode) {
        case 'year': {
          // 年视图：上行显示年代，下行显示年份
          const years: Date[] = [];
          let current = startOfYear(startDate);
          const endYear = startOfYear(endDate);

          while (current <= endYear) {
            years.push(current);
            current = addYears(current, 1);
          }

          // 生成下行（年份）
          years.forEach(year => {
            const yearNum = getYear(year);
            lowerRow.push({
              date: year,
              label: `${yearNum}年`,
              span: 1,
              isHighlight: yearNum === getYear(new Date())
            });
          });

          // 生成上行（年代）
          let currentDecade = Math.floor(getYear(years[0]) / 10) * 10;
          let decadeStart = 0;
          let decadeCount = 0;

          years.forEach((year, index) => {
            const yearNum = getYear(year);
            const decade = Math.floor(yearNum / 10) * 10;

            if (decade !== currentDecade) {
              if (decadeCount > 0) {
                upperRow.push({
                  date: years[decadeStart],
                  label: `${currentDecade}年代`,
                  span: decadeCount
                });
              }
              currentDecade = decade;
              decadeStart = index;
              decadeCount = 1;
            } else {
              decadeCount++;
            }
          });

          // 添加最后一个年代
          if (decadeCount > 0) {
            upperRow.push({
              date: years[decadeStart],
              label: `${currentDecade}年代`,
              span: decadeCount
            });
          }

          totalColumns = years.length;
          break;
        }

        case 'halfyear': {
          // 半年视图：上行显示半年，下行显示月份
          const months: Date[] = [];
          let current = startOfMonth(startDate);
          const endMonth = startOfMonth(endDate);

          while (current <= endMonth) {
            months.push(current);
            current = addMonths(current, 1);
          }

          // 生成下行（月份）
          months.forEach(month => {
            const monthNum = getMonth(month) + 1;
            const isCurrentMonth = getYear(month) === getYear(new Date()) && getMonth(month) === getMonth(new Date());
            lowerRow.push({
              date: month,
              label: `${monthNum.toString().padStart(2, '0')}`,
              span: 1,
              isHighlight: isCurrentMonth
            });
          });

          // 生成上行（半年）
          let currentHalfYear = `${getYear(months[0])}-${Math.floor(getMonth(months[0]) / 6)}`;
          let halfYearStart = 0;
          let halfYearCount = 0;

          months.forEach((month, index) => {
            const halfYear = `${getYear(month)}-${Math.floor(getMonth(month) / 6)}`;

            if (halfYear !== currentHalfYear) {
              if (halfYearCount > 0) {
                const halfYearDate = months[halfYearStart];
                const year = getYear(halfYearDate);
                const half = Math.floor(getMonth(halfYearDate) / 6) === 0 ? '上' : '下';
                upperRow.push({
                  date: halfYearDate,
                  label: `${year}.${half}`,
                  span: halfYearCount
                });
              }
              currentHalfYear = halfYear;
              halfYearStart = index;
              halfYearCount = 1;
            } else {
              halfYearCount++;
            }
          });

          // 添加最后一个半年
          if (halfYearCount > 0) {
            const halfYearDate = months[halfYearStart];
            const year = getYear(halfYearDate);
            const half = Math.floor(getMonth(halfYearDate) / 6) === 0 ? '上' : '下';
            upperRow.push({
              date: halfYearDate,
              label: `${year}.${half}`,
              span: halfYearCount
            });
          }

          totalColumns = months.length;
          break;
        }

        case 'quarter': {
          // 季度视图：上行显示年份，下行显示季度
          const quarters: Date[] = [];
          let current = startOfQuarter(startDate);
          const endQuarter = startOfQuarter(endDate);

          while (current <= endQuarter) {
            quarters.push(current);
            current = addQuarters(current, 1);
          }

          // 生成下行（季度）
          quarters.forEach(quarter => {
            const quarterNum = getQuarter(quarter);
            const quarterNames = ['', '一季度', '二季度', '三季度', '四季度'];
            const isCurrentQuarter = getYear(quarter) === getYear(new Date()) && getQuarter(quarter) === getQuarter(new Date());
            lowerRow.push({
              date: quarter,
              label: quarterNames[quarterNum],
              span: 1,
              isHighlight: isCurrentQuarter
            });
          });

          // 生成上行（年份）
          let currentYear = getYear(quarters[0]);
          let yearStart = 0;
          let yearCount = 0;

          quarters.forEach((quarter, index) => {
            const year = getYear(quarter);

            if (year !== currentYear) {
              if (yearCount > 0) {
                upperRow.push({
                  date: quarters[yearStart],
                  label: `${currentYear}年`,
                  span: yearCount
                });
              }
              currentYear = year;
              yearStart = index;
              yearCount = 1;
            } else {
              yearCount++;
            }
          });

          // 添加最后一个年份
          if (yearCount > 0) {
            upperRow.push({
              date: quarters[yearStart],
              label: `${currentYear}年`,
              span: yearCount
            });
          }

          totalColumns = quarters.length;
          break;
        }

        case 'month': {
          // 月视图：上行显示季度，下行显示月份
          const months: Date[] = [];
          let current = startOfMonth(startDate);
          const endMonth = startOfMonth(endDate);

          while (current <= endMonth) {
            months.push(current);
            current = addMonths(current, 1);
          }

          // 生成下行（月份）
          months.forEach(month => {
            const monthNum = getMonth(month) + 1;
            const isCurrentMonth = getYear(month) === getYear(new Date()) && getMonth(month) === getMonth(new Date());
            lowerRow.push({
              date: month,
              label: `${monthNum}月`,
              span: 1,
              isHighlight: isCurrentMonth
            });
          });

          // 生成上行（季度）
          let currentQuarter = `${getYear(months[0])}-${getQuarter(months[0])}`;
          let quarterStart = 0;
          let quarterCount = 0;

          months.forEach((month, index) => {
            const quarter = `${getYear(month)}-${getQuarter(month)}`;

            if (quarter !== currentQuarter) {
              if (quarterCount > 0) {
                const quarterDate = months[quarterStart];
                const year = getYear(quarterDate);
                const quarterNum = getQuarter(quarterDate);
                const quarterNames = ['', '一季度', '二季度', '三季度', '四季度'];
                upperRow.push({
                  date: quarterDate,
                  label: `${year}.${quarterNames[quarterNum]}`,
                  span: quarterCount
                });
              }
              currentQuarter = quarter;
              quarterStart = index;
              quarterCount = 1;
            } else {
              quarterCount++;
            }
          });

          // 添加最后一个季度
          if (quarterCount > 0) {
            const quarterDate = months[quarterStart];
            const year = getYear(quarterDate);
            const quarterNum = getQuarter(quarterDate);
            const quarterNames = ['', '一季度', '二季度', '三季度', '四季度'];
            upperRow.push({
              date: quarterDate,
              label: `${year}.${quarterNames[quarterNum]}`,
              span: quarterCount
            });
          }

          totalColumns = months.length;
          break;
        }

        case 'week': {
          // 周视图：上行显示月份，下行显示周数
          const weeks: Date[] = [];
          let current = startOfWeek(startDate, { weekStartsOn: 1 });
          const endWeek = startOfWeek(endDate, { weekStartsOn: 1 });

          while (current <= endWeek) {
            weeks.push(current);
            current = addWeeks(current, 1);
          }

          // 生成下行（周数）
          weeks.forEach(week => {
            const { year: weekYear, week: weekNum } = getWeekNumber(week);
            const isCurrentWeek = isWithinInterval(new Date(), { start: week, end: addWeeks(week, 1) });
            lowerRow.push({
              date: week,
              label: `${weekNum}周`,
              span: 1,
              isHighlight: isCurrentWeek
            });
          });

          // 生成上行（月份）- 基于周开始日期的实际年月
          let currentYearMonth = '';
          let monthStart = 0;
          let monthCount = 0;

          weeks.forEach((week, index) => {
            // 使用周开始日期的实际年月来分组
            const actualYear = getYear(week);
            const actualMonth = getMonth(week);
            const yearMonth = `${actualYear}-${actualMonth}`;

            if (yearMonth !== currentYearMonth) {
              if (monthCount > 0) {
                const monthDate = weeks[monthStart];
                const displayYear = getYear(monthDate);
                const displayMonth = getMonth(monthDate);
                upperRow.push({
                  date: monthDate,
                  label: `${displayYear}年${(displayMonth + 1).toString().padStart(2, '0')}月`,
                  span: monthCount
                });
              }
              currentYearMonth = yearMonth;
              monthStart = index;
              monthCount = 1;
            } else {
              monthCount++;
            }
          });

          // 添加最后一个月份
          if (monthCount > 0) {
            const monthDate = weeks[monthStart];
            const displayYear = getYear(monthDate);
            const displayMonth = getMonth(monthDate);
            upperRow.push({
              date: monthDate,
              label: `${displayYear}年${(displayMonth + 1).toString().padStart(2, '0')}月`,
              span: monthCount
            });
          }

          totalColumns = weeks.length;
          break;
        }

        case 'day': {
          // 日视图：上行显示月份，下行显示日期
          const days: Date[] = [];
          let current = startOfDay(startDate);

          while (current <= endDate) {
            days.push(current);
            current = addDays(current, 1);
          }

          // 生成下行（日期）
          days.forEach(day => {
            const dayNum = day.getDate();
            lowerRow.push({
              date: day,
              label: `${dayNum.toString().padStart(2, '0')}日`,
              span: 1,
              isHighlight: isSameDay(day, new Date())
            });
          });

          // 生成上行（月份）
          let currentMonth = `${getYear(days[0])}-${getMonth(days[0])}`;
          let monthStart = 0;
          let monthCount = 0;

          days.forEach((day, index) => {
            const month = `${getYear(day)}-${getMonth(day)}`;

            if (month !== currentMonth) {
              if (monthCount > 0) {
                const monthDate = days[monthStart];
                upperRow.push({
                  date: monthDate,
                  label: `${getYear(monthDate)}年${(getMonth(monthDate) + 1).toString().padStart(2, '0')}月`,
                  span: monthCount
                });
              }
              currentMonth = month;
              monthStart = index;
              monthCount = 1;
            } else {
              monthCount++;
            }
          });

          // 添加最后一个月份
          if (monthCount > 0) {
            const monthDate = days[monthStart];
            upperRow.push({
              date: monthDate,
              label: `${getYear(monthDate)}年${(getMonth(monthDate) + 1).toString().padStart(2, '0')}月`,
              span: monthCount
            });
          }

          totalColumns = days.length;
          break;
        }
      }

      return { upperRow, lowerRow, totalColumns };
    };

    const axisData = generateAxisData();
    setTimeAxisData(axisData);
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

  // 监听时间轴数据变化，在需要时自动滚动到今天
  useEffect(() => {
    if (shouldScrollToToday && timeAxisData.lowerRow.length > 0) {
      setTimeout(() => {
        scrollToToday();
        setShouldScrollToToday(false);
      }, 100);
    }
  }, [timeAxisData, shouldScrollToToday]);

  // 检查今天是否在当前时间范围内
  useEffect(() => {
    const today = new Date();
    const isInRange = today >= startDate && today <= endDate;
    setIsTodayVisible(isInRange);
  }, [startDate, endDate]);

  // 监听时间轴扩展后的滚动位置调整
  useEffect(() => {
    if (pendingScrollAdjustment !== null && timeAxisData.totalColumns > 0) {
      setTimeout(() => {
        const contentElements = document.querySelectorAll('.gantt-content-scroll');

        if (containerRef.current) {
          containerRef.current.scrollLeft = pendingScrollAdjustment;
        }

        contentElements.forEach(el => {
          if (el instanceof HTMLElement) {
            el.scrollLeft = pendingScrollAdjustment;
          }
        });

        setPendingScrollAdjustment(null);
      }, 50);
    }
  }, [timeAxisData, pendingScrollAdjustment]);

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
      case 'halfyear':
        startPos = (getYear(start) - getYear(startDate)) * 12 + getMonth(start) - getMonth(startDate);
        const endMonth = (getYear(end) - getYear(startDate)) * 12 + getMonth(end) - getMonth(startDate);
        duration = endMonth - startPos + 1;
        break;
      case 'quarter':
        const startQuarter = (getYear(start) - getYear(startDate)) * 4 + getQuarter(start) - getQuarter(startDate);
        const endQuarter = (getYear(end) - getYear(startDate)) * 4 + getQuarter(end) - getQuarter(startDate);
        startPos = startQuarter;
        duration = endQuarter - startQuarter + 1;
        break;
      case 'year':
        startPos = getYear(start) - getYear(startDate);
        duration = getYear(end) - getYear(start) + 1;
        break;
    }
    
    const result = {
      left: `${startPos * columnWidth}px`,
      width: `${duration * columnWidth}px`,
    };

    // 调试信息
    if (dateViewMode === 'year') {
      console.log('年视图任务条样式:', {
        itemName: item.name,
        columnWidth,
        startPos,
        duration,
        leftPx: startPos * columnWidth,
        widthPx: duration * columnWidth,
        result
      });
    }

    return result;
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
      case 'halfyear':
        startPos = (getYear(start) - getYear(startDate)) * 12 + getMonth(start) - getMonth(startDate);
        if (item.actualEndDate) {
        const endMonth = (getYear(end) - getYear(startDate)) * 12 + getMonth(end) - getMonth(startDate);
        duration = endMonth - startPos + 1;
        } else {
          duration = 1; // 如果没有结束日期，显示1个月宽度
        }
        break;
      case 'quarter':
        const startQuarter = (getYear(start) - getYear(startDate)) * 4 + getQuarter(start) - getQuarter(startDate);
        if (item.actualEndDate) {
          const endQuarter = (getYear(end) - getYear(startDate)) * 4 + getQuarter(end) - getQuarter(startDate);
          startPos = startQuarter;
          duration = endQuarter - startQuarter + 1;
        } else {
          startPos = startQuarter;
          duration = 1; // 如果没有结束日期，显示1个季度宽度
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

  // 处理工作项列表点击事件（编辑模式）
  const handleItemEditClick = (item: GanttItem) => {
    setSelectedItem(item);
    setIsEditMode(true);

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
      status: item.status || "未开始"
    });

    // 记录当前编辑时的视图模式
    setCurrentEditingViewMode(viewMode);
    setIsDialogOpen(true);
  };

  // 处理甘特图时间区域点击事件（只读模式）
  const handleItemViewClick = (item: GanttItem) => {
    setSelectedItem(item);
    setIsEditMode(false);
    setIsDialogOpen(true);
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedItem || !onUpdateItem) return;

    setIsSubmitting(true);

    try {
      // 构建更新后的工作项
      const updatedItem: GanttItem = {
        ...selectedItem,
        startDate: editForm.plannedStartDate ?
          `${editForm.plannedStartDate}T00:00:00` : null,
        endDate: editForm.plannedEndDate ?
          `${editForm.plannedEndDate}T23:59:59` : null,
        actualStartDate: editForm.actualStartDate ?
          `${editForm.actualStartDate}T00:00:00` : null,
        actualEndDate: editForm.actualEndDate ?
          `${editForm.actualEndDate}T23:59:59` : null,
        status: editForm.status
      };

      // 调用更新回调
      const success = await onUpdateItem(updatedItem);

      if (success) {
        // 关闭对话框
        setIsDialogOpen(false);

        // 根据当前编辑视图设置视图模式，确保在刷新后保留在同一个标签
        if (currentEditingViewMode === 'actual') {
          localStorage.setItem('gantt_view_mode', 'actual');
          setViewMode('actual');
        } else {
          localStorage.setItem('gantt_view_mode', 'planned');
          setViewMode('planned');
        }
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
        const { year: weekYear, week: weekNum } = getWeekNumber(date);
        return (
          <>
            <div>{`${weekYear}年`}</div>
            <div>{`第${weekNum}周`}</div>
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
    const minWidth = getMinColumnWidth(mode);
    switch (mode) {
      case 'day':
        setZoomLevel(1.5);
        setColumnWidth(Math.max(minWidth, 80));
        break;
      case 'week':
        setZoomLevel(1.2);
        setColumnWidth(Math.max(minWidth, 64));
        break;
      case 'month':
        setZoomLevel(1);
        setColumnWidth(Math.max(minWidth, 50));
        break;
      case 'quarter':
        setZoomLevel(0.8);
        setColumnWidth(Math.max(minWidth, 80));
        break;
      case 'halfyear':
        setZoomLevel(0.7);
        setColumnWidth(Math.max(minWidth, 60));
        break;
      case 'year':
        setZoomLevel(0.6);
        setColumnWidth(Math.max(minWidth, 60));
        break;
    }

    // 切换视图模式后，重新计算以今天为中心的时间范围
    const today = new Date();
    let newStartDate: Date;
    let newEndDate: Date;

    // 根据新的视图模式计算合适的时间范围，以今天为中心
    switch (mode) {
      case 'day':
        // 日视图：以今天为中心，前后各显示15天
        newStartDate = startOfDay(addDays(today, -15));
        newEndDate = startOfDay(addDays(today, 15));
        break;
      case 'week':
        // 周视图：以今天所在周为中心，前后各显示8周
        const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        newStartDate = startOfWeek(addWeeks(todayWeekStart, -8), { weekStartsOn: 1 });
        newEndDate = addDays(startOfWeek(addWeeks(todayWeekStart, 8), { weekStartsOn: 1 }), 6);
        break;
      case 'month':
        // 月视图：以今天所在月为中心，前后各显示6个月
        const todayMonthStart = startOfMonth(today);
        newStartDate = startOfMonth(addMonths(todayMonthStart, -6));
        newEndDate = addDays(startOfMonth(addMonths(todayMonthStart, 7)), -1);
        break;
      case 'quarter':
        // 季度视图：以今天所在季度为中心，前后各显示4个季度
        const todayQuarterStart = startOfQuarter(today);
        newStartDate = startOfQuarter(addQuarters(todayQuarterStart, -4));
        newEndDate = addDays(startOfQuarter(addQuarters(todayQuarterStart, 5)), -1);
        break;
      case 'halfyear':
        // 半年视图：以今天所在半年为中心，前后各显示2年
        newStartDate = startOfYear(addYears(today, -2));
        newEndDate = addDays(startOfYear(addYears(today, 3)), -1);
        break;
      case 'year':
        // 年视图：以今天所在年为中心，前后各显示5年
        newStartDate = startOfYear(addYears(today, -5));
        newEndDate = addDays(startOfYear(addYears(today, 6)), -1);
        break;
      default:
        newStartDate = startOfDay(addDays(today, -15));
        newEndDate = startOfDay(addDays(today, 15));
        break;
    }

    setStartDate(newStartDate);
    setEndDate(newEndDate);

    // 标记需要滚动到今天
    setShouldScrollToToday(true);
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
    const scrollWidth = e.currentTarget.scrollWidth;
    const clientWidth = e.currentTarget.clientWidth;

    // 同步时间表头的滚动位置
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

    // 检查是否需要扩展时间范围
    const scrollThreshold = Math.max(100, columnWidth * 2); // 滚动阈值，至少100像素或2个列宽

    // 向前扩展（滚动到最左边）
    if (scrollLeft <= scrollThreshold && !isExtending) {
      extendTimeRangeBackward(scrollLeft);
    }

    // 向后扩展（滚动到最右边）
    if (scrollLeft >= scrollWidth - clientWidth - scrollThreshold && !isExtending) {
      extendTimeRangeForward();
    }

    setLastScrollLeft(scrollLeft);
  };

  // 获取时间表头高度 - 固定为2行
  const getTimeHeaderHeight = () => {
    return 48; // 固定2行: 上级时间单位 + 下级时间单位 (24px * 2)
  };

  // 获取视图模式的最小列宽
  const getMinColumnWidth = (mode: DateViewMode): number => {
    switch (mode) {
      case 'day': return 60; // 日期需要足够宽度显示"01日"
      case 'week': return 50; // 周数需要足够宽度显示"25周"
      case 'month': return 40; // 月份需要足够宽度显示"1月"
      case 'quarter': return 70; // 季度需要足够宽度显示"一季度"
      case 'halfyear': return 30; // 半年视图下月份显示"01"
      case 'year': return 50; // 年份需要足够宽度显示"2025年"
      default: return 40;
    }
  };

  // 获取周数，确保显示正确的年份和周数
  const getWeekNumber = (date: Date): { year: number; week: number } => {
    // 使用ISO周年和ISO周数
    const weekYear = getWeekYear(date, { weekStartsOn: 1 });
    const isoWeek = getISOWeek(date);

    // 调试信息：只在ISO周年与常规年份不一致时输出
    if (process.env.NODE_ENV === 'development') {
      const regularYear = getYear(date);
      const regularWeek = getWeek(date, { weekStartsOn: 1 });

      // 只在ISO周年与常规年份不一致时输出调试信息
      if (weekYear !== regularYear) {
        const dateStr = format(date, 'yyyy-MM-dd');
        console.log(`跨年周检测 - 日期: ${dateStr}, 常规年份: ${regularYear}, 常规周数: ${regularWeek}, ISO周年: ${weekYear}, ISO周数: ${isoWeek}`);
      }
    }

    return {
      year: weekYear,
      week: isoWeek
    };
  };

  // 返回今天 - 重新计算以今天为中心的时间范围
  const goToToday = () => {
    const today = new Date();
    let newStartDate: Date;
    let newEndDate: Date;

    // 根据当前视图模式计算合适的时间范围，以今天为中心
    switch (dateViewMode) {
      case 'day':
        // 日视图：以今天为中心，前后各显示15天
        newStartDate = startOfDay(addDays(today, -15));
        newEndDate = startOfDay(addDays(today, 15));
        break;
      case 'week':
        // 周视图：以今天所在周为中心，前后各显示8周
        const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        newStartDate = startOfWeek(addWeeks(todayWeekStart, -8), { weekStartsOn: 1 });
        newEndDate = addDays(startOfWeek(addWeeks(todayWeekStart, 8), { weekStartsOn: 1 }), 6);
        break;
      case 'month':
        // 月视图：以今天所在月为中心，前后各显示6个月
        const todayMonthStart = startOfMonth(today);
        newStartDate = startOfMonth(addMonths(todayMonthStart, -6));
        newEndDate = addDays(startOfMonth(addMonths(todayMonthStart, 7)), -1);
        break;
      case 'quarter':
        // 季度视图：以今天所在季度为中心，前后各显示4个季度
        const todayQuarterStart = startOfQuarter(today);
        newStartDate = startOfQuarter(addQuarters(todayQuarterStart, -4));
        newEndDate = addDays(startOfQuarter(addQuarters(todayQuarterStart, 5)), -1);
        break;
      case 'halfyear':
        // 半年视图：以今天所在半年为中心，前后各显示2年
        newStartDate = startOfYear(addYears(today, -2));
        newEndDate = addDays(startOfYear(addYears(today, 3)), -1);
        break;
      case 'year':
        // 年视图：以今天所在年为中心，前后各显示5年
        newStartDate = startOfYear(addYears(today, -5));
        newEndDate = addDays(startOfYear(addYears(today, 6)), -1);
        break;
      default:
        newStartDate = startOfDay(addDays(today, -15));
        newEndDate = startOfDay(addDays(today, 15));
        break;
    }

    setStartDate(newStartDate);
    setEndDate(newEndDate);

    // 标记需要滚动到今天
    setShouldScrollToToday(true);
  };

  // 滚动到今天的位置
  const scrollToToday = () => {
    if (!containerRef.current || !scrollContainerRef.current) return;

    // 找到今天在时间轴中的位置
    const todayIndex = timeAxisData.lowerRow.findIndex(cell => cell.isHighlight);

    if (todayIndex >= 0) {
      // 计算今天的位置（像素）
      const todayPosition = todayIndex * columnWidth;

      // 获取容器宽度
      const containerWidth = containerRef.current.offsetWidth;

      // 计算滚动位置，使今天位于中间
      const scrollPosition = Math.max(0, todayPosition - containerWidth / 2);

      // 同步滚动所有相关容器
      containerRef.current.scrollLeft = scrollPosition;

      // 同步甘特图内容区域的滚动
      const contentElements = document.querySelectorAll('.gantt-content-scroll');
      contentElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.scrollLeft = scrollPosition;
        }
      });
    }
  };

  // 向前扩展时间范围（更早的日期）
  const extendTimeRangeBackward = (currentScrollLeft: number) => {
    if (isExtending) return;
    setIsExtending(true);
    setShowExtendingHint('正在加载更早的日期...');

    // 记录当前的时间轴长度和滚动位置
    const currentTimeAxisLength = timeAxisData.totalColumns;

    let extensionAmount: Date;
    let expectedNewColumns: number;

    switch (dateViewMode) {
      case 'day':
        extensionAmount = addDays(startDate, -30); // 向前扩展30天
        expectedNewColumns = 30;
        break;
      case 'week':
        extensionAmount = addWeeks(startDate, -12); // 向前扩展12周
        expectedNewColumns = 12;
        break;
      case 'month':
        extensionAmount = addMonths(startDate, -6); // 向前扩展6个月
        expectedNewColumns = 6;
        break;
      case 'quarter':
        extensionAmount = addQuarters(startDate, -4); // 向前扩展4个季度
        expectedNewColumns = 4;
        break;
      case 'halfyear':
        extensionAmount = addYears(startDate, -2); // 向前扩展2年
        expectedNewColumns = 24; // 2年 * 12个月
        break;
      case 'year':
        extensionAmount = addYears(startDate, -5); // 向前扩展5年
        expectedNewColumns = 5;
        break;
      default:
        extensionAmount = addDays(startDate, -30);
        expectedNewColumns = 30;
        break;
    }

    // 计算新的滚动位置
    const scrollOffset = expectedNewColumns * columnWidth;
    const newScrollLeft = currentScrollLeft + scrollOffset;

    // 设置待处理的滚动调整
    setPendingScrollAdjustment(Math.max(0, newScrollLeft));

    setStartDate(extensionAmount);

    // 延迟重置扩展状态，避免频繁触发
    setTimeout(() => {
      setIsExtending(false);
      setShowExtendingHint(null);
    }, 1000);
  };

  // 向后扩展时间范围（更晚的日期）
  const extendTimeRangeForward = () => {
    if (isExtending) return;
    setIsExtending(true);
    setShowExtendingHint('正在加载更晚的日期...');

    let extensionAmount: Date;

    switch (dateViewMode) {
      case 'day':
        extensionAmount = addDays(endDate, 30); // 向后扩展30天
        break;
      case 'week':
        extensionAmount = addWeeks(endDate, 12); // 向后扩展12周
        break;
      case 'month':
        extensionAmount = addMonths(endDate, 6); // 向后扩展6个月
        break;
      case 'quarter':
        extensionAmount = addQuarters(endDate, 4); // 向后扩展4个季度
        break;
      case 'halfyear':
        extensionAmount = addYears(endDate, 2); // 向后扩展2年
        break;
      case 'year':
        extensionAmount = addYears(endDate, 5); // 向后扩展5年
        break;
      default:
        extensionAmount = addDays(endDate, 30);
        break;
    }

    setEndDate(extensionAmount);

    // 延迟重置扩展状态，避免频繁触发
    setTimeout(() => {
      setIsExtending(false);
      setShowExtendingHint(null);
    }, 1000);
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
          {/* 返回今天按钮 */}
          <button
            className={`px-3 py-1 text-xs rounded flex items-center gap-1 shadow-sm transition-all ${
              isTodayVisible
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-orange-500 text-white hover:bg-orange-600 animate-pulse'
            }`}
            onClick={goToToday}
            title={isTodayVisible ? "今天在当前视图中，点击居中显示" : "今天不在当前视图中，点击返回今天"}
          >
            <Target className="h-3 w-3" />
            今天
            {!isTodayVisible && <span className="ml-1 text-xs">!</span>}
          </button>

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
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'quarter' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('quarter')}
          >
            季度
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${dateViewMode === 'halfyear' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => changeDateViewMode('halfyear')}
          >
            半年
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

                // 根据当前视图模式和缩放级别计算列宽
                let baseWidth = 50;
                switch (dateViewMode) {
                  case 'day': baseWidth = 80; break;
                  case 'week': baseWidth = 64; break;
                  case 'month': baseWidth = 50; break;
                  case 'quarter': baseWidth = 80; break;
                  case 'halfyear': baseWidth = 60; break;
                  case 'year': baseWidth = 60; break;
                }
                const minWidth = getMinColumnWidth(dateViewMode);
                setColumnWidth(Math.max(minWidth, baseWidth * newZoomLevel));

                // 根据缩放级别自动切换日期视图模式
                if (newZoomLevel < 0.65 && dateViewMode !== 'year') {
                  changeDateViewMode('year');
                } else if (newZoomLevel < 0.75 && newZoomLevel >= 0.65 && dateViewMode !== 'halfyear') {
                  changeDateViewMode('halfyear');
                } else if (newZoomLevel < 0.9 && newZoomLevel >= 0.75 && dateViewMode !== 'quarter') {
                  changeDateViewMode('quarter');
                } else if (newZoomLevel < 1.1 && newZoomLevel >= 0.9 && dateViewMode !== 'month') {
                  changeDateViewMode('month');
                } else if (newZoomLevel < 1.4 && newZoomLevel >= 1.1 && dateViewMode !== 'week') {
                  changeDateViewMode('week');
                } else if (newZoomLevel >= 1.4 && dateViewMode !== 'day') {
                  changeDateViewMode('day');
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

                // 根据当前视图模式和缩放级别计算列宽
                let baseWidth = 50;
                switch (dateViewMode) {
                  case 'day': baseWidth = 80; break;
                  case 'week': baseWidth = 64; break;
                  case 'month': baseWidth = 50; break;
                  case 'quarter': baseWidth = 80; break;
                  case 'halfyear': baseWidth = 60; break;
                  case 'year': baseWidth = 60; break;
                }
                const minWidth = getMinColumnWidth(dateViewMode);
                setColumnWidth(Math.max(minWidth, baseWidth * newZoomLevel));

                // 根据缩放级别自动切换日期视图模式
                if (newZoomLevel < 0.65 && dateViewMode !== 'year') {
                  changeDateViewMode('year');
                } else if (newZoomLevel < 0.75 && newZoomLevel >= 0.65 && dateViewMode !== 'halfyear') {
                  changeDateViewMode('halfyear');
                } else if (newZoomLevel < 0.9 && newZoomLevel >= 0.75 && dateViewMode !== 'quarter') {
                  changeDateViewMode('quarter');
                } else if (newZoomLevel < 1.1 && newZoomLevel >= 0.9 && dateViewMode !== 'month') {
                  changeDateViewMode('month');
                } else if (newZoomLevel < 1.4 && newZoomLevel >= 1.1 && dateViewMode !== 'week') {
                  changeDateViewMode('week');
                } else if (newZoomLevel >= 1.4 && dateViewMode !== 'day') {
                  changeDateViewMode('day');
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
          <div className="flex-1 overflow-hidden relative">
            {/* 扩展提示 */}
            {showExtendingHint && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-blue-500 text-white px-3 py-1 rounded-md text-xs shadow-lg">
                {showExtendingHint}
              </div>
            )}

            <div
              className="bg-gray-100 border-b border-gray-200 overflow-hidden"
              ref={containerRef}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div style={{ width: `${timeAxisData.totalColumns * columnWidth}px` }} className="relative">
                {/* 时间轴垂直分割线 - 连续的整体线 */}
                {timeAxisData.lowerRow.map((_, index) => {
                  // 跳过最后一条线，避免在右边缘显示
                  if (index === timeAxisData.lowerRow.length - 1) return null;

                  return (
                    <div
                      key={`header-grid-line-${index}`}
                      className="absolute top-0 bottom-0 w-px bg-gray-200 z-5"
                      style={{
                        left: `${(index + 1) * columnWidth}px`
                      }}
                    ></div>
                  );
                })}

                {/* 左侧无限滚动提示 */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-200/80 to-transparent z-10 flex items-center justify-center">
                  <ChevronLeft className="h-3 w-3 text-gray-500" />
                </div>

                {/* 右侧无限滚动提示 */}
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-200/80 to-transparent z-10 flex items-center justify-center">
                  <ChevronRight className="h-3 w-3 text-gray-500" />
                </div>

                {/* 上级时间单位行 */}
                <div className="flex border-b border-gray-200 bg-blue-50/30">
                  {timeAxisData.upperRow.map((cell, index) => (
                    <div
                      key={`upper-${index}`}
                      className={`flex-shrink-0 py-1 text-xs font-medium text-center whitespace-nowrap overflow-hidden ${
                        cell.isHighlight ? 'bg-blue-100 text-blue-600' : ''
                      }`}
                      style={{
                        width: `${cell.span * columnWidth}px`,
                        height: '24px'
                      }}
                      title={cell.label} // 添加tooltip以防文字被截断
                    >
                      {cell.label}
                    </div>
                  ))}
                </div>

                {/* 下级时间单位行 */}
                <div className="flex bg-green-50/30">
                  {timeAxisData.lowerRow.map((cell, index) => (
                    <div
                      key={`lower-${index}`}
                      className={`flex-shrink-0 py-1 text-xs font-medium text-center whitespace-nowrap overflow-hidden ${
                        cell.isHighlight ? 'bg-blue-100 text-blue-600' : index % 2 === 0 ? 'bg-gray-50/30' : ''
                      }`}
                      style={{
                        width: `${cell.span * columnWidth}px`,
                        height: '24px'
                      }}
                      title={cell.label} // 添加tooltip以防文字被截断
                    >
                      {cell.label}
                    </div>
                  ))}
                </div>
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
                  onClick={() => handleItemEditClick(item)}
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
              <div style={{ width: `${timeAxisData.totalColumns * columnWidth}px` }}>
            <div className="relative">
              {/* 垂直分割线 - 连续的整体线 */}
              {timeAxisData.lowerRow.map((_, index) => {
                // 跳过最后一条线，避免在右边缘显示
                if (index === timeAxisData.lowerRow.length - 1) return null;

                return (
                  <div
                    key={`grid-line-${index}`}
                    className="absolute top-0 w-px bg-gray-200 z-5"
                    style={{
                      left: `${(index + 1) * columnWidth}px`,
                      height: `${visibleItems.length * 40}px`
                    }}
                  ></div>
                );
              })}

              {/* 今天的垂直线 */}
              {(() => {
                const todayIndex = timeAxisData.lowerRow.findIndex(cell => cell.isHighlight);
                return todayIndex >= 0 ? (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                    style={{
                      left: `${todayIndex * columnWidth + columnWidth / 2}px`,
                      height: `${visibleItems.length * 40}px`
                    }}
                  ></div>
                ) : null;
              })()}
              
                  {/* 行和任务条 */}
                  {visibleItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex border-b border-gray-100 relative"
                  style={{ height: '40px' }}
                  onClick={() => handleItemViewClick(item)}
                >
                  {/* 背景网格 */}
                  {timeAxisData.lowerRow.map((cell, dateIndex) => {
                    // 根据不同视图模式设置背景色
                    let bgClass = '';

                    // 高亮当前时间单位
                    if (cell.isHighlight) {
                      bgClass = 'bg-blue-50/20';
                    }
                    // 奇偶行背景
                    else if (dateIndex % 2 === 0) {
                      bgClass = 'bg-gray-50/30';
                    }

                    return (
                      <div
                        key={dateIndex}
                        className={`flex-shrink-0 h-full ${bgClass}`}
                        style={{ width: `${columnWidth}px` }}
                      ></div>
                    );
                  })}
                  
                      {/* 计划任务条 */}
                      {viewMode === 'planned' && getBarPosition(item) && (
                    <div 
                      className="absolute top-2 h-6 rounded-sm bg-blue-100 border border-blue-300 z-20 flex items-center px-2 cursor-pointer hover:bg-blue-200"
                      style={{
                        ...getBarPosition(item),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemViewClick(item);
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
                        handleItemViewClick(item);
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
            <div style={{ width: `${timeAxisData.totalColumns * columnWidth}px`, height: '1px' }}></div>
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
              {isEditMode ? '编辑工作项: ' : ''}{selectedItem?.name}
            </DialogTitle>
            <DialogDescription>
              {isEditMode ? '修改工作项的状态和时间信息' : '工作项详细信息'}
            </DialogDescription>
          </DialogHeader>

          {/* 可滚动的内容区域 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isEditMode ? (
              /* 编辑模式 */
              <form onSubmit={handleSubmit} className="space-y-4">
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
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={editForm.plannedEndDate}
                        onChange={(e) => setEditForm({...editForm, plannedEndDate: e.target.value})}
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
                    <option value="未开始">未开始</option>
                    <option value="进行中">进行中</option>
                    <option value="已暂停">已暂停</option>
                    <option value="已完成">已完成</option>
                  </select>
                </div>
              </form>
            ) : (
              /* 只读模式 */
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
            )}
          </div>

          {/* 固定的底部按钮区域 */}
          <DialogFooter className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
            {isEditMode ? (
              <>
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
                  onClick={handleSubmit}
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                onClick={() => setIsDialogOpen(false)}
              >
                关闭
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GanttChart; 