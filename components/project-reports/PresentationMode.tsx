'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  XIcon, 
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  FullscreenIcon,
  MinimizeIcon
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  code: string;
  is_active?: boolean;
}

interface ProjectWeeklyReportItemData {
  id: string;
  content: string;
  projects?: Project;
  work_breakdown_items?: {
    id: string;
    name: string;
    level?: number;
    parent_id?: string;
  };
  project_name?: string;
  project_code?: string;
  work_item_name?: string;
  work_item_path?: string;
}

interface WorkItemHierarchy {
  id: string;
  name: string;
  level: number;
  parent_id?: string;
  children: WorkItemHierarchy[];
  items: ProjectWeeklyReportItemData[];
  fullPath: string;
}

interface GroupedProjectData {
  project: Project;
  items: ProjectWeeklyReportItemData[];
  workItems: {
    [workItemId: string]: {
      workItem: {
        id: string;
        name: string;
        level?: number;
        parent_id?: string;
      };
      items: ProjectWeeklyReportItemData[];
      mergedContent: string;
    };
  };
  directItems: ProjectWeeklyReportItemData[];
  workItemsHierarchy: WorkItemHierarchy[];
}

interface PresentationSlide {
  type: 'title' | 'project' | 'workItem' | 'summary';
  title: string;
  subtitle?: string;
  content?: string[];
  projectData?: GroupedProjectData;
  workItemData?: {
    workItem: {
      id: string;
      name: string;
      level?: number;
      parent_id?: string;
    };
    items: ProjectWeeklyReportItemData[];
    mergedContent: string;
  };
}

interface PresentationModeProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: GroupedProjectData[];
  reportPeriod: string;
  isPlan?: boolean;
}

