import { createClient, WorkBreakdownItem } from "@/lib/supabase/client";

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
        members: item.members || ''
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