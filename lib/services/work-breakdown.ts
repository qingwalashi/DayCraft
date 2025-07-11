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
  planned_start_time?: string;
  planned_end_time?: string;
  actual_start_time?: string;
  actual_end_time?: string;
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
    members: string = ''
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
  async importFromExcel(file: File, projectId: string, userId: string): Promise<WorkItem[]> {
    try {
      // 解析Excel文件
      const importedItems = await this.excelConverter.importFromExcel(file);
      
      // 保存到数据库
      await this.saveImportedItems(importedItems, projectId, userId);
      
      // 清除缓存
      this.invalidateCache(projectId, userId);
      
      // 重新获取工作分解项
      return this.getWorkBreakdownItems(projectId, userId);
    } catch (error) {
      console.error('导入Excel文件失败', error);
      throw new Error('导入Excel文件失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  
  // 保存导入的工作项到数据库
  private async saveImportedItems(items: WorkItem[], projectId: string, userId: string, parentId: string | null = null): Promise<void> {
    // 遍历所有工作项
    for (const item of items) {
      // 添加工作项
      const { id } = await this.addWorkItem(
        projectId,
        userId,
        item.name,
        item.description,
        parentId,
        item.level,
        item.position,
        item.status || '未开始',
        item.tags || '',
        item.members || ''
      );
      
      // 递归处理子项
      if (item.children && item.children.length > 0) {
        await this.saveImportedItems(item.children, projectId, userId, id);
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
        planned_start_time: item.planned_start_time || undefined,
        planned_end_time: item.planned_end_time || undefined,
        actual_start_time: item.actual_start_time || undefined,
        actual_end_time: item.actual_end_time || undefined
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