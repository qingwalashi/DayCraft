/**
 * 工作状态颜色配置
 * 确保在所有组件中使用一致的状态颜色
 */

export interface StatusColorConfig {
  value: string;
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

// 工作状态选项和颜色配置
export const STATUS_OPTIONS: StatusColorConfig[] = [
  { 
    value: '未开始', 
    color: 'bg-gray-200 text-gray-800 border-gray-300',
    bgColor: 'bg-gray-200',
    textColor: 'text-gray-800',
    borderColor: 'border-gray-300'
  },
  { 
    value: '进行中', 
    color: 'bg-blue-200 text-blue-800 border-blue-300',
    bgColor: 'bg-blue-200',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300'
  },
  { 
    value: '已暂停', 
    color: 'bg-yellow-200 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-200',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300'
  },
  { 
    value: '已完成', 
    color: 'bg-green-200 text-green-800 border-green-300',
    bgColor: 'bg-green-200',
    textColor: 'text-green-800',
    borderColor: 'border-green-300'
  },
];

/**
 * 根据状态值获取颜色配置
 * @param status 状态值
 * @returns 颜色配置对象
 */
export const getStatusColor = (status: string): StatusColorConfig => {
  const config = STATUS_OPTIONS.find(option => option.value === status);
  return config || STATUS_OPTIONS[0]; // 默认返回"未开始"的配置
};

/**
 * 获取状态标签的完整CSS类名
 * @param status 状态值
 * @returns CSS类名字符串
 */
export const getStatusBadgeClass = (status: string): string => {
  const config = getStatusColor(status);
  return `${config.bgColor} ${config.textColor} border ${config.borderColor}`;
};



/**
 * 里程碑状态样式配置
 * 用于里程碑时间轴组件
 */
export interface MilestoneStatusStyle {
  dotColor: string;
  lineColor: string;
  textColor: string;
  bgColor: string;
}

/**
 * 获取里程碑状态样式
 * @param status 状态值
 * @returns 里程碑样式配置
 */
export const getMilestoneStatusStyle = (status: string): MilestoneStatusStyle => {
  switch (status) {
    case '已完成':
      return {
        dotColor: 'bg-green-500',
        lineColor: 'bg-green-200',
        textColor: 'text-green-700',
        bgColor: 'bg-green-50'
      };
    case '进行中':
      return {
        dotColor: 'bg-blue-500',
        lineColor: 'bg-blue-200',
        textColor: 'text-blue-700',
        bgColor: 'bg-blue-50'
      };
    case '已暂停':
      return {
        dotColor: 'bg-yellow-500',
        lineColor: 'bg-yellow-200',
        textColor: 'text-yellow-700',
        bgColor: 'bg-yellow-50'
      };
    case '未开始':
    default:
      return {
        dotColor: 'bg-gray-400',
        lineColor: 'bg-gray-200',
        textColor: 'text-gray-600',
        bgColor: 'bg-gray-50'
      };
  }
};
