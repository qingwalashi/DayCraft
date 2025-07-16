import React from 'react';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkItem } from '@/lib/services/work-breakdown';
import { 
  ChevronDownIcon, 
  ChevronRightIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  ClockIcon,
  TagIcon,
  UsersIcon,
  GripVerticalIcon
} from 'lucide-react';

interface SortableWorkItemProps {
  item: WorkItem;
  level: number;
  onToggleExpand: (id: string) => void;
  onToggleEdit: (id: string, cancel?: boolean) => void;
  onAddChild: (parentId: string, level: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, name: string, description: string, status: string, tags: string, members: string, progress_notes: string, is_milestone: boolean) => void;
  renderEditForm: (item: WorkItem, level: number) => React.ReactNode;
  renderViewMode: (item: WorkItem, level: number) => React.ReactNode;
  isSaving: boolean;
  savingItemId: string | null;
  viewMode: string;
  canAddChildren: boolean;
}

export function SortableWorkItem({
  item,
  level,
  onToggleExpand,
  onToggleEdit,
  onAddChild,
  onDelete,
  onUpdate,
  renderEditForm,
  renderViewMode,
  isSaving,
  savingItemId,
  viewMode,
  canAddChildren
}: SortableWorkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 获取同级的子项ID列表
  const childrenIds = item.children.map(child => child.id);

  return (
    <div ref={setNodeRef} style={style} className="mb-4">
      <div className={`flex items-start p-4 bg-white rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md ${
        level === 0 ? 'border-l-blue-500' :
        level === 1 ? 'border-l-green-500' :
        level === 2 ? 'border-l-yellow-500' :
        level === 3 ? 'border-l-purple-500' :
        'border-l-red-500'
      }`}>
        {/* 拖拽手柄 */}
        {viewMode === 'edit' && (
          <div
            {...attributes}
            {...listeners}
            className="mr-2 p-1 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded transition-colors"
            title="拖拽排序"
          >
            <GripVerticalIcon className="h-4 w-4 text-gray-400" />
          </div>
        )}

        <div className="flex-grow">
          {item.isEditing ? (
            renderEditForm(item, level)
          ) : (
            <>
              {renderViewMode(item, level)}
              
              {/* 操作按钮 */}
              {viewMode === 'edit' && (
                <div className="flex items-center space-x-2 mt-3">
                  <button
                    onClick={() => onToggleEdit(item.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    disabled={isSaving}
                  >
                    <PencilIcon className="h-4 w-4 mr-1" />
                    编辑
                  </button>
                  
                  {canAddChildren && (
                    <button
                      onClick={() => onAddChild(item.id, level)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                      disabled={isSaving}
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      添加子项
                    </button>
                  )}
                  
                  <button
                    onClick={() => onDelete(item.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    disabled={isSaving}
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    删除
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* 子项渲染 */}
      {item.children.length > 0 && item.isExpanded && (
        <div className={`pl-8 mt-3 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
          <SortableContext items={childrenIds} strategy={verticalListSortingStrategy}>
            {item.children.map(child => (
              <SortableWorkItem
                key={child.id}
                item={child}
                level={level + 1}
                onToggleExpand={onToggleExpand}
                onToggleEdit={onToggleEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onUpdate={onUpdate}
                renderEditForm={renderEditForm}
                renderViewMode={renderViewMode}
                isSaving={isSaving}
                savingItemId={savingItemId}
                viewMode={viewMode}
                canAddChildren={level + 1 < 4}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}
