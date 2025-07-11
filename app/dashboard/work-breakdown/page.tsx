"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, Project } from "@/lib/supabase/client";
import { WorkBreakdownService, WorkItem } from "@/lib/services/work-breakdown";
import { toast } from "sonner";
import { PlusIcon, ChevronDownIcon, ChevronRightIcon, XIcon, PencilIcon, TrashIcon, Eye as EyeIcon, Edit as EditIcon } from "lucide-react";

// 视图模式
type ViewMode = 'edit' | 'preview';

export default function WorkBreakdownPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const workBreakdownService = new WorkBreakdownService();
  
  // 状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('edit'); // 默认编辑模式
  const [isSaving, setIsSaving] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null); // 正在保存的工作项ID
  const [itemToDelete, setItemToDelete] = useState<string | null>(null); // 待删除的工作项ID
  // 添加请求控制状态
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  
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
      
      setWorkItems(formattedItems);
      setLastProjectId(projectId);
    } catch (error) {
      console.error('获取工作分解数据失败', error);
      toast.error('获取工作分解数据失败');
    } finally {
      setIsLoading(false);
      setIsLoadingItems(false);
    }
  }, [user, workBreakdownService]);

  // 初始加载
  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // 当选择的项目变化时，加载该项目的工作分解数据
  useEffect(() => {
    if (selectedProject?.id && user?.id && !isLoadingItems) {
      // 只有当项目ID变化时才重新加载数据
      if (selectedProject.id !== lastProjectId) {
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
      position: newPosition  // 确保position正确设置
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
      position: newPosition
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
  const updateWorkItem = async (id: string, name: string, description: string) => {
    console.log('开始保存工作项:', { id, name, description });
    
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
      
      // 强制检查是否为临时项
      const forceCheckIsTemp = foundItem.id.startsWith('temp-');
      
      // 递归更新子项的编辑状态
      const updateChildrenEditState = (children: WorkItem[], targetId: string, newName: string, newDescription: string): WorkItem[] => {
        return children.map(child => {
          if (isIdMatch(child.id, targetId) || isIdMatch(child.dbId, targetId)) {
            return { ...child, name: newName, description: newDescription, isEditing: false };
          }
          
          if (child.children.length > 0) {
            return {
              ...child,
              children: updateChildrenEditState(child.children, targetId, newName, newDescription)
            };
          }
          
          return child;
        });
      };
      
      // 立即更新前端状态，确保编辑状态关闭
      const updatedItems = workItems.map(item => {
        if (isIdMatch(item.id, id) || isIdMatch(item.dbId, id)) {
          return { ...item, name, description, isEditing: false };
        }
        
        // 递归处理子项
        if (item.children.length > 0) {
          return { 
            ...item, 
            children: item.children.map(child => {
              if (isIdMatch(child.id, id) || isIdMatch(child.dbId, id)) {
                return { ...child, name, description, isEditing: false };
              }
              
              // 递归处理更深层级的子项
              if (child.children.length > 0) {
                return {
                  ...child,
                  children: updateChildrenEditState(child.children, id, name, description)
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
          position: parentInfo.position
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
          parentInfo.position
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
        console.log('更新现有工作项:', { id: foundItem.dbId, name, description });
        await workBreakdownService.updateWorkItem(foundItem.dbId, { name, description });
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
  
  // 渲染工作项组件
  const renderWorkItem = (item: WorkItem, level: number) => {
    // 限制最多5级（0-4级）
    const canAddChildren = level < 4;
    
    // 预览模式下的简化渲染
    if (viewMode === 'preview') {
      return (
        <div key={item.id} className="mb-2">
          <div className={`flex items-start p-3 bg-white rounded-lg shadow border-l-4 ${
            level === 0 ? 'border-l-blue-500' :
            level === 1 ? 'border-l-green-500' :
            level === 2 ? 'border-l-yellow-500' :
            level === 3 ? 'border-l-purple-500' :
            'border-l-red-500'
          }`}>
            <div className="flex-grow">
              <div>
                <div className="flex items-center">
                  {item.children.length > 0 && (
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="mr-2 p-1 rounded-md hover:bg-gray-100"
                    >
                      {item.isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <h3 className="font-medium">{item.name}</h3>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                )}
              </div>
            </div>
          </div>
          
          {item.children.length > 0 && item.isExpanded && (
            <div className={`pl-6 mt-2 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
              {item.children.map(child => renderWorkItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    }
    
    // 编辑模式下的渲染
    return (
      <div key={item.id} className="mb-2">
        <div className={`flex items-start p-3 bg-white rounded-lg shadow border-l-4 ${
          level === 0 ? 'border-l-blue-500' :
          level === 1 ? 'border-l-green-500' :
          level === 2 ? 'border-l-yellow-500' :
          level === 3 ? 'border-l-purple-500' :
          'border-l-red-500'
        }`}>
          <div className="flex-grow">
            {item.isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue={item.name}
                  placeholder="工作项名称"
                  id={`name-${item.id}`}
                />
                <textarea
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue={item.description}
                  placeholder="工作描述（可选）"
                  rows={3}
                  id={`desc-${item.id}`}
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => updateWorkItem(
                      item.id,
                      (document.getElementById(`name-${item.id}`) as HTMLInputElement).value,
                      (document.getElementById(`desc-${item.id}`) as HTMLTextAreaElement).value
                    )}
                    className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    disabled={isSaving}
                  >
                    {isSaving && savingItemId === item.id ? (
                      <>
                        <div className="animate-spin h-3 w-3 mr-1 border-2 border-t-transparent border-white rounded-full inline-block"></div>
                        保存中...
                      </>
                    ) : "保存"}
                  </button>
                  <button
                    onClick={() => toggleEdit(item.id, true)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    disabled={isSaving}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center">
                  {item.children.length > 0 && (
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="mr-2 p-1 rounded-md hover:bg-gray-100"
                    >
                      {item.isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <h3 className="font-medium">{item.name}</h3>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {canAddChildren && (
                    <button
                      onClick={() => addChildWorkItem(item.id, level)}
                      className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center"
                      disabled={isSaving}
                    >
                      {isSaving && savingItemId === item.id ? (
                        <>
                          <div className="animate-spin h-3 w-3 mr-1 border-2 border-t-transparent border-green-700 rounded-full"></div>
                          处理中...
                        </>
                      ) : (
                        <>
                          <PlusIcon className="h-3 w-3 mr-1" />
                          添加{level + 2}级工作项
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => toggleEdit(item.id)}
                    className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 flex items-center"
                    disabled={isSaving}
                  >
                    <PencilIcon className="h-3 w-3 mr-1" />
                    编辑
                  </button>
                  <button
                    onClick={() => deleteWorkItem(item.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center"
                    disabled={isSaving}
                  >
                    <TrashIcon className="h-3 w-3 mr-1" />
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {item.children.length > 0 && item.isExpanded && (
          <div className={`pl-6 mt-2 ${level < 4 ? 'border-l border-gray-200' : ''}`}>
            {item.children.map(child => renderWorkItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 删除确认对话框 */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">确认删除</h3>
            <p className="text-gray-600 mb-6">
              您确定要删除此工作项吗？此操作无法撤销，删除后将同时删除所有子工作项。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteWorkItem}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={isSaving}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteWorkItem}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
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
      
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">
          {selectedProject ? `${selectedProject.name} 工作分解` : '工作分解'}
        </h1>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* 项目选择器 - 放在左侧 */}
          <div className="w-full sm:w-auto">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          
          {/* 视图切换按钮 - 放在右侧 */}
          <div className="flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-4 py-2 text-sm font-medium flex items-center ${
                viewMode === 'preview' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-300 rounded-l-md`}
            >
              <EyeIcon className="h-4 w-4 mr-1" />
              预览
            </button>
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-4 py-2 text-sm font-medium flex items-center ${
                viewMode === 'edit' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-300 border-l-0 rounded-r-md`}
            >
              <EditIcon className="h-4 w-4 mr-1" />
              编辑
            </button>
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">加载中...</span>
        </div>
      ) : (
        <div>
          {selectedProject ? (
            <div>
              {workItems.length > 0 ? (
                <div className="space-y-4">
                  {workItems.map(item => renderWorkItem(item, 0))}
                  
                  {/* 底部添加一级工作项按钮 */}
                  {viewMode === 'edit' && (
                    <div className="mt-6 flex justify-center">
                      <button
                        onClick={addRootWorkItem}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
                </div>
              ) : (
                <div className="bg-white p-8 rounded-lg shadow text-center">
                  <p className="text-gray-500 mb-4">当前项目没有工作分解项</p>
                  {viewMode === 'edit' && (
                    <button
                      onClick={addRootWorkItem}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <p className="text-gray-500 mb-4">没有可用的活跃项目</p>
              <a
                href="/dashboard/projects"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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