import React from 'react';
import { 
  formatProgressText, 
  getProgressColorClass, 
  getProgressBarColorClass 
} from '@/lib/utils/progress-calculator';

interface ProgressIndicatorProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
  showText?: boolean;
  className?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  size = 'md',
  showBar = true,
  showText = true,
  className = ''
}) => {
  const progressColorClass = getProgressColorClass(progress);
  const progressBarColorClass = getProgressBarColorClass(progress);
  
  // 根据大小设置样式
  const sizeClasses = {
    sm: {
      badge: 'px-1.5 py-0.5 text-xs',
      bar: 'h-1',
      container: 'gap-1'
    },
    md: {
      badge: 'px-2 py-1 text-xs',
      bar: 'h-2',
      container: 'gap-2'
    },
    lg: {
      badge: 'px-3 py-1.5 text-sm',
      bar: 'h-3',
      container: 'gap-3'
    }
  };
  
  const currentSize = sizeClasses[size];
  
  return (
    <div className={`flex items-center ${currentSize.container} ${className}`}>
      {/* 进度文本标签 */}
      {showText && (
        <span 
          className={`inline-flex items-center rounded-full border font-medium ${progressColorClass} ${currentSize.badge}`}
          title={`工作进度: ${formatProgressText(progress)}`}
        >
          {formatProgressText(progress)}
        </span>
      )}
      
      {/* 进度条 */}
      {showBar && (
        <div className="flex-1 min-w-[60px] max-w-[120px]">
          <div className={`w-full bg-gray-200 rounded-full ${currentSize.bar} overflow-hidden`}>
            <div 
              className={`${currentSize.bar} ${progressBarColorClass} transition-all duration-300 ease-out rounded-full`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;