export default function PresentationMode({
  isOpen,
  onClose,
  reportData,
  reportPeriod,
  isPlan = false
}: PresentationModeProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // 生成幻灯片数据
  const generateSlides = useCallback(() => {
    const newSlides: PresentationSlide[] = [];

    // 安全检查：确保必要的数据存在
    if (!reportPeriod || !Array.isArray(reportData)) {
      return;
    }

    // 标题页
    newSlides.push({
      type: 'title',
      title: `${reportPeriod} 项目${isPlan ? '计划' : '周报'}`,
      subtitle: `共 ${reportData.length} 个项目`,
    });

    // 为每个项目生成幻灯片
    reportData.forEach((projectData) => {
      // 安全检查：确保项目数据存在
      if (!projectData || !projectData.project) {
        return;
      }

      // 项目概览页
      newSlides.push({
        type: 'project',
        title: projectData.project.name || '未知项目',
        subtitle: `项目代码: ${projectData.project.code || '无'}`,
        projectData,
      });

      // 为每个工作项生成幻灯片
      if (projectData.workItems) {
        Object.values(projectData.workItems).forEach((workItemData) => {
          if (workItemData && workItemData.items && workItemData.items.length > 0) {
            newSlides.push({
              type: 'workItem',
              title: workItemData.workItem?.name || '未知工作项',
              subtitle: `${projectData.project.name}`,
              workItemData,
            });
          }
        });
      }

      // 直接项目工作项
      if (projectData.directItems && projectData.directItems.length > 0) {
        newSlides.push({
          type: 'workItem',
          title: '其他工作内容',
          subtitle: `${projectData.project.name}`,
          content: projectData.directItems.map(item => item?.content || '').filter(Boolean),
        });
      }
    });

    // 总结页
    const totalWorkItems = reportData.reduce((total, project) => {
      return total + Object.keys(project.workItems).length + (project.directItems.length > 0 ? 1 : 0);
    }, 0);

    newSlides.push({
      type: 'summary',
      title: '汇报总结',
      content: [
        `本周期共涉及 ${reportData.length} 个项目`,
        `完成 ${totalWorkItems} 项工作内容`,
        isPlan ? '以上为下周工作计划' : '感谢聆听！'
      ],
    });

    setSlides(newSlides);
  }, [reportData, reportPeriod, isPlan]);

  // 初始化幻灯片
  useEffect(() => {
    if (isOpen) {
      if (reportData && reportData.length > 0) {
        generateSlides();
      } else {
        // 如果没有数据，创建一个空状态的幻灯片
        setSlides([{
          type: 'title',
          title: '暂无数据',
          subtitle: '当前周期没有项目周报数据',
        }]);
      }
      setCurrentSlide(0);
    }
  }, [isOpen, reportData, generateSlides]);

  // 定义回调函数
  const goToNextSlide = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev < slides.length - 1) {
        return prev + 1;
      }
      return prev; // 在最后一张幻灯片时保持不变
    });
  }, [slides.length]);

  const goToPreviousSlide = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev; // 在第一张幻灯片时保持不变
    });
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setIsAutoPlay(!isAutoPlay);
  }, [isAutoPlay]);

  const resetPresentation = useCallback(() => {
    setCurrentSlide(0);
    setIsAutoPlay(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // 自动播放
  useEffect(() => {
    if (isAutoPlay && slides.length > 0) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => {
          if (prev < slides.length - 1) {
            return prev + 1;
          } else {
            // 到达最后一张幻灯片时停止自动播放
            setIsAutoPlay(false);
            return prev;
          }
        });
      }, 5000); // 5秒切换一次

      return () => clearInterval(timer);
    }
  }, [isAutoPlay, slides.length]);

  // 键盘导航
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPreviousSlide();
          break;
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goToNextSlide();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setCurrentSlide(0);
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          toggleAutoPlay();
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }
  }, [isOpen, goToPreviousSlide, goToNextSlide, onClose, toggleAutoPlay, toggleFullscreen]);

  // 触摸手势处理
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNextSlide();
    } else if (isRightSwipe) {
      goToPreviousSlide();
    }
  };

  if (!isOpen || slides.length === 0) return null;

  const currentSlideData = slides[currentSlide];

  // 安全检查：确保当前幻灯片数据存在
  if (!currentSlideData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-[95vw] h-[100vh] md:h-[95vh] p-0 bg-gradient-to-br from-blue-50 to-indigo-100 [&>button]:hidden rounded-none md:rounded-xl overflow-hidden w-full"
      >
        <div className="flex flex-col h-full">
          {/* 控制栏 */}
          <div className="flex items-center justify-between p-2 md:p-4 bg-white/80 backdrop-blur-sm border-b">
            {/* 移动端：简化的控制栏 */}
            <div className="flex md:hidden items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-600">
                  {currentSlide + 1} / {slides.length}
                </span>
                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousSlide}
                  disabled={currentSlide === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeftIcon className="h-3 w-3" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAutoPlay}
                  className="h-8 w-8 p-0"
                >
                  {isAutoPlay ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextSlide}
                  disabled={currentSlide === slides.length - 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRightIcon className="h-3 w-3" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* 桌面端：完整的控制栏 */}
            <div className="hidden md:flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-600">
                {currentSlide + 1} / {slides.length}
              </span>
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 hidden lg:block">
                快捷键: ← → 翻页 | 空格 下一页 | P 自动播放 | F 全屏 | R 重置 | ESC 退出
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousSlide}
                disabled={currentSlide === 0}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleAutoPlay}
              >
                {isAutoPlay ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={resetPresentation}
              >
                <RotateCcwIcon className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <MinimizeIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={goToNextSlide}
                disabled={currentSlide === slides.length - 1}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 幻灯片内容 */}
          <div
            className="flex-1 flex items-center justify-center p-3 md:p-8 overflow-y-auto"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="w-full max-w-4xl">
              {currentSlideData.type === 'title' && (
                <div className="text-center">
                  <div className="mb-4 md:mb-8">
                    <div className="w-12 md:w-20 h-0.5 md:h-1 bg-blue-600 mx-auto mb-3 md:mb-6"></div>
                    <h1 className="text-2xl md:text-5xl lg:text-6xl font-bold text-gray-800 mb-3 md:mb-6 leading-tight px-2">
                      {currentSlideData.title}
                    </h1>
                    <div className="w-12 md:w-20 h-0.5 md:h-1 bg-blue-600 mx-auto mb-3 md:mb-6"></div>
                  </div>
                  <p className="text-base md:text-xl lg:text-2xl text-gray-600 font-light px-4">
                    {currentSlideData.subtitle}
                  </p>
                  <div className="mt-4 md:mt-8 text-xs md:text-sm text-gray-500">
                    {new Date().toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              )}

              {currentSlideData.type === 'project' && currentSlideData.projectData && (
                <div>
                  <div className="text-center mb-4 md:mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-blue-600 text-white rounded-full mb-2 md:mb-4">
                      <span className="text-lg md:text-2xl font-bold">
                        {currentSlideData.title.charAt(0)}
                      </span>
                    </div>
                    <h1 className="text-xl md:text-4xl lg:text-5xl font-bold text-blue-800 mb-1 md:mb-2 px-2">
                      {currentSlideData.title}
                    </h1>
                    <p className="text-sm md:text-lg text-gray-600 px-4">
                      {currentSlideData.subtitle}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    <div className="bg-white/70 rounded-xl p-4 md:p-6 backdrop-blur-sm shadow-lg">
                      <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4 flex items-center">
                        <div className="w-1 h-4 md:h-6 bg-blue-600 mr-2 md:mr-3"></div>
                        工作项概览
                      </h3>
                      <ul className="space-y-2 md:space-y-3 max-h-48 md:max-h-none overflow-y-auto">
                        {Object.values(currentSlideData.projectData.workItems).slice(0, 6).map((workItem, index) => (
                          <li key={index} className="flex items-center text-gray-700">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-400 rounded-full mr-2 md:mr-3 flex-shrink-0"></div>
                            <span className="text-xs md:text-sm">{workItem.workItem.name}</span>
                          </li>
                        ))}
                        {Object.keys(currentSlideData.projectData.workItems).length > 6 && (
                          <li className="text-gray-500 text-xs md:text-sm italic">
                            ... 还有 {Object.keys(currentSlideData.projectData.workItems).length - 6} 项工作内容
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className="bg-white/70 rounded-xl p-4 md:p-6 backdrop-blur-sm shadow-lg">
                      <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4 flex items-center">
                        <div className="w-1 h-4 md:h-6 bg-green-600 mr-2 md:mr-3"></div>
                        统计信息
                      </h3>
                      <div className="space-y-3 md:space-y-4">
                        <div className="flex justify-between items-center p-2 md:p-3 bg-blue-50 rounded-lg">
                          <span className="text-xs md:text-sm text-gray-700">工作项数量</span>
                          <span className="text-lg md:text-2xl font-bold text-blue-600">
                            {Object.keys(currentSlideData.projectData.workItems).length}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-2 md:p-3 bg-green-50 rounded-lg">
                          <span className="text-xs md:text-sm text-gray-700">直接工作内容</span>
                          <span className="text-lg md:text-2xl font-bold text-green-600">
                            {currentSlideData.projectData.directItems.length}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-2 md:p-3 bg-purple-50 rounded-lg">
                          <span className="text-xs md:text-sm text-gray-700">总条目数</span>
                          <span className="text-lg md:text-2xl font-bold text-purple-600">
                            {currentSlideData.projectData.items.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentSlideData.type === 'workItem' && (
                <div>
                  <div className="text-center mb-4 md:mb-8">
                    <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-green-600 text-white rounded-lg mb-2 md:mb-4">
                      <span className="text-sm md:text-lg font-bold">✓</span>
                    </div>
                    <h1 className="text-lg md:text-3xl lg:text-4xl font-bold text-gray-800 mb-1 md:mb-2 px-2">
                      {currentSlideData.title}
                    </h1>
                    <p className="text-sm md:text-lg text-gray-600 px-4">
                      {currentSlideData.subtitle}
                    </p>
                  </div>

                  <div className="bg-white/70 rounded-xl p-4 md:p-8 backdrop-blur-sm shadow-lg max-h-96 md:max-h-none overflow-y-auto">
                    {currentSlideData.workItemData ? (
                      <div className="prose prose-sm md:prose-lg max-w-none">
                        <div className="text-gray-700 leading-relaxed text-sm md:text-lg whitespace-pre-wrap">
                          {currentSlideData.workItemData.mergedContent}
                        </div>
                      </div>
                    ) : (
                      <ul className="space-y-2 md:space-y-4">
                        {currentSlideData.content?.map((item, index) => (
                          <li key={index} className="flex items-start text-sm md:text-lg text-gray-700 leading-relaxed">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full mt-2 md:mt-3 mr-3 md:mr-4 flex-shrink-0"></div>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {currentSlideData.type === 'summary' && (
                <div className="text-center">
                  <div className="mb-4 md:mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-full mb-3 md:mb-6">
                      <span className="text-2xl md:text-3xl">🎯</span>
                    </div>
                    <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-800 mb-2 md:mb-4 px-2">
                      {currentSlideData.title}
                    </h1>
                  </div>

                  <div className="bg-white/70 rounded-xl p-4 md:p-8 backdrop-blur-sm shadow-lg max-w-2xl mx-auto max-h-80 md:max-h-none overflow-y-auto">
                    <ul className="space-y-3 md:space-y-6">
                      {currentSlideData.content?.map((item, index) => (
                        <li key={index} className="flex items-center text-sm md:text-xl text-gray-700">
                          <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 bg-blue-600 text-white rounded-full mr-3 md:mr-4 flex-shrink-0">
                            <span className="text-xs md:text-sm font-bold">{index + 1}</span>
                          </div>
                          <span className="text-left">{item}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 md:mt-8 pt-3 md:pt-6 border-t border-gray-200">
                      <p className="text-sm md:text-lg text-gray-600 font-light">
                        谢谢大家！
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底部导航点 */}
          <div className="flex justify-center p-2 md:p-4 bg-white/80 backdrop-blur-sm">
            <div className="flex space-x-1 md:space-x-2 max-w-full overflow-x-auto px-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 md:w-3 md:h-3 rounded-full transition-all duration-200 flex-shrink-0 ${
                    index === currentSlide
                      ? 'bg-blue-600 scale-125'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
