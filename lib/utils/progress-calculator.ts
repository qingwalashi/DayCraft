// 工作状态对应的进度值
export const STATUS_PROGRESS_MAP = {
  '未开始': 0,
  '已暂停': 25,
  '进行中': 50,
  '已完成': 100,
} as const;

export type WorkStatus = keyof typeof STATUS_PROGRESS_MAP;

// 工作项接口（简化版，用于进度计算）
export interface ProgressWorkItem {
  id: string;
  status?: string;
  children?: ProgressWorkItem[];
}

/**
 * 获取工作状态对应的进度值
 * @param status 工作状态
 * @returns 进度值 (0-100)
 */
export function getStatusProgress(status?: string): number {
  if (!status || !(status in STATUS_PROGRESS_MAP)) {
    return 0; // 默认未开始
  }
  return STATUS_PROGRESS_MAP[status as WorkStatus];
}

/**
 * 计算工作项的总体进度
 * 规则：工作项的进度等于下级工作进展的加权平均值与当前工作项工作状态对应取值的大值
 * @param workItem 工作项
 * @returns 进度值 (0-100)
 */
export function calculateWorkItemProgress(workItem: ProgressWorkItem): number {
  // 获取当前工作项状态对应的进度值
  const statusProgress = getStatusProgress(workItem.status);
  
  // 如果没有子项，直接返回状态对应的进度
  if (!workItem.children || workItem.children.length === 0) {
    return statusProgress;
  }
  
  // 计算子项的加权平均进度
  let totalProgress = 0;
  let totalWeight = workItem.children.length;
  
  for (const child of workItem.children) {
    const childProgress = calculateWorkItemProgress(child);
    totalProgress += childProgress;
  }
  
  const averageChildProgress = totalWeight > 0 ? totalProgress / totalWeight : 0;
  
  // 返回子项平均进度与当前状态进度的最大值
  return Math.max(statusProgress, averageChildProgress);
}

/**
 * 批量计算工作项列表的进度
 * @param workItems 工作项列表
 * @returns 包含进度信息的工作项列表
 */
export function calculateProgressForWorkItems<T extends ProgressWorkItem>(
  workItems: T[]
): (T & { calculatedProgress: number })[] {
  return workItems.map(item => ({
    ...item,
    calculatedProgress: calculateWorkItemProgress(item),
    children: item.children ? calculateProgressForWorkItems(item.children) : undefined
  }));
}

/**
 * 获取进度对应的颜色类名
 * @param progress 进度值 (0-100)
 * @returns Tailwind CSS 类名
 */
export function getProgressColorClass(progress: number): string {
  if (progress === 0) {
    return 'bg-gray-200 text-gray-800';
  } else if (progress < 50) {
    return 'bg-yellow-200 text-yellow-800';
  } else if (progress < 100) {
    return 'bg-blue-200 text-blue-800';
  } else {
    return 'bg-green-200 text-green-800';
  }
}

/**
 * 获取进度条的颜色类名
 * @param progress 进度值 (0-100)
 * @returns Tailwind CSS 类名
 */
export function getProgressBarColorClass(progress: number): string {
  if (progress === 0) {
    return 'bg-gray-400';
  } else if (progress < 50) {
    return 'bg-yellow-400';
  } else if (progress < 100) {
    return 'bg-blue-400';
  } else {
    return 'bg-green-400';
  }
}

/**
 * 格式化进度显示文本
 * @param progress 进度值 (0-100)
 * @returns 格式化的进度文本
 */
export function formatProgressText(progress: number): string {
  return `${Math.round(progress)}%`;
}
