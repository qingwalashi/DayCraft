"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { WorkBreakdownService, WorkItem } from "@/lib/services/work-breakdown";
import { toast } from "sonner";
import { PlusIcon, ChevronDownIcon, ChevronRightIcon, XIcon, PencilIcon, TrashIcon, Eye as EyeIcon, Edit as EditIcon, Clock as ClockIcon, Tag as TagIcon, Users as UsersIcon, Download as DownloadIcon, Upload as UploadIcon, FileSpreadsheet as FileSpreadsheetIcon, FileDown as FileDownIcon, ChevronDown, Network as NetworkIcon, GripVerticalIcon, TrendingUp as TrendingUpIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import WorkBreakdownGuide from "./guide";
import dynamic from "next/dynamic";

// 动态导入WorkMap组件，避免服务端渲染问题
const WorkMap = dynamic(() => import('./work-map'), { ssr: false });

// 导入SortableWorkItem组件
import { SortableWorkItem } from './sortable-work-item';

// 导入进度计算工具和组件
import { calculateWorkItemProgress, STATUS_PROGRESS_MAP } from '@/lib/utils/progress-calculator';
import ProgressIndicator from '@/components/work-breakdown/ProgressIndicator';

// 视图模式
type ViewMode = 'edit' | 'preview' | 'map';

// 工作进展状态选项（与进度计算保持一致）
const STATUS_OPTIONS = [
  { value: '未开始', color: 'bg-gray-200 text-gray-800 border-gray-300', progress: STATUS_PROGRESS_MAP['未开始'] },
  { value: '已暂停', color: 'bg-yellow-200 text-yellow-800 border-yellow-300', progress: STATUS_PROGRESS_MAP['已暂停'] },
  { value: '进行中', color: 'bg-blue-200 text-blue-800 border-blue-300', progress: STATUS_PROGRESS_MAP['进行中'] },
  { value: '已完成', color: 'bg-green-200 text-green-800 border-green-300', progress: STATUS_PROGRESS_MAP['已完成'] },
];

// 工作标签选项
const TAG_OPTIONS = [
  '需求对接', '产品设计', 'UI 设计', '前端开发', '后端开发', 
  '前后端联调', '功能测试', '功能确认', 'BUG 处理', 
  '数据开发', '基础资源', '数据资源'
];

// 工作标签组件
interface TagInputProps {
  itemId: string;
  initialTags: string;
  onTagsChange: (tags: string) => void;
}

const TagInput: React.FC<TagInputProps> = ({ itemId, initialTags, onTagsChange }) => {
  const [tags, setTags] = useState<string[]>(initialTags ? initialTags.split('，').filter(Boolean) : []);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>(TAG_OPTIONS);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // 添加点击外部关闭下拉框的处理函数
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && 
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    // 添加全局点击事件监听
    document.addEventListener('mousedown', handleClickOutside);
    
    // 清理函数
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 更新父组件的隐藏输入框
  useEffect(() => {
    const hiddenInput = document.getElementById(`tags-hidden-${itemId}`) as HTMLInputElement;
    if (hiddenInput) {
      hiddenInput.value = tags.join('，');
      onTagsChange(tags.join('，'));
    }
  }, [tags, itemId, onTagsChange]);

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // 过滤建议
    if (value) {
      setFilteredSuggestions(TAG_OPTIONS.filter(tag => 
        tag.toLowerCase().includes(value.toLowerCase())
      ));
    } else {
      setFilteredSuggestions(TAG_OPTIONS);
    }
    
    // 如果输入以逗号结束，添加标签
    if (value.endsWith('，') || value.endsWith(',')) {
      const newTag = value.slice(0, -1).trim();
      if (newTag && !tags.includes(newTag)) {
        setTags(prev => [...prev, newTag]);
        setInputValue('');
      } else if (newTag) {
        setInputValue('');
      }
    }
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        setTags(prev => [...prev, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // 如果输入框为空且按下退格键，删除最后一个标签
      setTags(prev => prev.slice(0, -1));
    }
  };

  // 添加标签
  const addTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
    }
    setShowSuggestions(false);
    setInputValue('');
    inputRef.current?.focus();
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        {tags.map((tag, index) => (
          <span 
            key={`tag-${index}-${tag}`} 
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 text-xs font-medium group hover:bg-indigo-100 transition-colors"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 hover:bg-indigo-200 text-indigo-500 opacity-70 hover:opacity-100 transition-all"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex-1 min-w-[120px] flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            className="w-full outline-none border-none focus:ring-0 py-1 text-sm"
            placeholder={tags.length > 0 ? "" : "输入标签并按回车添加"}
          />
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="p-1 rounded hover:bg-gray-100"
          >
            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* 标签建议下拉菜单 */}
      {showSuggestions && (
        <div 
          ref={dropdownRef}
          className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((tag, index) => (
              <div
                key={index}
                className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm transition-colors flex items-center justify-between"
                onClick={() => addTag(tag)}
              >
                <span>{tag}</span>
                {tags.includes(tag) && (
                  <span className="text-blue-500 text-xs">已添加</span>
                )}
              </div>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">无匹配标签</div>
          )}
        </div>
      )}
      
      {/* 隐藏输入框，用于表单提交 */}
      <input 
        type="hidden" 
        id={`tags-hidden-${itemId}`} 
        defaultValue={tags.join('，')} 
      />
    </div>
  );
};

// 参与人员组件
interface MemberInputProps {
  itemId: string;
  initialMembers: string;
  onMembersChange: (members: string) => void;
}

const MemberInput: React.FC<MemberInputProps> = ({ itemId, initialMembers, onMembersChange }) => {
  const [members, setMembers] = useState<string[]>(initialMembers ? initialMembers.split('，').filter(Boolean) : []);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 更新父组件的隐藏输入框
  useEffect(() => {
    const hiddenInput = document.getElementById(`members-hidden-${itemId}`) as HTMLInputElement;
    if (hiddenInput) {
      hiddenInput.value = members.join('，');
      onMembersChange(members.join('，'));
    }
  }, [members, itemId, onMembersChange]);

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // 如果输入以逗号结束，添加人员
    if (value.endsWith('，') || value.endsWith(',')) {
      const newMember = value.slice(0, -1).trim();
      if (newMember && !members.includes(newMember)) {
        setMembers(prev => [...prev, newMember]);
        setInputValue('');
      } else if (newMember) {
        setInputValue('');
      }
    }
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!members.includes(inputValue.trim())) {
        setMembers(prev => [...prev, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && members.length > 0) {
      // 如果输入框为空且按下退格键，删除最后一个人员
      setMembers(prev => prev.slice(0, -1));
    }
  };

  // 删除人员
  const removeMember = (memberToRemove: string) => {
    setMembers(prev => prev.filter(member => member !== memberToRemove));
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        {members.map((member, index) => (
          <span 
            key={`member-${index}-${member}`} 
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100 text-xs font-medium group hover:bg-blue-100 transition-colors"
          >
            {member}
            <button
              type="button"
              onClick={() => removeMember(member)}
              className="rounded-full p-0.5 hover:bg-blue-200 text-blue-500 opacity-70 hover:opacity-100 transition-all"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-[120px] outline-none border-none focus:ring-0 py-1 text-sm"
          placeholder={members.length > 0 ? "" : "输入人员名称并按回车添加"}
        />
      </div>
      
      {/* 隐藏输入框，用于表单提交 */}
      <input 
        type="hidden" 
        id={`members-hidden-${itemId}`} 
        defaultValue={members.join('，')} 
      />
    </div>
  );
};

export default function WorkBreakdownPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const workBreakdownService = new WorkBreakdownService();
  
  // 状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('preview'); // 默认预览模式
  const [isSaving, setIsSaving] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null); // 正在保存的工作项ID
  const [itemToDelete, setItemToDelete] = useState<string | null>(null); // 待删除的工作项ID
  // 添加请求控制状态
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  
  // 添加层级展开控制
  const [expandLevel, setExpandLevel] = useState<number>(4); // 默认展开所有层级
  
  // 添加工作状态筛选相关状态
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [filteredWorkItems, setFilteredWorkItems] = useState<WorkItem[]>([]);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  // 添加选中工作项状态（用于预览模式下的进度概览）
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  
  // 添加导入导出相关状态
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  
  // 添加Excel导入进度状态
  const [importExcelProgress, setImportExcelProgress] = useState(0);
  const [importExcelStage, setImportExcelStage] = useState('');
  
  // 添加新状态用于标签和人员输入
  const [tagInput, setTagInput] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [filteredTags, setFilteredTags] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  
  // 添加引用以便访问输入框
  const tagInputRef = useRef<HTMLInputElement>(null);
  const memberInputRef = useRef<HTMLInputElement>(null);
  
  // 添加状态用于强制重新渲染
  const [refreshKey, setRefreshKey] = useState(0);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 添加导入导出菜单状态
  const [showImportExportMenu, setShowImportExportMenu] = useState(false);
  const importExportMenuRef = useRef<HTMLDivElement>(null);
  
  // 添加数据加载状态跟踪和刷新间隔
  const dataLoadedRef = useRef<boolean>(false);
  const lastLoadTimeRef = useRef<number>(0);
  
  // 添加点击外部关闭导入导出菜单和状态筛选菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        importExportMenuRef.current && 
        !importExportMenuRef.current.contains(event.target as Node)
      ) {
        setShowImportExportMenu(false);
      }
      
      if (
        statusFilterRef.current && 
        !statusFilterRef.current.contains(event.target as Node)
      ) {
        setShowStatusFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 加载项目数据
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        throw error;
      }
      
      setProjects(data as Project[] || []);
      
      // 如果有活跃项目，默认选择第一个
      if (data && data.length > 0) {
        setSelectedProject(data[0] as Project);
        // 不在这里加载工作分解数据，让useEffect处理
      }
      
      // 更新数据加载状态和时间戳
      const now = Date.now();
      lastLoadTimeRef.current = now;
    } catch (error) {
      console.error('获取项目失败', error);
      toast.error('获取项目失败');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // 获取项目的工作分解数据
  const fetchWorkBreakdownItems = useCallback(async (projectId: any) => {
    if (!projectId || !user?.id) {
      return;
    }
    
    setIsLoadingItems(true);
    setIsLoading(true);
    
    try {
      console.log(`加载项目${projectId}的工作分解数据`);
      const workItemsTree = await workBreakdownService.getWorkBreakdownItems(
        projectId, 
        user.id
      );
      
      // 确保所有从数据库加载的工作项都有正确的ID格式
      const ensureCorrectIdFormat = (items: WorkItem[]): WorkItem[] => {
        return items.map(item => {
          // 如果有数据库ID但没有db-前缀，添加前缀
          if (item.dbId && !item.id.startsWith('db-')) {
            item.id = `db-${item.dbId}`;
          }
          
          // 递归处理子项
          if (item.children.length > 0) {
            item.children = ensureCorrectIdFormat(item.children);
          }
          
          return item;
        });
      };
      
      const formattedItems = ensureCorrectIdFormat(workItemsTree);
      console.log('处理后的工作项数据:', formattedItems);
      
      // 根据当前展开层级设置初始展开状态
      const setInitialExpandState = (items: WorkItem[], currentLevel: number = 0): WorkItem[] => {
        return items.map(item => {
          const shouldExpand = currentLevel < expandLevel;
          return {
            ...item,
            isExpanded: item.isExpanded !== undefined ? item.isExpanded : shouldExpand,
            children: item.children.length > 0 ? setInitialExpandState(item.children, currentLevel + 1) : []
          };
        });
      };
      
      const itemsWithExpandState = setInitialExpandState(formattedItems);
      setWorkItems(itemsWithExpandState);
      setLastProjectId(projectId);
      
      // 更新数据加载状态和时间戳
      dataLoadedRef.current = true;
      lastLoadTimeRef.current = Date.now();
    } catch (error) {
      console.error('获取工作分解数据失败', error);
      toast.error('获取工作分解数据失败');
    } finally {
      setIsLoading(false);
      setIsLoadingItems(false);
    }
  }, [user, workBreakdownService, expandLevel]);

  // 添加页面可见性监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('工作分解页面恢复可见，保持现有数据');
          // 不再自动刷新数据
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // 当选择的项目变化时，加载该项目的工作分解数据
  useEffect(() => {
    if (selectedProject?.id && user?.id && !isLoadingItems) {
      // 只有当项目ID变化时或数据未加载时才重新加载数据
      if (selectedProject.id !== lastProjectId || !dataLoadedRef.current) {
        fetchWorkBreakdownItems(selectedProject.id);
      }
    }
  }, [selectedProject, user, fetchWorkBreakdownItems, lastProjectId, isLoadingItems]);

  // 规范化ID，处理前缀
  const normalizeId = (id: string): string => {
    if (!id) return '';
    return id.startsWith('db-') ? id.substring(3) : id;
  };
  
  // 检查两个ID是否匹配（考虑前缀）
  const isIdMatch = (id1: string | undefined | null, id2: string | undefined | null): boolean => {
    if (!id1 || !id2) return false;
    
    const normalized1 = normalizeId(id1);
    const normalized2 = normalizeId(id2);
    
    // 直接匹配
    if (normalized1 === normalized2) return true;
    
    // 检查一个ID是否包含在另一个ID中（处理部分匹配的情况）
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      console.log(`部分ID匹配: ${id1} 与 ${id2}`);
      return true;
    }
    
    return false;
  };

  // 添加根级工作项
  const addRootWorkItem = async () => {
    if (!selectedProject || !user?.id) return;
    
    const tempId = `temp-${Date.now()}`;
    const newPosition = workItems.length;
    
    // 创建新的工作项（仅前端展示）
    const newItem: WorkItem = {
      id: tempId,
      name: "新1级工作项",
      description: "",
      children: [],
      isExpanded: true,
      isEditing: true,
      level: 0,  // 确保level为0表示一级工作项
      position: newPosition,  // 确保position正确设置
      status: '未开始',
      tags: '',
      members: '',
      is_milestone: false
    };
    
    console.log('添加一级工作项:', newItem);
    
    // 添加到前端状态
    setWorkItems([...workItems, newItem]);
  };
  
  // 添加子工作项
  const addChildWorkItem = async (parentId: string, level: number) => {
    if (!selectedProject || !user?.id) return;
    
    const tempId = `temp-${Date.now()}`;
    console.log('创建临时工作项ID:', tempId);
    
    // 处理父级ID格式，移除可能的前缀
    const normalizedParentId = normalizeId(parentId);
    console.log('父级ID处理:', { original: parentId, normalized: normalizedParentId });
    
    // 打印当前所有工作项的ID，帮助调试
    console.log('当前工作项列表:');
    const logItemIds = (items: WorkItem[], prefix = '') => {
      items.forEach(item => {
        console.log(`${prefix}项目ID: ${item.id}, 数据库ID: ${item.dbId || '无'}, 名称: ${item.name}`);
        if (item.children.length > 0) {
          logItemIds(item.children, prefix + '  ');
        }
      });
    };
    logItemIds(workItems);
    
    // 直接尝试查找父级工作项
    let foundParent: WorkItem | null = null;
    
    // 在当前所有工作项中查找匹配的父级
    const findParentItem = (items: WorkItem[]): WorkItem | null => {
      for (const item of items) {
        // 检查当前项是否匹配
        if (isIdMatch(item.id, parentId) || isIdMatch(item.dbId, parentId)) {
          console.log('直接找到父级工作项:', { id: item.id, dbId: item.dbId, name: item.name });
          return item;
        }
        
        // 递归检查子项
        if (item.children.length > 0) {
          const found = findParentItem(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    foundParent = findParentItem(workItems);
    
    if (!foundParent) {
      console.error('未找到父级工作项', parentId, '已处理的ID:', normalizedParentId);
      
      // 尝试通过前缀匹配查找
      console.log('尝试通过前缀匹配查找父级:');
      for (const item of workItems) {
        console.log(`检查项目: ID=${item.id}, dbId=${item.dbId || '无'}, 是否匹配=${
          (item.id && item.id.includes(normalizedParentId)) || 
          (item.dbId && item.dbId.includes(normalizedParentId))
        }`);
      }
      
      toast.error('添加子工作项失败：未找到父级工作项');
      return;
    }
    
    // 找到父级后，创建子项
    const newPosition = foundParent.children.length;
    const newItem: WorkItem = {
      id: tempId,
      name: `新${level + 2}级工作项`,
      description: "",
      children: [],
      isEditing: true,
      level: level + 1,
      position: newPosition,
      status: '未开始',
      tags: '',
      members: '',
      is_milestone: false
    };
    
    console.log('添加子工作项:', { 
      parentId, 
      parentName: foundParent.name,
      tempId, 
      level: level + 1 
    });
    
    // 更新工作项树
    const updateItemsWithNewChild = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        if (isIdMatch(item.id, parentId) || isIdMatch(item.dbId, parentId)) {
          return {
            ...item,
            isExpanded: true,
            children: [...item.children, newItem]
          };
        }
        
        if (item.children.length > 0) {
          return {
            ...item,
            children: updateItemsWithNewChild(item.children)
          };
        }
        
        return item;
      });
    };
    
    // 更新前端状态
    const updatedItems = updateItemsWithNewChild(workItems);
    setWorkItems(updatedItems);
    
    // 确认更新成功
    console.log('工作项更新完成');
  };
  
  // 切换展开/折叠
  const toggleExpand = async (id: string) => {
    // 查找工作项并切换展开状态
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        // 检查ID匹配，同时处理带有db-前缀的情况
        const isMatch = item.id === id || 
                       (item.dbId && `db-${item.dbId}` === id);
        
        if (isMatch) {
          const newExpandState = !item.isExpanded;
          
          // 如果有数据库ID，更新数据库
          if (item.dbId) {
            workBreakdownService.updateWorkItem(item.dbId, { is_expanded: newExpandState })
              .catch(error => {
                console.error('更新展开状态失败', error);
              });
          }
          
          return {
            ...item,
            isExpanded: newExpandState
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    setWorkItems(updateWorkItems(workItems));
  };
  
  // 切换编辑模式
  const toggleEdit = (id: string, isCancel: boolean = false) => {
    const updateWorkItems = (items: WorkItem[]): WorkItem[] => {
      return items.map(item => {
        // 检查ID匹配，同时处理带有db-前缀的情况
        const isMatch = item.id === id || 
                       (item.dbId && `db-${item.dbId}` === id);
        
        if (isMatch) {
          // 如果是取消编辑且是新创建的项（临时ID），则删除该项
          if (isCancel && item.id.startsWith('temp-')) {
            return { ...item, shouldDelete: true };
          }
          return {
            ...item,
            isEditing: !item.isEditing
          };
        } else if (item.children.length > 0) {
          return {
            ...item,
            children: updateWorkItems(item.children)
          };
        }
        return item;
      });
    };
    
    let updatedItems = updateWorkItems(workItems);
    
    // 过滤掉标记为删除的项
    const filterDeletedItems = (items: WorkItem[]): WorkItem[] => {
      return items
        .filter(item => !item.shouldDelete)
        .map(item => ({
          ...item,
          children: filterDeletedItems(item.children)
        }));
    };
    
    if (isCancel) {
      updatedItems = filterDeletedItems(updatedItems);
    }
    
    setWorkItems(updatedItems);
  };
  
  // 更新工作项（保存到数据库）
  const updateWorkItem = async (id: string, name: string, description: string, status: string = '未开始', tags: string = '', members: string = '', progress_notes: string = '', is_milestone: boolean = false) => {
    console.log('开始保存工作项:', { id, name, description, status, tags, members, progress_notes, is_milestone });
    
    // 设置当前保存的工作项ID
    setSavingItemId(id);
    
    // 处理ID格式，移除可能的前缀
    const normalizedId = normalizeId(id);
    console.log('处理的ID:', { original: id, normalized: normalizedId });
    
    // 打印当前所有工作项的ID，帮助调试
    console.log('保存时的工作项列表:');
    const logItemIds = (items: WorkItem[], prefix = '') => {
      items.forEach(item => {
        console.log(`${prefix}项目ID: ${item.id}, 数据库ID: ${item.dbId || '无'}, 名称: ${item.name}, 是临时项: ${item.id.startsWith('temp-')}, 编辑状态: ${item.isEditing}`);
        if (item.children.length > 0) {
          logItemIds(item.children, prefix + '  ');
        }
      });
    };
    logItemIds(workItems);
    
    // 直接查找要保存的工作项
    let foundItem: WorkItem | null = null;
    let isNewItem = false;
    let parentInfo: { parentId: string | null, level: number, position: number } = { 
      parentId: null, level: 0, position: 0 
    };
    
    // 查找工作项及其父级信息
    const findItemAndParent = (items: WorkItem[], targetId: string, parent: WorkItem | null = null, index: number = -1): [WorkItem | null, boolean, typeof parentInfo] => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // 检查当前项是否匹配
        if (isIdMatch(item.id, targetId) || isIdMatch(item.dbId, targetId)) {
          const isTemp = item.id.startsWith('temp-');
          console.log('找到匹配工作项:', { 
            id: item.id, 
            dbId: item.dbId, 
            isTemp,
            isEditing: item.isEditing,
            parent: parent ? { id: parent.id, name: parent.name } : null,
            index: parent ? index : i
          });
          
          return [
            item, 
            isTemp, 
            parent ? 
              { parentId: parent.dbId || null, level: item.level, position: index } : 
              { parentId: null, level: 0, position: i }
          ];
        }
        
        // 递归检查子项
        if (item.children.length > 0) {
          for (let j = 0; j < item.children.length; j++) {
            const [found, isTemp, info] = findItemAndParent(
              [item.children[j]], 
              targetId, 
              item, 
              j
            );
            if (found) return [found, isTemp, info];
          }
        }
      }
      
      return [null, false, { parentId: null, level: 0, position: 0 }];
    };
    
    // 查找工作项
    [foundItem, isNewItem, parentInfo] = findItemAndParent(workItems, id);
    console.log('查找结果:', { 
      found: !!foundItem, 
      isNewItem, 
      parentInfo,
      item: foundItem ? { 
        id: foundItem.id, 
        name: foundItem.name, 
        dbId: foundItem.dbId,
        isEditing: foundItem.isEditing
      } : null 
    });
    
    // 显示加载状态
    setIsSaving(true);
    
    try {
      // 如果没有找到工作项或找到的不是临时项但没有dbId，报错
      if (!foundItem) {
        throw new Error('未找到工作项');
      }
      
      // 获取最新的标签和人员值
      const tagsHiddenInput = document.getElementById(`tags-hidden-${id}`) as HTMLInputElement;
      const membersHiddenInput = document.getElementById(`members-hidden-${id}`) as HTMLInputElement;
      
      // 如果能找到隐藏输入框，使用其值
      const updatedTags = tagsHiddenInput ? tagsHiddenInput.value : tags;
      const updatedMembers = membersHiddenInput ? membersHiddenInput.value : members;
      
      console.log('保存前的标签和人员:', {
        tags: updatedTags,
        members: updatedMembers,
        progress_notes
      });
      
      // 强制检查是否为临时项
      const forceCheckIsTemp = foundItem.id.startsWith('temp-');
      
      // 递归更新子项的编辑状态
      const updateChildrenEditState = (children: WorkItem[], targetId: string, newName: string, newDescription: string, newStatus: string, newTags: string, newMembers: string, newProgressNotes: string, newIsMilestone: boolean): WorkItem[] => {
        return children.map(child => {
          if (isIdMatch(child.id, targetId) || isIdMatch(child.dbId, targetId)) {
            return {
              ...child,
              name: newName,
              description: newDescription,
              status: newStatus,
              tags: newTags,
              members: newMembers,
              progress_notes: newProgressNotes,
              is_milestone: newIsMilestone,
              isEditing: false
            };
          }
          
          if (child.children.length > 0) {
            return {
              ...child,
              children: updateChildrenEditState(child.children, targetId, newName, newDescription, newStatus, newTags, newMembers, newProgressNotes, newIsMilestone)
            };
          }
          
          return child;
        });
      };
      
      // 立即更新前端状态，确保编辑状态关闭
      const updatedItems = workItems.map(item => {
        if (isIdMatch(item.id, id) || isIdMatch(item.dbId, id)) {
          return {
            ...item,
            name,
            description,
            status,
            tags: updatedTags,
            members: updatedMembers,
            progress_notes,
            is_milestone,
            isEditing: false
          };
        }
        
        // 递归处理子项
        if (item.children.length > 0) {
          return { 
            ...item, 
            children: item.children.map(child => {
              if (isIdMatch(child.id, id) || isIdMatch(child.dbId, id)) {
                return { 
                  ...child,
                  name,
                  description,
                  status,
                  tags: updatedTags,
                  members: updatedMembers,
                  progress_notes,
                  is_milestone,
                  isEditing: false
                };
              }
              
              // 递归处理更深层级的子项
              if (child.children.length > 0) {
                return {
                  ...child,
                  children: updateChildrenEditState(child.children, id, name, description, status, updatedTags, updatedMembers, progress_notes, is_milestone)
                };
              }
              
              return child;
            })
          };
        }
        
        return item;
      });
      
      // 立即更新状态以关闭编辑模式
      setWorkItems(updatedItems);
      console.log('已更新前端状态，关闭编辑模式');
      
      if (isNewItem || forceCheckIsTemp) {
        console.log('保存新工作项到数据库:', {
          projectId: selectedProject?.id,
          userId: user?.id,
          name,
          description,
          parentId: parentInfo.parentId,
          level: parentInfo.level,
          position: parentInfo.position,
          status,
          tags: updatedTags,
          members: updatedMembers,
          progress_notes
        });
        
        // 确保selectedProject和user不为null
        if (!selectedProject || !user) {
          throw new Error('项目或用户信息缺失');
        }
        
        // 保存到数据库
        const result = await workBreakdownService.addWorkItem(
          selectedProject.id,
          user.id,
          name,
          description,
          parentInfo.parentId,
          parentInfo.level,
          parentInfo.position,
          status,
          updatedTags,
          updatedMembers,
          progress_notes,
          '',
          '',
          '',
          '',
          is_milestone
        );
        
        console.log('保存结果:', result);
        
        // 递归更新子项的ID
        const updateChildrenIds = (children: WorkItem[], targetId: string, newDbId: string): WorkItem[] => {
          return children.map(child => {
            if (isIdMatch(child.id, targetId)) {
              return { ...child, id: `db-${newDbId}`, dbId: newDbId };
            }
            
            if (child.children.length > 0) {
              return {
                ...child,
                children: updateChildrenIds(child.children, targetId, newDbId)
              };
            }
            
            return child;
          });
        };
        
        // 更新工作项的ID，但保持编辑状态为false
        const finalItems = updatedItems.map(item => {
          if (isIdMatch(item.id, id)) {
            return { ...item, id: `db-${result.id}`, dbId: result.id };
          }
          
          // 递归处理子项
          if (item.children.length > 0) {
            return {
              ...item,
              children: updateChildrenIds(item.children, id, result.id)
            };
          }
          
          return item;
        });
        
        setWorkItems(finalItems);
        toast.success('添加工作项成功');
      } else if (foundItem.dbId) {
        // 如果是已有的项，直接更新
        console.log('更新现有工作项:', { id: foundItem.dbId, name, description, status, tags: updatedTags, members: updatedMembers, progress_notes, is_milestone });
        await workBreakdownService.updateWorkItem(foundItem.dbId, {
          name,
          description,
          status,
          tags: updatedTags,
          members: updatedMembers,
          progress_notes,
          is_milestone
        });
        toast.success('更新工作项成功');
      } else {
        // 如果既不是临时项又没有dbId，可能是数据不一致
        console.error('工作项数据不一致:', foundItem);
        throw new Error('工作项数据不一致，无法保存');
      }
    } catch (error) {
      console.error('保存工作项失败', error);
      toast.error(`保存工作项失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsSaving(false);
      setSavingItemId(null);
    }
  };
  
  // 删除工作项
  const deleteWorkItem = async (id: string) => {
    // 设置待删除的工作项ID，触发确认对话框
    setItemToDelete(id);
  };
  
  // 确认删除工作项
  const confirmDeleteWorkItem = async () => {
    if (!itemToDelete) return;
    
    const id = itemToDelete;
    setIsSaving(true);
    
    console.log('开始删除工作项:', id);
    
    try {
      // 直接从ID中提取数据库ID
      let dbId = null;
      
      if (id.startsWith('db-')) {
        // 如果ID格式为 db-xxx，直接提取
        dbId = id.substring(3);
        console.log('从ID中提取数据库ID:', dbId);
      } else {
        // 否则尝试在工作项中查找
        const findDbId = (items: WorkItem[]): string | null => {
          for (const item of items) {
            if (item.id === id) {
              return item.dbId || null;
            }
            if (item.children.length > 0) {
              const foundId = findDbId(item.children);
              if (foundId) return foundId;
            }
          }
          return null;
        };
        
        dbId = findDbId(workItems);
        console.log('从工作项中查找数据库ID:', dbId);
      }
      
      // 查找工作项对象，用于临时项判断和UI更新
      const findItem = (items: WorkItem[]): WorkItem | null => {
        for (const item of items) {
          if (item.id === id || (item.dbId && `db-${item.dbId}` === id) || 
              (id.startsWith('db-') && item.dbId === id.substring(3))) {
            return item;
          }
          if (item.children.length > 0) {
            const found = findItem(item.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      const foundItem = findItem(workItems);
      console.log('找到的工作项:', foundItem ? {
        id: foundItem.id,
        dbId: foundItem.dbId,
        name: foundItem.name
      } : '未找到');
      
      // 准备删除后的工作项列表
      const removeItem = (items: WorkItem[]): WorkItem[] => {
        return items
          .filter(item => {
            const isMatch = item.id === id || 
                          (item.dbId && `db-${item.dbId}` === id) ||
                          (id.startsWith('db-') && item.dbId === id.substring(3));
            return !isMatch;
          })
          .map(item => ({
            ...item,
            children: removeItem(item.children)
          }));
      };
      
      // 如果有数据库ID，从数据库中删除
      if (dbId) {
        console.log('从数据库中删除工作项:', dbId);
        await workBreakdownService.deleteWorkItem(dbId);
        
        // 数据库删除成功后，更新前端状态
        const newItems = removeItem(workItems);
        setWorkItems(newItems);
        
        toast.success('删除工作项成功');
      } else if (foundItem && foundItem.id.startsWith('temp-')) {
        // 如果是临时项（未保存到数据库），直接从前端删除
        console.log('删除临时工作项:', foundItem.id);
        const newItems = removeItem(workItems);
        setWorkItems(newItems);
        
        toast.success('删除工作项成功');
      } else {
        // 无法确定工作项ID，可能是数据不一致
        console.error('无法删除工作项: 找不到有效的数据库ID', id);
        toast.error('删除失败：无法找到工作项');
      }
    } catch (error) {
      console.error('删除工作项失败', error);
      toast.error(`删除工作项失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      // 重置状态
      setIsSaving(false);
      setItemToDelete(null);
    }
  };
  
  // 取消删除
  const cancelDeleteWorkItem = () => {
    setItemToDelete(null);
  };

  // 处理拖拽结束事件
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // 找到被拖拽项和目标位置的父级容器
    const findItemAndParent = (items: WorkItem[], targetId: string, parent: WorkItem | null = null): { item: WorkItem; parent: WorkItem | null; siblings: WorkItem[] } | null => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.id === targetId) {
          return { item, parent, siblings: items };
        }
        if (item.children.length > 0) {
          const result = findItemAndParent(item.children, targetId, item);
          if (result) return result;
        }
      }
      return null;
    };

    const activeResult = findItemAndParent(workItems, active.id as string);
    const overResult = findItemAndParent(workItems, over.id as string);

    if (!activeResult || !overResult) {
      return;
    }

    // 只允许同级拖拽排序
    if (activeResult.parent?.id !== overResult.parent?.id) {
      toast.error('只能在同一层级内拖拽排序');
      return;
    }

    const siblings = activeResult.siblings;
    const oldIndex = siblings.findIndex(item => item.id === active.id);
    const newIndex = siblings.findIndex(item => item.id === over.id);

    if (oldIndex === newIndex) {
      return;
    }

    // 更新前端状态
    const newSiblings = arrayMove(siblings, oldIndex, newIndex);

    // 更新position字段
    const positionUpdates: Array<{ id: string; position: number }> = [];
    newSiblings.forEach((item, index) => {
      if (item.dbId) {
        positionUpdates.push({ id: item.dbId, position: index });
      }
    });

    // 更新工作项树
    const updateWorkItemsTree = (items: WorkItem[]): WorkItem[] => {
      if (activeResult.parent === null) {
        // 根级别的排序
        return newSiblings;
      } else {
        // 子级别的排序
        return items.map(item => {
          if (item.id === activeResult.parent!.id) {
            return { ...item, children: newSiblings };
          }
          if (item.children.length > 0) {
            return { ...item, children: updateWorkItemsTree(item.children) };
          }
          return item;
        });
      }
    };

    const updatedWorkItems = updateWorkItemsTree(workItems);
    setWorkItems(updatedWorkItems);

    // 保存到数据库
    try {
      if (positionUpdates.length > 0) {
        await workBreakdownService.updateWorkItemPositions(positionUpdates);
        toast.success('排序已保存');
      }
    } catch (error) {
      console.error('保存排序失败:', error);
      toast.error('保存排序失败');
      // 恢复原始状态
      setWorkItems(workItems);
    }
  };

  // 导出为Excel
  const handleExportExcel = () => {
    if (!selectedProject || !workItems.length) {
      toast.error('没有可导出的工作项');
      return;
    }
    
    setIsExportingExcel(true);
    try {
      workBreakdownService.exportToExcel(workItems, selectedProject.name);
      toast.success('导出Excel成功');
    } catch (error) {
      console.error('导出失败', error);
      toast.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExportingExcel(false);
    }
  };
  
  // 下载Excel导入模板
  const handleDownloadTemplate = () => {
    setIsDownloadingTemplate(true);
    try {
      workBreakdownService.downloadExcelTemplate();
      toast.success('下载Excel模板成功');
    } catch (error) {
      console.error('下载模板失败', error);
      toast.error(`下载模板失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsDownloadingTemplate(false);
      setShowImportExportMenu(false);
    }
  };
  
  // 触发Excel文件选择
  const handleImportExcelClick = () => {
    if (!selectedProject) {
      toast.error('请先选择一个项目');
      return;
    }
    excelFileInputRef.current?.click();
    setShowImportExportMenu(false);
  };
  
  // 处理Excel文件选择
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject || !user) {
      // 重置文件输入
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
      return;
    }
    
    // 检查文件类型
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('请选择Excel格式的文件(.xlsx或.xls)');
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
      return;
    }
    
    setIsImportingExcel(true);
    setImportExcelProgress(0);
    setImportExcelStage('准备导入');
    
    try {
      // 定义进度回调函数
      const updateProgress = (progress: number) => {
        setImportExcelProgress(progress);
        
        // 根据进度更新阶段描述
        if (progress <= 10) {
          setImportExcelStage('准备读取文件');
        } else if (progress <= 30) {
          setImportExcelStage('读取Excel文件');
        } else if (progress <= 50) {
          setImportExcelStage('解析Excel数据');
        } else if (progress <= 70) {
          setImportExcelStage('构建工作项结构');
        } else if (progress <= 80) {
          setImportExcelStage('保存到数据库');
        } else if (progress <= 90) {
          setImportExcelStage('更新缓存');
        } else {
          setImportExcelStage('导入完成');
        }
      };
      
      // 导入文件
      const importedItems = await workBreakdownService.importFromExcel(
        file,
        selectedProject.id,
        user.id,
        updateProgress
      );
      
      // 更新状态
      setWorkItems(importedItems);
      toast.success('导入Excel成功');
    } catch (error) {
      console.error('导入失败', error);
      toast.error(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsImportingExcel(false);
      setImportExcelProgress(0);
      setImportExcelStage('');
      // 重置文件输入
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
    }
  };
  
  // 渲染工作项标签
  const renderTags = (tags: string | undefined) => {
    if (!tags) return null;
    
    const tagList = tags.split('，').filter(Boolean);
    if (tagList.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-2 items-center">
        <TagIcon className="h-3.5 w-3.5 text-gray-500" />
        {tagList.map((tag, idx) => (
          <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors">
            {tag}
          </span>
        ))}
      </div>
    );
  };
  
  // 渲染工作项人员
  const renderMembers = (members: string | undefined, compact: boolean = false) => {
    if (!members) return null;
    
    const memberList = members.split('，').filter(Boolean);
    if (memberList.length === 0) return null;
    
    return (
      <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'} items-center`}>
        <UsersIcon className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-gray-500`} />
        {memberList.map((member, idx) => (
          <span 
            key={`member-${idx}`} 
            className={`inline-flex items-center text-xs ${compact ? 'px-1.5 py-0.5' : 'px-2.5 py-1'} rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors`}
          >
            {member}
          </span>
        ))}
      </div>
    );
  };

  // 渲染查看模式
  const renderViewMode = (item: WorkItem, level: number) => {
    return (
      <div>
        {/* 优化布局：PC端更紧凑，移动端自适应 */}
        <div className="flex flex-col sm:flex-row sm:items-center">
          {/* 第一行/左侧：标题和状态 */}
          <div className="flex items-center flex-grow flex-wrap">
            {item.children.length > 0 && (
              <button
                onClick={() => toggleExpand(item.id)}
                className="mr-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
              >
                {item.isExpanded ? (
                  <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                )}
              </button>
            )}
            <h3 className="font-medium text-lg">{item.name}</h3>

            {/* 显示里程碑标识 */}
            {item.is_milestone && (
              <span className="ml-2 text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-medium">
                🏁 里程碑
              </span>
            )}

            {/* 显示工作状态徽章 */}
            {item.status && (
              <span className={`ml-2 text-xs px-3 py-1 rounded-full ${
                item.status === '未开始' ? 'bg-gray-200 text-gray-800 border border-gray-300' :
                item.status === '进行中' ? 'bg-blue-200 text-blue-800 border border-blue-300' :
                item.status === '已暂停' ? 'bg-yellow-200 text-yellow-800 border border-yellow-300' :
                item.status === '已完成' ? 'bg-green-200 text-green-800 border border-green-300' :
                'bg-gray-200 text-gray-800 border border-gray-300'
              }`}>
                {item.status}
              </span>
            )}

            {/* 显示参与人员 - 移到第一行 */}
            {item.members && (
              <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                {renderMembers(item.members, true)}
              </div>
            )}

            {/* 显示工作标签 - 移到第一行 */}
            {item.tags && (
              <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                <TagIcon className="h-3 w-3 text-gray-500 mr-1" />
                {item.tags.split('，').filter(Boolean).map((tag, idx) => (
                  <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-1.5 py-0.5 ml-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 描述区域 */}
        <div className="mt-2">
          {/* 描述 */}
          {item.description && (
            <div className="text-sm text-gray-600 leading-relaxed">
              {item.description}
            </div>
          )}
        </div>

        {/* 工作进展备注 */}
        {item.progress_notes && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <ClockIcon className="h-3.5 w-3.5" />
              <span>工作进展备注:</span>
            </div>
            <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md border border-gray-100 whitespace-pre-wrap">
              {item.progress_notes}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染编辑表单
  const renderEditForm = (item: WorkItem, level: number) => {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor={`name-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1">
            工作项名称
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              defaultValue={item.name}
              placeholder="工作项名称"
              id={`name-${item.id}`}
            />
            <div className="flex items-center">
              <input
                type="checkbox"
                id={`milestone-${item.id}`}
                defaultChecked={item.is_milestone || false}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor={`milestone-${item.id}`} className="ml-2 text-sm text-gray-700 whitespace-nowrap">
                里程碑
              </label>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor={`desc-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1">
            工作描述
          </label>
          <textarea
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            defaultValue={item.description}
            placeholder="工作描述（可选）"
            rows={3}
            id={`desc-${item.id}`}
          />
        </div>

        {/* 工作进展状态选择 */}
        <div className="mb-2">
          <label htmlFor={`status-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
            <ClockIcon className="h-4 w-4 mr-1" />
            工作进展
          </label>
          <select
            id={`status-${item.id}`}
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            defaultValue={item.status || '未开始'}
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.value}</option>
            ))}
          </select>
        </div>

        {/* 工作进展备注 */}
        <div className="mb-2">
          <label htmlFor={`progress-notes-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
            <ClockIcon className="h-4 w-4 mr-1" />
            工作进展备注
          </label>
          <textarea
            id={`progress-notes-${item.id}`}
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            defaultValue={item.progress_notes || ''}
            placeholder="记录工作进展的详细情况、遇到的问题等（可选）"
            rows={3}
          />
        </div>

        {/* 工作标签输入 - 使用新组件 */}
        <div className="mb-2">
          <label htmlFor={`tags-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
            <TagIcon className="h-4 w-4 mr-1" />
            工作标签
          </label>
          <TagInput
            itemId={item.id}
            initialTags={item.tags || ''}
            onTagsChange={(tags) => {
              // 可以在这里添加额外的处理逻辑
              console.log('标签已更新:', tags);
            }}
          />
        </div>

        {/* 参与人员输入 - 使用新组件 */}
        <div className="mb-2">
          <label htmlFor={`members-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
            <UsersIcon className="h-4 w-4 mr-1" />
            参与人员
          </label>
          <MemberInput
            itemId={item.id}
            initialMembers={item.members || ''}
            onMembersChange={(members) => {
              // 可以在这里添加额外的处理逻辑
              console.log('人员已更新:', members);
            }}
          />
        </div>

        <div className="flex space-x-3 pt-2">
          <button
            onClick={() => updateWorkItem(
              item.id,
              (document.getElementById(`name-${item.id}`) as HTMLInputElement).value,
              (document.getElementById(`desc-${item.id}`) as HTMLTextAreaElement).value,
              (document.getElementById(`status-${item.id}`) as HTMLSelectElement).value,
              (document.getElementById(`tags-hidden-${item.id}`) as HTMLInputElement).value,
              (document.getElementById(`members-hidden-${item.id}`) as HTMLInputElement).value,
              (document.getElementById(`progress-notes-${item.id}`) as HTMLTextAreaElement).value,
              (document.getElementById(`milestone-${item.id}`) as HTMLInputElement).checked
            )}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            disabled={isSaving}
          >
            {isSaving && savingItemId === item.id ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full inline-block"></div>
                保存中...
              </>
            ) : "保存"}
          </button>
          <button
            onClick={() => toggleEdit(item.id, true)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            disabled={isSaving}
          >
            取消
          </button>
        </div>
      </div>
    );
  };

  // 计算工作项进度的辅助函数
  const getItemProgress = (item: WorkItem): number => {
    return calculateWorkItemProgress({
      id: item.id,
      status: item.status,
      children: item.children?.map(child => ({
        id: child.id,
        status: child.status,
        children: child.children?.map(grandChild => ({
          id: grandChild.id,
          status: grandChild.status,
          children: grandChild.children?.map(greatGrandChild => ({
            id: greatGrandChild.id,
            status: greatGrandChild.status,
            children: greatGrandChild.children
          }))
        }))
      }))
    });
  };

  // 处理工作项点击选中
  const handleWorkItemClick = (item: WorkItem, e: React.MouseEvent) => {
    // 阻止事件冒泡，避免触发展开/折叠
    e.stopPropagation();

    // 如果点击的是已选中的工作项，则取消选中
    if (selectedWorkItem?.id === item.id) {
      setSelectedWorkItem(null);
    } else {
      setSelectedWorkItem(item);
    }
  };

  // 渲染工作项组件
  const renderWorkItem = (item: WorkItem, level: number) => {
    // 限制最多5级（0-4级）
    const canAddChildren = level < 4;
    
    // 预览模式下的简化渲染
    if (viewMode === 'preview') {
      const isSelected = selectedWorkItem?.id === item.id;

      return (
        <div key={item.id} className="mb-4">
          <div
            className={`flex items-start p-4 rounded-lg shadow-sm border-l-4 transition-all cursor-pointer ${
              isSelected
                ? 'bg-blue-50 border-l-blue-600 shadow-md ring-2 ring-blue-200'
                : 'bg-white hover:shadow-md hover:bg-gray-50'
            } ${
              level === 0 ? (isSelected ? 'border-l-blue-600' : 'border-l-blue-500') :
              level === 1 ? (isSelected ? 'border-l-green-600' : 'border-l-green-500') :
              level === 2 ? (isSelected ? 'border-l-yellow-600' : 'border-l-yellow-500') :
              level === 3 ? (isSelected ? 'border-l-purple-600' : 'border-l-purple-500') :
              (isSelected ? 'border-l-red-600' : 'border-l-red-500')
            }`}
            onClick={(e) => handleWorkItemClick(item, e)}
          >
            <div className="flex-grow">
              {/* 优化布局：PC端更紧凑，移动端自适应 */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                {/* 第一行/左侧：标题和状态 */}
                <div className="flex items-center flex-grow flex-wrap">
                  {item.children.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(item.id);
                      }}
                      className="mr-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      {item.isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                      )}
                    </button>
                  )}
                  <h3 className="font-medium text-lg">{item.name}</h3>

                  {/* 显示里程碑标识 */}
                  {item.is_milestone && (
                    <span className="ml-2 text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-medium">
                      🏁 里程碑
                    </span>
                  )}

                  {/* 显示工作状态徽章 */}
                  {item.status && (
                    <span className={`ml-2 text-xs px-3 py-1 rounded-full ${
                      item.status === '未开始' ? 'bg-gray-200 text-gray-800 border border-gray-300' :
                      item.status === '进行中' ? 'bg-blue-200 text-blue-800 border border-blue-300' :
                      item.status === '已暂停' ? 'bg-yellow-200 text-yellow-800 border border-yellow-300' :
                      item.status === '已完成' ? 'bg-green-200 text-green-800 border border-green-300' :
                      'bg-gray-200 text-gray-800 border border-gray-300'
                    }`}>
                      {item.status}
                    </span>
                  )}

                  {/* 显示工作进度 */}
                  <div className="ml-2">
                    <ProgressIndicator
                      progress={getItemProgress(item)}
                      size="sm"
                      showBar={true}
                      showText={true}
                    />
                  </div>
                  
                  {/* 显示参与人员 - 移到第一行 */}
                  {item.members && (
                    <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                      {renderMembers(item.members, true)}
                    </div>
                  )}
                  
                  {/* 显示工作标签 - 移到第一行 */}
                  {item.tags && (
                    <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                      <TagIcon className="h-3 w-3 text-gray-500 mr-1" />
                      {item.tags.split('，').filter(Boolean).map((tag, idx) => (
                        <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-1.5 py-0.5 ml-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* 描述区域 */}
              <div className="mt-2">
                {/* 描述 */}
                {item.description && (
                  <div className="text-sm text-gray-600 leading-relaxed">
                    {item.description}
                  </div>
                )}
              </div>
              
              {/* 工作进展备注 */}
              {item.progress_notes && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                    <ClockIcon className="h-3.5 w-3.5" />
                    <span>工作进展备注:</span>
                  </div>
                  <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md border border-gray-100 whitespace-pre-wrap">
                    {item.progress_notes}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {item.children.length > 0 && item.isExpanded && (
            <div className={`pl-8 mt-3 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
              {item.children.map(child => renderWorkItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    }
    
    // 编辑模式下的渲染
    const isSelected = selectedWorkItem?.id === item.id;

    return (
      <div key={item.id} className="mb-4">
        <div className={`flex items-start p-4 bg-white rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md ${
          level === 0 ? 'border-l-blue-500' :
          level === 1 ? 'border-l-green-500' :
          level === 2 ? 'border-l-yellow-500' :
          level === 3 ? 'border-l-purple-500' :
          'border-l-red-500'
        }`}>
          <div className="flex-grow">
            {item.isEditing ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor={`name-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                    工作项名称
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      defaultValue={item.name}
                      placeholder="工作项名称"
                      id={`name-${item.id}`}
                    />
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`milestone-${item.id}`}
                        defaultChecked={item.is_milestone || false}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor={`milestone-${item.id}`} className="ml-2 text-sm text-gray-700 whitespace-nowrap">
                        里程碑
                      </label>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label htmlFor={`desc-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                    工作描述
                  </label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    defaultValue={item.description}
                    placeholder="工作描述（可选）"
                    rows={3}
                    id={`desc-${item.id}`}
                  />
                </div>
                
                {/* 工作进展状态选择 */}
                <div className="mb-2">
                  <label htmlFor={`status-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    工作进展
                  </label>
                  <select
                    id={`status-${item.id}`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    defaultValue={item.status || '未开始'}
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.value}</option>
                    ))}
                  </select>
                </div>
                
                {/* 工作进展备注 */}
                <div className="mb-2">
                  <label htmlFor={`progress-notes-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    工作进展备注
                  </label>
                  <textarea
                    id={`progress-notes-${item.id}`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    defaultValue={item.progress_notes || ''}
                    placeholder="记录工作进展的详细情况、遇到的问题等（可选）"
                    rows={3}
                  />
                </div>
                
                {/* 工作标签输入 - 使用新组件 */}
                <div className="mb-2">
                  <label htmlFor={`tags-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <TagIcon className="h-4 w-4 mr-1" />
                    工作标签
                  </label>
                  <TagInput 
                    itemId={item.id} 
                    initialTags={item.tags || ''} 
                    onTagsChange={(tags) => {
                      // 可以在这里添加额外的处理逻辑
                      console.log('标签已更新:', tags);
                    }}
                  />
                </div>
                
                {/* 参与人员输入 - 使用新组件 */}
                <div className="mb-2">
                  <label htmlFor={`members-${item.id}`} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <UsersIcon className="h-4 w-4 mr-1" />
                    参与人员
                  </label>
                  <MemberInput 
                    itemId={item.id} 
                    initialMembers={item.members || ''} 
                    onMembersChange={(members) => {
                      // 可以在这里添加额外的处理逻辑
                      console.log('人员已更新:', members);
                    }}
                  />
                </div>
                
                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => updateWorkItem(
                      item.id,
                      (document.getElementById(`name-${item.id}`) as HTMLInputElement).value,
                      (document.getElementById(`desc-${item.id}`) as HTMLTextAreaElement).value,
                      (document.getElementById(`status-${item.id}`) as HTMLSelectElement).value,
                      (document.getElementById(`tags-hidden-${item.id}`) as HTMLInputElement).value,
                      (document.getElementById(`members-hidden-${item.id}`) as HTMLInputElement).value,
                      (document.getElementById(`progress-notes-${item.id}`) as HTMLTextAreaElement).value,
                      (document.getElementById(`milestone-${item.id}`) as HTMLInputElement).checked
                    )}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    disabled={isSaving}
                  >
                    {isSaving && savingItemId === item.id ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full inline-block"></div>
                        保存中...
                      </>
                    ) : "保存"}
                  </button>
                  <button
                    onClick={() => toggleEdit(item.id, true)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                    disabled={isSaving}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* 优化布局：PC端更紧凑，移动端自适应 */}
                <div className="flex flex-col sm:flex-row sm:items-center">
                  {/* 第一行/左侧：标题和状态 */}
                  <div className="flex items-center flex-grow flex-wrap">
                    {item.children.length > 0 && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="mr-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        {item.isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                        )}
                      </button>
                    )}
                    <h3 className="font-medium text-lg flex items-center">
                      {item.name}
                      {isSelected && (
                        <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          已选中
                        </span>
                      )}
                    </h3>

                    {/* 显示里程碑标识 */}
                    {item.is_milestone && (
                      <span className="ml-2 text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-medium">
                        🏁 里程碑
                      </span>
                    )}

                    {/* 显示工作状态徽章 */}
                    {item.status && (
                      <span className={`ml-2 text-xs px-3 py-1 rounded-full ${
                        item.status === '未开始' ? 'bg-gray-200 text-gray-800 border border-gray-300' :
                        item.status === '进行中' ? 'bg-blue-200 text-blue-800 border border-blue-300' :
                        item.status === '已暂停' ? 'bg-yellow-200 text-yellow-800 border border-yellow-300' :
                        item.status === '已完成' ? 'bg-green-200 text-green-800 border border-green-300' :
                        'bg-gray-200 text-gray-800 border border-gray-300'
                      }`}>
                        {item.status}
                      </span>
                    )}

                    {/* 显示工作进度 */}
                    <div className="ml-2">
                      <ProgressIndicator
                        progress={getItemProgress(item)}
                        size="sm"
                        showBar={true}
                        showText={true}
                      />
                    </div>
                    
                    {/* 显示参与人员 - 移到第一行 */}
                    {item.members && (
                      <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                        {renderMembers(item.members, true)}
                      </div>
                    )}
                    
                    {/* 显示工作标签 - 移到第一行 */}
                    {item.tags && (
                      <div className="flex flex-wrap items-center ml-2 mt-1 sm:mt-0">
                        <TagIcon className="h-3 w-3 text-gray-500 mr-1" />
                        {item.tags.split('，').filter(Boolean).map((tag, idx) => (
                          <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-1.5 py-0.5 ml-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* 操作按钮：在PC端放在右侧，移动端放在下方 */}
                  <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                    {canAddChildren && (
                      <button
                        onClick={() => addChildWorkItem(item.id, level)}
                        className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-md hover:bg-green-100 flex items-center border border-green-200 transition-colors"
                        disabled={isSaving}
                      >
                        {isSaving && savingItemId === item.id ? (
                          <>
                            <div className="animate-spin h-3 w-3 mr-1 border-2 border-t-transparent border-green-700 rounded-full"></div>
                            处理中...
                          </>
                        ) : (
                          <>
                            <PlusIcon className="h-3.5 w-3.5 mr-1" />
                            添加{level + 2}级工作项
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => toggleEdit(item.id)}
                      className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 flex items-center border border-gray-200 transition-colors"
                      disabled={isSaving}
                    >
                      <PencilIcon className="h-3.5 w-3.5 mr-1" />
                      编辑
                    </button>
                    <button
                      onClick={() => deleteWorkItem(item.id)}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-md hover:bg-red-100 flex items-center border border-red-200 transition-colors"
                      disabled={isSaving}
                    >
                      <TrashIcon className="h-3.5 w-3.5 mr-1" />
                      删除
                    </button>
                  </div>
                </div>
                
                {/* 描述区域 */}
                <div className="mt-2">
                  {/* 描述 */}
                  {item.description && (
                    <div className="text-sm text-gray-600 leading-relaxed">
                      {item.description}
                    </div>
                  )}
                </div>
                
                {/* 工作进展备注 */}
                {item.progress_notes && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <ClockIcon className="h-3.5 w-3.5" />
                      <span>工作进展备注:</span>
                    </div>
                    <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md border border-gray-100 whitespace-pre-wrap">
                      {item.progress_notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {item.children.length > 0 && item.isExpanded && (
          <div className={`pl-8 mt-3 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
            {item.children.map(child => renderWorkItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 根据选中的状态筛选工作项
  useEffect(() => {
    if (selectedStatuses.length === 0) {
      // 如果没有选择任何状态，显示所有工作项
      setFilteredWorkItems(workItems);
    } else {
      // 只保留符合筛选条件的工作项，不保留父级
      const filterItemsByStatus = (items: WorkItem[]): WorkItem[] => {
        const result: WorkItem[] = [];
        
        // 遍历每个工作项
        for (const item of items) {
          // 递归筛选子项
          const filteredChildren = filterItemsByStatus(item.children);
          
          // 如果当前项状态符合筛选条件
          if (selectedStatuses.includes(item.status || '未开始')) {
            // 添加当前项（带有筛选后的子项）
            result.push({
              ...item,
              children: filteredChildren
            });
          } else if (filteredChildren.length > 0) {
            // 如果当前项不符合条件但有符合条件的子项
            // 将符合条件的子项直接添加到结果中
            result.push(...filteredChildren);
          }
        }
        
        return result;
      };
      
      const filtered = filterItemsByStatus(workItems);
      setFilteredWorkItems(filtered);
    }
  }, [workItems, selectedStatuses]);

  // 处理状态筛选切换
  const handleStatusFilterToggle = (status: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  // 清除所有筛选条件
  const clearStatusFilters = () => {
    setSelectedStatuses([]);
  };
  
  // 设置工作项展开层级
  const handleExpandLevelChange = (level: number) => {
    setExpandLevel(level);
    
    // 更新所有工作项的展开状态
    const updateExpandState = (items: WorkItem[], currentLevel: number = 0): WorkItem[] => {
      return items.map(item => {
        const shouldExpand = currentLevel < level;
        return {
          ...item,
          isExpanded: shouldExpand,
          children: item.children.length > 0 ? updateExpandState(item.children, currentLevel + 1) : []
        };
      });
    };
    
    setWorkItems(updateExpandState(workItems));
  };

  return (
    <div className="space-y-8">
      {/* 删除确认对话框 */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">确认删除</h3>
            <p className="text-gray-600 mb-6">
              您确定要删除此工作项吗？此操作无法撤销，删除后将同时删除所有子工作项。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteWorkItem}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={isSaving}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteWorkItem}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full inline-block"></div>
                    删除中...
                  </>
                ) : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Excel导入进度对话框 */}
      {isImportingExcel && importExcelProgress > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">导入Excel中</h3>
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{importExcelStage}</span>
                <span className="text-sm font-medium text-gray-700">{importExcelProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                  style={{ width: `${importExcelProgress}%` }}
                ></div>
              </div>
            </div>
            <p className="text-gray-600 text-sm">
              请耐心等待，导入过程中请勿关闭或刷新页面...
            </p>
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">
            {selectedProject ? `${selectedProject.name} 工作分解` : '工作分解'}
          </h1>
          <WorkBreakdownGuide />
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* 项目选择器 - 放在左侧 */}
          <div className="w-full sm:w-auto">
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={selectedProject?.id || ""}
              onChange={(e) => {
                const project = projects.find(p => p.id === e.target.value);
                setSelectedProject(project || null);
              }}
              disabled={isLoading || isSaving}
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* 层级展开控制 */}
          {selectedProject && workItems.length > 0 && (
            <div className="relative">
              <select
                value={expandLevel}
                onChange={(e) => handleExpandLevelChange(parseInt(e.target.value))}
                className="px-4 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md transition-colors"
              >
                <option value="0">仅展开1级</option>
                <option value="1">展开到2级</option>
                <option value="2">展开到3级</option>
                <option value="3">展开到4级</option>
                <option value="4">展开全部</option>
              </select>
            </div>
          )}
          
          {/* 工作状态筛选下拉菜单 */}
          {selectedProject && (
            <div className="relative">
              <button
                onClick={() => setShowStatusFilter(!showStatusFilter)}
                className="px-4 py-2 text-sm font-medium flex items-center bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md transition-colors"
              >
                <ClockIcon className="h-4 w-4 mr-1" />
                工作状态筛选
                {selectedStatuses.length > 0 && (
                  <span className="ml-1 bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {selectedStatuses.length}
                  </span>
                )}
                <ChevronDown className="h-4 w-4 ml-1" />
              </button>
              
              {showStatusFilter && (
                <div 
                  ref={statusFilterRef}
                  className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-1 py-1 w-52 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                >
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500">选择工作状态</p>
                  </div>
                  
                  {STATUS_OPTIONS.map(option => (
                    <div key={option.value} className="px-3 py-2 flex items-center">
                      <input
                        type="checkbox"
                        id={`status-filter-${option.value}`}
                        checked={selectedStatuses.includes(option.value)}
                        onChange={() => handleStatusFilterToggle(option.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                      />
                      <label 
                        htmlFor={`status-filter-${option.value}`}
                        className="ml-2 flex items-center cursor-pointer"
                      >
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${option.color.split(' ')[0]}`}></span>
                        <span className="text-sm text-gray-700">{option.value}</span>
                      </label>
                    </div>
                  ))}
                  
                  <div className="border-t border-gray-100 mt-1 pt-1 px-3 py-2">
                    <button
                      onClick={clearStatusFilters}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      清除筛选条件
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 导入导出下拉菜单 */}
          {selectedProject && (
            <div className="relative">
              {/* 导入导出按钮 */}
              <button
                onClick={() => setShowImportExportMenu(!showImportExportMenu)}
                className="px-4 py-2 text-sm font-medium flex items-center bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md transition-colors"
              >
                <FileDownIcon className="h-4 w-4 mr-1" />
                导入导出
                <ChevronDown className="h-4 w-4 ml-1" />
              </button>
              
              {/* 导入导出菜单 */}
              {showImportExportMenu && (
                <div 
                  ref={importExportMenuRef}
                  className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-1 py-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200 max-h-[90vh] overflow-y-auto"
                >
                  <button
                    onClick={handleExportExcel}
                    disabled={isExportingExcel || !workItems.length}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    {isExportingExcel ? (
                      <>
                        <div className="animate-spin h-3 w-3 mr-2 border-2 border-t-transparent border-gray-700 rounded-full"></div>
                        导出Excel中...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheetIcon className="h-4 w-4 mr-2" />
                        导出Excel
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleImportExcelClick}
                    disabled={isImportingExcel}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    {isImportingExcel ? (
                      <>
                        <div className="animate-spin h-3 w-3 mr-2 border-2 border-t-transparent border-gray-700 rounded-full"></div>
                        导入Excel中...
                      </>
                    ) : (
                      <>
                        <UploadIcon className="h-4 w-4 mr-2" />
                        导入Excel
                      </>
                    )}
                  </button>
                  
                  <div className="border-t border-gray-200 my-1"></div>
                  
                  <button
                    onClick={handleDownloadTemplate}
                    disabled={isDownloadingTemplate}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    {isDownloadingTemplate ? (
                      <>
                        <div className="animate-spin h-3 w-3 mr-2 border-2 border-t-transparent border-gray-700 rounded-full"></div>
                        下载中...
                      </>
                    ) : (
                      <>
                        <FileDownIcon className="h-4 w-4 mr-2" />
                        下载Excel模板
                      </>
                    )}
                  </button>
                </div>
              )}
              
              {/* 隐藏的Excel文件输入 */}
              <input
                ref={excelFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelFileChange}
                className="hidden"
              />
            </div>
          )}
          
          {/* 视图切换按钮 - 放在右侧 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-4 py-2 text-sm font-medium flex items-center ${
                viewMode === 'edit' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-300 rounded-md transition-colors`}
            >
              <EditIcon className="h-4 w-4 mr-1" />
              编辑
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-4 py-2 text-sm font-medium flex items-center ${
                viewMode === 'preview' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-300 rounded-md transition-colors`}
            >
              <EyeIcon className="h-4 w-4 mr-1" />
              预览
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`px-4 py-2 text-sm font-medium flex items-center ${
                viewMode === 'map' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-300 rounded-md transition-colors`}
            >
              <NetworkIcon className="h-4 w-4 mr-1" />
              工作导图
            </button>
          </div>
        </div>
      </div>
      
      {/* 显示已选筛选条件 */}
      {selectedStatuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-blue-50 p-2 rounded-md border border-blue-100">
          <span className="text-xs text-blue-700">已筛选:</span>
          {selectedStatuses.map(status => (
            <span 
              key={status} 
              className="inline-flex items-center gap-1 px-2 py-1 bg-white text-blue-700 rounded-md border border-blue-200 text-xs"
            >
              {status}
              <button
                onClick={() => handleStatusFilterToggle(status)}
                className="rounded-full p-0.5 hover:bg-blue-100 text-blue-500"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearStatusFilters}
            className="text-xs text-blue-600 hover:text-blue-800 ml-2"
          >
            清除全部
          </button>
          <span className="text-xs text-blue-700 ml-auto">
            注意：仅显示符合筛选条件的工作项
          </span>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600">加载中...</span>
        </div>
      ) : (
        <div>
          {selectedProject ? (
            <div>
              {workItems.length > 0 ? (
                <div className="space-y-4">
                  {/* 项目进度统计概览 */}
                  {viewMode !== 'map' && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                          <TrendingUpIcon className="h-5 w-5 mr-2 text-blue-600" />
                          {selectedWorkItem ? `${selectedWorkItem.name} 工作项进度概览` : '项目进度概览'}
                        </h3>
                        <div className="flex items-center gap-2">
                          {!selectedWorkItem && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                              💡 点击工作项查看详细进度
                            </span>
                          )}
                          {selectedWorkItem && (
                            <button
                              onClick={() => setSelectedWorkItem(null)}
                              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                            >
                              返回项目概览
                            </button>
                          )}
                        </div>
                      </div>

                      {(() => {
                        // 根据选中的工作项确定要统计的数据范围
                        let itemsToAnalyze: WorkItem[];

                        if (selectedWorkItem) {
                          // 如果选中了工作项，统计该工作项及其所有子项
                          const collectAllChildren = (item: WorkItem): WorkItem[] => {
                            const result = [item];
                            if (item.children && Array.isArray(item.children) && item.children.length > 0) {
                              item.children.forEach(child => {
                                if (child) {
                                  result.push(...collectAllChildren(child));
                                }
                              });
                            }
                            return result;
                          };
                          itemsToAnalyze = collectAllChildren(selectedWorkItem);
                        } else {
                          // 如果没有选中工作项，使用当前筛选的结果
                          const currentItems = selectedStatuses.length > 0 ? filteredWorkItems : workItems;
                          itemsToAnalyze = Array.isArray(currentItems) ? currentItems : [];
                        }

                        const totalItems = itemsToAnalyze.length;
                        const statusCounts = STATUS_OPTIONS.reduce((acc, option) => {
                          acc[option.value] = 0;
                          return acc;
                        }, {} as Record<string, number>);

                        // 统计工作项状态（不需要递归，因为itemsToAnalyze已经包含了所有需要统计的项）
                        if (Array.isArray(itemsToAnalyze)) {
                          itemsToAnalyze.forEach(item => {
                            if (item && typeof item === 'object') {
                              if (item.status && statusCounts.hasOwnProperty(item.status)) {
                                statusCounts[item.status]++;
                              } else {
                                statusCounts['未开始']++;
                              }
                            }
                          });
                        }
                        const totalCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

                        // 计算整体进度
                        const overallProgress = totalCount > 0 ?
                          Object.entries(statusCounts).reduce((sum, [status, count]) => {
                            const statusOption = STATUS_OPTIONS.find(opt => opt.value === status);
                            return sum + (statusOption?.progress || 0) * count;
                          }, 0) / totalCount : 0;

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                            {/* 整体进度 */}
                            <div className="col-span-2 sm:col-span-4 lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                              <div className="text-sm text-blue-700 mb-1">
                                {selectedWorkItem ? '工作项进度' : '整体进度'}
                              </div>
                              <ProgressIndicator
                                progress={overallProgress}
                                size="md"
                                showBar={true}
                                showText={true}
                              />
                              <div className="text-xs text-blue-600 mt-1">
                                共 {totalCount} 个工作项
                              </div>
                            </div>

                            {/* 各状态统计 */}
                            {STATUS_OPTIONS.map(option => (
                              <div key={option.value} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <div className="text-sm text-gray-700 mb-1">{option.value}</div>
                                <div className="text-2xl font-bold text-gray-900">{statusCounts[option.value]}</div>
                                <div className="text-xs text-gray-500">
                                  {totalCount > 0 ? Math.round((statusCounts[option.value] / totalCount) * 100) : 0}%
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 思维导图视图 */}
                  {viewMode === 'map' ? (
                    <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      <WorkMap workItems={selectedStatuses.length > 0 ? filteredWorkItems : workItems} projectName={selectedProject.name} />
                    </div>
                  ) : (
                    <>
                      {viewMode === 'edit' ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={(selectedStatuses.length > 0 ? filteredWorkItems : workItems).map(item => item.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {(selectedStatuses.length > 0 ? filteredWorkItems : workItems).map(item => (
                              <SortableWorkItem
                                key={item.id}
                                item={item}
                                level={0}
                                onToggleExpand={toggleExpand}
                                onToggleEdit={toggleEdit}
                                onAddChild={addChildWorkItem}
                                onDelete={(id) => setItemToDelete(id)}
                                onUpdate={updateWorkItem}
                                renderEditForm={renderEditForm}
                                renderViewMode={renderViewMode}
                                isSaving={isSaving}
                                savingItemId={savingItemId}
                                viewMode={viewMode}
                                canAddChildren={true}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      ) : (
                        (selectedStatuses.length > 0 ? filteredWorkItems : workItems).map(item => renderWorkItem(item, 0))
                      )}

                      {/* 底部添加一级工作项按钮 */}
                      {viewMode === 'edit' && (
                        <div className="mt-8 flex justify-center">
                          <button
                            onClick={addRootWorkItem}
                            className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <>
                                <div className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full"></div>
                                处理中...
                              </>
                            ) : (
                              <>
                                <PlusIcon className="h-5 w-5 mr-2" />
                                添加1级工作项
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-white p-10 rounded-lg shadow-sm text-center border border-gray-200">
                  <p className="text-gray-500 mb-6">当前项目没有工作分解项</p>
                  {viewMode === 'edit' && (
                    <button
                      onClick={addRootWorkItem}
                      className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full"></div>
                          处理中...
                        </>
                      ) : (
                        <>
                          <PlusIcon className="h-5 w-5 mr-2" />
                          添加1级工作项
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-10 rounded-lg shadow-sm text-center border border-gray-200">
              <p className="text-gray-500 mb-6">没有可用的活跃项目</p>
              <a
                href="/dashboard/projects"
                className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                创建新项目
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 