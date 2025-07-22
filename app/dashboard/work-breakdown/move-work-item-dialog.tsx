import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkItem } from '@/lib/services/work-breakdown';
import { workBreakdownService } from '@/lib/services/work-breakdown';
import { toast } from 'sonner';
import { Loader2, MoveIcon, AlertTriangleIcon } from 'lucide-react';

interface MoveWorkItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workItem: WorkItem | null;
  projectId: string;
  userId: string;
  onMoveComplete: () => void;
  potentialParents?: PotentialParent[]; // 预先计算好的可选父级列表
}

interface PotentialParent {
  id: string;
  name: string;
  level: number;
  path: string;
}

export default function MoveWorkItemDialog({
  isOpen,
  onClose,
  workItem,
  projectId,
  userId,
  onMoveComplete,
  potentialParents: propsParents = []
}: MoveWorkItemDialogProps) {
  const [moveType, setMoveType] = useState<'root' | 'parent'>('root');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [potentialParents, setPotentialParents] = useState<PotentialParent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  // 加载可选的父级工作项
  useEffect(() => {
    if (isOpen && workItem) {
      if (propsParents.length > 0) {
        // 如果传入了预先计算的父级列表，直接使用并过滤
        const filteredParents = propsParents.filter(parent =>
          parent.id !== workItem.dbId // 排除自己
        );
        setPotentialParents(filteredParents);
        setIsLoadingParents(false);
      } else if (projectId && userId) {
        // 如果没有传入父级列表，则进行请求
        loadPotentialParents();
      }
    }
  }, [isOpen, workItem, projectId, userId, propsParents]);

  const loadPotentialParents = async () => {
    if (!workItem?.dbId) return;

    setIsLoadingParents(true);
    try {
      const parents = await workBreakdownService.getPotentialParents(
        projectId,
        userId,
        workItem.dbId
      );
      setPotentialParents(parents);
    } catch (error) {
      console.error('加载可选父级失败:', error);
      toast.error('加载可选父级失败');
    } finally {
      setIsLoadingParents(false);
    }
  };

  const handleMove = async () => {
    if (!workItem?.dbId) {
      toast.error('工作项信息不完整');
      return;
    }

    if (moveType === 'parent' && !selectedParentId) {
      toast.error('请选择目标父级工作项');
      return;
    }

    setIsLoading(true);
    try {
      const newParentId = moveType === 'root' ? null : selectedParentId;
      await workBreakdownService.moveWorkItem(workItem.dbId, newParentId);
      
      toast.success('工作项移动成功');
      onMoveComplete();
      onClose();
    } catch (error) {
      console.error('移动工作项失败:', error);
      toast.error(error instanceof Error ? error.message : '移动工作项失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setMoveType('root');
      setSelectedParentId('');
      onClose();
    }
  };

  const getPreviewInfo = () => {
    if (moveType === 'root') {
      return {
        level: '1',
        position: '在1级工作项的末尾'
      };
    } else if (selectedParentId) {
      const parent = potentialParents.find(p => p.id === selectedParentId);
      if (parent) {
        return {
          level: `${parent.level + 2}`,
          position: `在"${parent.name}"下的末尾`
        };
      }
    }
    return {
      level: '未知',
      position: '未知'
    };
  };

  const previewInfo = getPreviewInfo();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoveIcon className="h-5 w-5" />
            移动工作项
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 当前工作项信息 */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">当前工作项：</div>
            <div className="font-medium">{workItem?.name}</div>
            <div className="text-sm text-gray-500">当前层级：{workItem ? workItem.level + 1 : 0}级</div>
          </div>

          {/* 移动选项 */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">选择移动目标：</Label>
            
            <RadioGroup value={moveType} onValueChange={(value) => setMoveType(value as 'root' | 'parent')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="root" id="root" />
                <Label htmlFor="root">移动为1级工作项</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="parent" id="parent" />
                <Label htmlFor="parent">移动到其他工作项下</Label>
              </div>
            </RadioGroup>

            {/* 父级选择 */}
            {moveType === 'parent' && (
              <div className="ml-6 space-y-2">
                {isLoadingParents ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载可选父级...
                  </div>
                ) : potentialParents.length > 0 ? (
                  <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择目标父级工作项">
                        {selectedParentId && (() => {
                          const selectedParent = potentialParents.find(p => p.id === selectedParentId);
                          return selectedParent ? (
                            <div className="flex items-center justify-between w-full">
                              <span className="truncate flex-1 mr-2">{selectedParent.name}</span>
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap flex-shrink-0">
                                {selectedParent.level + 1}级
                              </span>
                            </div>
                          ) : null;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      className="max-h-[200px] w-[var(--radix-select-trigger-width)] z-[60]"
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      avoidCollisions={true}
                      collisionPadding={8}
                    >
                      {potentialParents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id} className="p-2 cursor-pointer">
                          <div className="flex flex-col w-full min-w-0">
                            <div className="flex items-start gap-2 w-full">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm leading-tight break-words">{parent.name}</div>
                                <div className="text-xs text-gray-500 mt-1 leading-tight break-words">{parent.path}</div>
                              </div>
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap flex-shrink-0 mt-0.5">
                                {parent.level + 1}级
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                    <AlertTriangleIcon className="h-4 w-4" />
                    没有可选的父级工作项
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 预览信息 */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">移动预览：</div>
            <div className="text-sm text-blue-700 space-y-2">
              <div className="flex items-center gap-2">
                <span>移动后层级：</span>
                {previewInfo.level !== '未知' ? (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    第{previewInfo.level}级
                  </span>
                ) : (
                  <span className="text-gray-500">未知</span>
                )}
              </div>
              <div>移动后位置：{previewInfo.position}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            取消
          </Button>
          <Button 
            onClick={handleMove} 
            disabled={isLoading || (moveType === 'parent' && !selectedParentId)}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认移动
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
