import { createClient, WorkBreakdownItem } from "@/lib/supabase/client";
import { XMindConverter } from "./xmind-converter";
import { ExcelConverter } from "./excel-converter";
import { saveAs } from 'file-saver';

// 前端工作项类型
export interface WorkItem {
  id: string;
  name: string;
  description: string;
  children: WorkItem[];
  isExpanded?: boolean;
  isEditing?: boolean;
  shouldDelete?: boolean;
  dbId?: string;
  level: number;
  position: number;
  status?: string;
  tags?: string;
  members?: string;
  progress_notes?: string;
  planned_start_time?: string;
  planned_end_time?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  is_milestone?: boolean;
}

interface WorkBreakdownItemResponse {
  id: string;
  [key: string]: any;
}

// 缓存接口
interface Cache {
  [key: string]: {
    data: WorkItem[];
    timestamp: number;
  };
}

export class WorkBreakdownService {
  private supabase = createClient();
  private cache: Cache = {};
  private cacheDuration = 60000; // 缓存有效期1分钟
  private xmindConverter = new XMindConverter();
  private excelConverter = new ExcelConverter();
  
  // 获取项目的工作分解项
  async getWorkBreakdownItems(projectId: any, userId: any): Promise<WorkItem[]> {
    if (!projectId || !userId) {
      return [];
    }
    
    const cacheKey = `${projectId}_${userId}`;
    const now = Date.now();
    
    // 检查缓存
    if (this.cache[cacheKey] && (now - this.cache[cacheKey].timestamp < this.cacheDuration)) {
      console.log('从缓存获取工作分解数据');
      return this.cache[cacheKey].data;
    }
    
    console.log('从服务器获取工作分解数据');
    const { data, error } = await this.supabase
      .from('work_breakdown_items')
      .select('*')
      .eq('project_id', String(projectId))
      .eq('user_id', String(userId))
      .order('position');
      
    if (error) {
      throw error;
    }
    
    // 将扁平数据转换为树形结构
    const items = data as WorkBreakdownItem[];
    const treeItems = this.buildWorkItemsTree(items);
    
    // 更新缓存
    this.cache[cacheKey] = {
      data: treeItems,
      timestamp: now
    };
    
    return treeItems;
  }
  
  // 添加工作项
  async addWorkItem(
    projectId: string,
    userId: string,
    name: string,
    description: string,
    parentId: string | null,
    level: number,
    position: number,
    status: string = '未开始',
    tags: string = '',
    members: string = '',
    progress_notes: string = '',
    planned_start_time: string = '',
    planned_end_time: string = '',
    actual_start_time: string = '',
    actual_end_time: string = '',
    is_milestone: boolean = false
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase
      .from('work_breakdown_items')
      .insert({
        project_id: projectId,
        name,
        description,
        parent_id: parentId,
        level,
        position,
        is_expanded: true,
        status,
        tags,
        members,
        progress_notes,
        planned_start_time: planned_start_time || null,
        planned_end_time: planned_end_time || null,
        actual_start_time: actual_start_time || null,
        actual_end_time: actual_end_time || null,
        is_milestone,
        user_id: userId
      })
      .select('id')
      .single();
      
    if (error) {
      throw error;
    }
    
    // 清除相关缓存
    this.invalidateCache(projectId, userId);
    
    return { id: (data as WorkBreakdownItemResponse).id };
  }
  
  // 更新工作项
  async updateWorkItem(id: string, updates: Partial<WorkBreakdownItem>): Promise<void> {
    // 先获取工作项信息，以便清除缓存
    const { data: itemData } = await this.supabase
      .from('work_breakdown_items')
      .select('project_id, user_id')
      .eq('id', id)
      .single();

    const { error } = await this.supabase
      .from('work_breakdown_items')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw error;
    }

