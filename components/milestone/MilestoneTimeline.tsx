"use client";

import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { getMilestoneStatusStyle } from '@/lib/utils/status-colors';

interface MilestoneData {
  id: string;
  name: string;
  planned_end_time?: string | null;
  actual_end_time?: string | null;
  status: string;
}

interface MilestoneTimelineProps {
  milestones: MilestoneData[];
  className?: string;
}

const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({
  milestones,
  className = ""
}) => {
  // 折叠状态，默认展开
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 如果没有里程碑数据，显示空状态
  if (!milestones || milestones.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">里程碑时间轴</h3>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-600" />
            )}
          </button>
        </div>
        {!isCollapsed && (
          <div className="text-center text-gray-500 py-4">
            <p>暂无里程碑数据</p>
          </div>
        )}
      </div>
    );
  }

  // 格式化日期显示
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return null;
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return null;
      return format(date, 'MM/dd', { locale: zhCN });
    } catch {
      return null;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 ${className}`}>
      {/* 标题和折叠按钮 */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-lg font-semibold text-gray-900">里程碑时间轴</h3>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5 text-gray-600" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* 时间轴内容 - 支持折叠 */}
      {!isCollapsed && (
        <div className="relative">
          {/* 横向滚动容器 */}
          <div className="overflow-x-auto pb-1">
            {/* 时间轴容器 */}
            <div className="relative" style={{ minWidth: `${milestones.length * 180}px` }}>
              {/* 里程碑节点 */}
              <div className="flex items-center w-full px-2">
                {milestones.map((milestone, index) => {
                  const style = getMilestoneStatusStyle(milestone.status);
                  const plannedDate = formatDate(milestone.planned_end_time);
                  const actualDate = formatDate(milestone.actual_end_time);
                  const isLast = index === milestones.length - 1;

                  return (
                    <React.Fragment key={milestone.id}>
                      {/* 里程碑节点 */}
                      <div
                        className="flex flex-col items-center relative z-10"
                        style={{
                          flex: milestones.length <= 3 ? '1' : 'none',
                          minWidth: '140px'
                        }}
                      >
                      {/* 里程碑圆点 */}
                      <div className={`w-3 h-3 rounded-full ${style.dotColor} border-2 border-white shadow-sm mb-2`}></div>

                      {/* 里程碑信息卡片 */}
                      <div className={`${style.bgColor} rounded-md p-2 border border-gray-200 shadow-sm w-full max-w-[140px] sm:max-w-[160px]`}>
                        {/* 里程碑名称 */}
                        <div className={`font-medium text-xs ${style.textColor} mb-1 text-center truncate`} title={milestone.name}>
                          🏁 {milestone.name}
                        </div>

                        {/* 时间信息 */}
                        <div className="space-y-0.5 text-xs">
                          {/* 计划完成时间 */}
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 text-xs">计划:</span>
                            <span className={`text-xs ${plannedDate ? 'text-gray-700' : 'text-gray-400'}`}>
                              {plannedDate || '未设置'}
                            </span>
                          </div>

                          {/* 实际完成时间 */}
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 text-xs">实际:</span>
                            <span className={`text-xs ${actualDate ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                              {actualDate || '未完成'}
                            </span>
                          </div>
                        </div>

                        {/* 状态标识 */}
                        <div className="mt-1 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${
                            milestone.status === '已完成'
                              ? 'bg-green-100 text-green-800'
                              : milestone.status === '进行中'
                              ? 'bg-blue-100 text-blue-800'
                              : milestone.status === '已暂停'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {milestone.status}
                          </span>
                        </div>
                      </div>
                      </div>

                      {/* 箭头连线 - 除了最后一个节点 */}
                      {!isLast && (
                        <div className="flex items-center justify-center px-1 flex-shrink-0">
                          <div className="flex items-center">
                            <div className="w-6 h-0.5 bg-gray-400"></div>
                            <div className="w-0 h-0 border-l-[6px] border-l-gray-500 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent"></div>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 图例说明 */}
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-600 justify-center">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>已完成</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span>进行中</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span>已暂停</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-gray-400"></div>
              <span>未开始</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MilestoneTimeline;