    // 清除相关缓存
    if (itemData) {
      const projectId = itemData.project_id as string;
      const userId = itemData.user_id as string;
      this.invalidateCache(projectId, userId);
    }
  }

  // 批量更新工作项位置
  async updateWorkItemPositions(updates: Array<{ id: string; position: number }>): Promise<void> {
    if (updates.length === 0) return;

    // 获取第一个工作项的项目和用户信息用于清除缓存
    const { data: itemData } = await this.supabase
      .from('work_breakdown_items')
      .select('project_id, user_id')
      .eq('id', updates[0].id)
      .single();

    // 批量更新位置
    for (const update of updates) {
      const { error } = await this.supabase
        .from('work_breakdown_items')
        .update({ position: update.position })
        .eq('id', update.id);

      if (error) {
        throw error;
      }
    }

    // 清除相关缓存
    if (itemData) {
      const projectId = itemData.project_id as string;
      const userId = itemData.user_id as string;
      this.invalidateCache(projectId, userId);
    }
  }

  // 移动工作项到新的父级或层级
  async moveWorkItem(
    itemId: string,
    newParentId: string | null,
    targetPosition?: number
  ): Promise<void> {
    // 1. 获取要移动的工作项信息
    const { data: itemData, error: itemError } = await this.supabase
      .from('work_breakdown_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !itemData) {
      throw new Error('工作项不存在');
    }

    // 确保 itemData 有必要的属性
    if (typeof itemData.project_id !== 'string') {
      throw new Error('工作项数据异常：缺少项目ID');
    }

    // 2. 验证移动的合法性
    await this.validateMove(itemId, newParentId);

    // 3. 计算新的层级
    let newLevel = 0;
    if (newParentId) {
      const { data: parentData, error: parentError } = await this.supabase
        .from('work_breakdown_items')
        .select('level')
        .eq('id', newParentId)
        .single();

      if (parentError || !parentData) {
        throw new Error('目标父级工作项不存在');
      }

      // 确保 level 是数字类型
      if (typeof parentData.level !== 'number') {
        throw new Error('父级工作项层级数据异常');
      }

      newLevel = parentData.level + 1;
    }

    // 4. 检查层级限制（最多5级：0-4）
    const maxDepth = await this.calculateMaxDepthAfterMove(itemId, newLevel);
    if (maxDepth > 4) {
      throw new Error('移动后的层级深度超过限制（最多5级）');
    }

    // 5. 计算目标位置
    let finalPosition = targetPosition;
    if (finalPosition === undefined) {
      // 如果没有指定位置，放在目标位置的末尾
      let query = this.supabase
        .from('work_breakdown_items')
        .select('position')
        .eq('project_id', itemData.project_id);

      // 根据 newParentId 是否为 null 来构建查询
      if (newParentId === null) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', newParentId);
      }

      const { data: siblingsData } = await query
        .order('position', { ascending: false })
        .limit(1);

      finalPosition = siblingsData && siblingsData.length > 0 && typeof siblingsData[0].position === 'number'
        ? siblingsData[0].position + 1
        : 0;
    }

    // 6. 开始事务性更新
    await this.performMoveTransaction(itemId, newParentId, newLevel, finalPosition, itemData);
  }

  // 验证移动的合法性
  private async validateMove(itemId: string, newParentId: string | null): Promise<void> {
    if (!newParentId) {
      // 移动为根级，无需额外验证
      return;
    }

    // 检查是否会造成循环引用
    const isDescendant = await this.isDescendantOf(newParentId, itemId);
    if (isDescendant) {
      throw new Error('不能将工作项移动到自己的子项下');
    }
  }

  // 检查是否为子项关系
  private async isDescendantOf(potentialDescendantId: string, ancestorId: string): Promise<boolean> {
    const { data: itemData } = await this.supabase
      .from('work_breakdown_items')
      .select('parent_id')
      .eq('id', potentialDescendantId)
      .single();

    if (!itemData || !itemData.parent_id || typeof itemData.parent_id !== 'string') {
      return false;
    }

    if (itemData.parent_id === ancestorId) {
      return true;
    }

    // 递归检查
    return this.isDescendantOf(itemData.parent_id, ancestorId);
  }

  // 计算移动后的最大深度
  private async calculateMaxDepthAfterMove(itemId: string, newLevel: number): Promise<number> {
    const { data: childrenData } = await this.supabase
      .from('work_breakdown_items')
      .select('level')
      .eq('parent_id', itemId);

    if (!childrenData || childrenData.length === 0) {
      return newLevel;
    }

    // 找到当前子项的最大层级
    const currentMaxChildLevel = Math.max(...childrenData
      .map(child => typeof child.level === 'number' ? child.level : 0)
    );

    // 计算当前项的层级
    const { data: currentItemData } = await this.supabase
      .from('work_breakdown_items')
      .select('level')
      .eq('id', itemId)
      .single();

    if (!currentItemData || typeof currentItemData.level !== 'number') {
      return newLevel;
    }

    // 计算层级差异
    const levelDiff = newLevel - currentItemData.level;

    return currentMaxChildLevel + levelDiff;
  }

  // 执行移动事务
  private async performMoveTransaction(
    itemId: string,
    newParentId: string | null,
    newLevel: number,
    newPosition: number,
    itemData: any
  ): Promise<void> {
    // 1. 更新被移动的工作项
    const { error: updateError } = await this.supabase
      .from('work_breakdown_items')
      .update({
        parent_id: newParentId,
        level: newLevel,
        position: newPosition
      })
      .eq('id', itemId);

    if (updateError) {
      throw updateError;
    }

    // 2. 递归更新所有子项的层级
    await this.updateChildrenLevels(itemId, newLevel);

    // 3. 重新整理目标位置的兄弟项位置
    await this.reorderSiblings(newParentId, itemData.project_id, newPosition, itemId);

    // 4. 重新整理原位置的兄弟项位置
    if (itemData.parent_id !== newParentId) {
      await this.reorderSiblingsAfterRemoval(itemData.parent_id, itemData.project_id, itemData.position);
    }

    // 5. 清除缓存
    this.invalidateCache(itemData.project_id, itemData.user_id);
  }

  // 递归更新子项层级
  private async updateChildrenLevels(parentId: string, parentLevel: number): Promise<void> {
    const { data: childrenData } = await this.supabase
      .from('work_breakdown_items')
      .select('id, level')
      .eq('parent_id', parentId);

    if (!childrenData || childrenData.length === 0) {
      return;
    }

    const newChildLevel = parentLevel + 1;

    // 批量更新子项层级
    for (const child of childrenData) {
      if (typeof child.id !== 'string') {
        continue; // 跳过无效的子项
      }

      const { error } = await this.supabase
        .from('work_breakdown_items')
        .update({ level: newChildLevel })
        .eq('id', child.id);

      if (error) {
        throw error;
      }

      // 递归更新子项的子项
      await this.updateChildrenLevels(child.id, newChildLevel);
    }
  }

  // 重新整理兄弟项位置（插入新项后）
  private async reorderSiblings(
    parentId: string | null,
    projectId: string,
    insertPosition: number,
    excludeItemId: string
  ): Promise<void> {
    let query = this.supabase
      .from('work_breakdown_items')
      .select('id, position')
      .eq('project_id', projectId)
      .neq('id', excludeItemId);

    // 根据 parentId 是否为 null 来构建查询
    if (parentId === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', parentId);
    }

    const { data: siblingsData } = await query.order('position');

    if (!siblingsData || siblingsData.length === 0) {
      return;
    }

    // 更新位置大于等于插入位置的兄弟项
    for (const sibling of siblingsData) {
      if (typeof sibling.position === 'number' && typeof sibling.id === 'string' && sibling.position >= insertPosition) {
        const { error } = await this.supabase
          .from('work_breakdown_items')
          .update({ position: sibling.position + 1 })
          .eq('id', sibling.id);

        if (error) {
          throw error;
        }
      }
    }
  }

  // 重新整理兄弟项位置（移除项后）
  private async reorderSiblingsAfterRemoval(
    parentId: string | null,
    projectId: string,
    removedPosition: number
  ): Promise<void> {
    let query = this.supabase
      .from('work_breakdown_items')
      .select('id, position')
      .eq('project_id', projectId)
      .gt('position', removedPosition);

    // 根据 parentId 是否为 null 来构建查询
    if (parentId === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', parentId);
    }

    const { data: siblingsData } = await query.order('position');

    if (!siblingsData || siblingsData.length === 0) {
      return;
    }

    // 更新位置大于移除位置的兄弟项
    for (const sibling of siblingsData) {
      if (typeof sibling.position === 'number' && typeof sibling.id === 'string') {
        const { error } = await this.supabase
          .from('work_breakdown_items')
          .update({ position: sibling.position - 1 })
          .eq('id', sibling.id);

        if (error) {
          throw error;
        }
      }
    }
  }

  // 获取可作为父级的工作项列表（用于移动对话框）
  async getPotentialParents(
    projectId: string,
    userId: string,
    excludeItemId: string
  ): Promise<Array<{ id: string; name: string; level: number; path: string }>> {
    // 获取完整的工作项树结构
    const workItemsTree = await this.getWorkBreakdownItems(projectId, userId);

    // 将树形结构扁平化为按显示顺序排列的列表
    const flattenItems = (items: WorkItem[], result: any[] = []): any[] => {
      for (const item of items) {
        // 排除要移动的项目本身
        if (item.dbId !== excludeItemId) {
          result.push({
            id: item.dbId,
            name: item.name,
            level: item.level,
            parent_id: null // 这里不需要parent_id，因为我们已经有了树形结构
          });
        }

        // 递归处理子项
        if (item.children && item.children.length > 0) {
          flattenItems(item.children, result);
        }
      }
      return result;
    };

    const allItems = flattenItems(workItemsTree);

    // 过滤掉不能作为父级的项（子项和层级过深的项）
    const validParents: Array<{ id: string; name: string; level: number; path: string }> = [];

    for (const item of allItems) {
      if (!item.id) continue;

      // 检查是否为要移动项的子项
      const isDescendant = await this.isDescendantOf(item.id, excludeItemId);

      // 检查层级限制（父级最多为3级，这样子项最多为4级）
      if (!isDescendant && item.level < 4) {
        // 构建路径
        const path = await this.buildItemPathFromTree(item.id, workItemsTree);
        validParents.push({
          id: item.id,
          name: item.name,
          level: item.level,
          path
        });
      }
    }

    return validParents;
  }

  // 构建工作项路径
  private async buildItemPath(itemId: string, allItems: any[]): Promise<string> {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return '';

    if (!item.parent_id) {
      return item.name;
    }

    const parentPath = await this.buildItemPath(item.parent_id, allItems);
    return `${parentPath} > ${item.name}`;
  }

  // 从树形结构构建工作项路径
  private buildItemPathFromTree(itemId: string, items: WorkItem[], parentPath: string = ''): string {
    for (const item of items) {
      const currentPath = parentPath ? `${parentPath} > ${item.name}` : item.name;

      if (item.dbId === itemId) {
        return currentPath;
      }

      if (item.children && item.children.length > 0) {
        const childPath = this.buildItemPathFromTree(itemId, item.children, currentPath);
        if (childPath) {
          return childPath;
        }
      }
    }
    return '';
  }

  // 删除工作项
  async deleteWorkItem(id: string): Promise<void> {
    // 先获取工作项信息，以便清除缓存
    const { data: itemData } = await this.supabase
      .from('work_breakdown_items')
      .select('project_id, user_id')
      .eq('id', id)
      .single();
      
    const { error } = await this.supabase
      .from('work_breakdown_items')
      .delete()
      .eq('id', id);
      
    if (error) {
      throw error;
    }
    
    // 清除相关缓存
    if (itemData) {
      const projectId = itemData.project_id as string;
      const userId = itemData.user_id as string;
      this.invalidateCache(projectId, userId);
    }
  }
  
  // 导出为XMind文件
  async exportToXMind(workItems: WorkItem[], projectName: string): Promise<void> {
    try {
      const blob = await this.xmindConverter.exportToXMind(workItems, projectName);
      // 使用file-saver保存文件
      saveAs(blob, `${projectName || '工作分解'}.xmind`);
      return Promise.resolve();
    } catch (error) {
      console.error('导出XMind文件失败', error);
      throw new Error('导出XMind文件失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 导出为Excel文件
  exportToExcel(workItems: WorkItem[], projectName: string): void {
    try {
      const blob = this.excelConverter.exportToExcel(workItems, projectName);
      // 使用file-saver保存文件
      saveAs(blob, `${projectName || '工作分解'}.xlsx`);
    } catch (error) {
      console.error('导出Excel文件失败', error);
      throw new Error('导出Excel文件失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 下载Excel导入模板
  downloadExcelTemplate(): void {
    try {
      const blob = this.excelConverter.createImportTemplate();
      // 使用file-saver保存文件
      saveAs(blob, '工作分解导入模板.xlsx');
    } catch (error) {
      console.error('下载Excel模板失败', error);
      throw new Error('下载Excel模板失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 从XMind文件导入
  async importFromXMind(file: File, projectId: string, userId: string): Promise<WorkItem[]> {
    try {
      // 解析XMind文件
      const importedItems = await this.xmindConverter.importFromXMind(file);
      
      // 保存到数据库
      await this.saveImportedItems(importedItems, projectId, userId);
      
      // 清除缓存
      this.invalidateCache(projectId, userId);
      
      // 重新获取工作分解项
      return this.getWorkBreakdownItems(projectId, userId);
    } catch (error) {
      console.error('导入XMind文件失败', error);
      throw new Error('导入XMind文件失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 从Excel文件导入
  async importFromExcel(file: File, projectId: string, userId: string, progressCallback?: (progress: number) => void): Promise<WorkItem[]> {
    try {
      // 解析Excel文件
      const importedItems = await this.excelConverter.importFromExcel(file, progressCallback);
      
      // 更新进度 - 开始保存到数据库
      progressCallback?.(80);
      
      // 保存到数据库
      await this.saveImportedItems(importedItems, projectId, userId);
      
      // 更新进度 - 数据库保存完成
      progressCallback?.(90);
      
      // 清除缓存
      this.invalidateCache(projectId, userId);
      
      // 更新进度 - 完成
      progressCallback?.(100);
      
      // 重新获取工作分解项
      return this.getWorkBreakdownItems(projectId, userId);
    } catch (error) {
      console.error('导入Excel文件失败', error);
      throw new Error('导入Excel文件失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 保存导入的工作项
  private async saveImportedItems(items: WorkItem[], projectId: string, userId: string, parentId: string | null = null): Promise<void> {
    // 按顺序保存工作项
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 添加工作项
      const result = await this.addWorkItem(
        projectId,
        userId,
        item.name,
        item.description,
        parentId,
        item.level,
        i,
        item.status || '未开始',
        item.tags || '',
        item.members || '',
        item.progress_notes || '',
        item.planned_start_time || '',
        item.planned_end_time || '',
        item.actual_start_time || '',
        item.actual_end_time || '',
        item.is_milestone || false
      );
      
      // 递归保存子项
      if (item.children && item.children.length > 0) {
        await this.saveImportedItems(item.children, projectId, userId, result.id);
      }
    }
  }
  
  // 清除缓存
  private invalidateCache(projectId: string, userId: string): void {
    const cacheKey = `${projectId}_${userId}`;
    if (this.cache[cacheKey]) {
      delete this.cache[cacheKey];
      console.log(`清除缓存: ${cacheKey}`);
    }
  }
  
  // 将扁平数据转换为树形结构
  private buildWorkItemsTree(items: WorkBreakdownItem[]): WorkItem[] {
    const itemMap: Record<string, WorkItem> = {};
    const rootItems: WorkItem[] = [];
    
    // 首先创建所有工作项对象
    items.forEach(item => {
      itemMap[item.id] = {
        id: `db-${item.id}`, // 添加前缀，区分前端生成的临时ID
        dbId: item.id,
        name: item.name,
        description: item.description || '',
        children: [],
        isExpanded: item.is_expanded,
        level: item.level,
        position: item.position,
        status: item.status,
        tags: item.tags || '',
        members: item.members || '',
        progress_notes: item.progress_notes || '',
        planned_start_time: item.planned_start_time || undefined,
        planned_end_time: item.planned_end_time || undefined,
        actual_start_time: item.actual_start_time || undefined,
        actual_end_time: item.actual_end_time || undefined,
        is_milestone: item.is_milestone || false
      };
    });
    
    // 然后构建树形结构
    items.forEach(item => {
      const workItem = itemMap[item.id];
      
      if (item.parent_id && itemMap[item.parent_id]) {
        // 如果有父级，添加到父级的children中
        itemMap[item.parent_id].children.push(workItem);
      } else {
        // 否则作为根节点
        rootItems.push(workItem);
      }
    });
    
    // 对每个级别的子项按position排序
    const sortChildren = (items: WorkItem[]) => {
      items.sort((a, b) => a.position - b.position);
      items.forEach(item => {
        if (item.children.length > 0) {
          sortChildren(item.children);
        }
      });
    };
    
    sortChildren(rootItems);
    
    return rootItems;
  }
}

// 导出服务实例
export const workBreakdownService = new WorkBreakdownService();