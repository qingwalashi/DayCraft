import JSZip from 'jszip';
import { WorkItem } from './work-breakdown';

/**
 * XMind转换服务类
 * 用于处理工作分解项与XMind格式之间的转换
 * 简化版：只处理工作项名称和描述
 */
export class XMindConverter {
  /**
   * 将工作分解项导出为XMind格式
   * @param workItems 工作分解项数组
   * @param projectName 项目名称
   * @returns XMind文件的二进制数据
   */
  async exportToXMind(workItems: WorkItem[], projectName: string): Promise<Blob> {
    // 创建XMind文件所需的内容结构
    const content = this.createXMindContent(workItems, projectName);
    
    // 创建ZIP文件
    const zip = new JSZip();
    
    // 添加content.json文件
    zip.file("content.json", JSON.stringify(content));
    
    // 添加meta.json文件
    const meta = {
      "creator": {
        "name": "DayCraft",
        "version": "1.0.0"
      },
      "time": {
        "created": new Date().getTime()
      }
    };
    zip.file("meta.json", JSON.stringify(meta));
    
    // 添加空的styles.json文件
    zip.file("styles.json", JSON.stringify({}));
    
    // 生成ZIP文件
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/xmind" });
    return blob;
  }
  
  /**
   * 从XMind文件导入工作分解项
   * @param file XMind文件
   * @returns 工作分解项数组
   */
  async importFromXMind(file: File): Promise<WorkItem[]> {
    try {
      // 读取ZIP文件
      const zip = await JSZip.loadAsync(file);
      
      // 读取content.json文件
      const contentFile = zip.file("content.json");
      if (!contentFile) {
        throw new Error("无效的XMind文件：缺少content.json");
      }
      
      const contentText = await contentFile.async("text");
      const content = JSON.parse(contentText);
      
      // 解析XMind内容为工作分解项
      return this.parseXMindContent(content);
    } catch (error) {
      console.error("导入XMind文件失败", error);
      throw new Error("导入XMind文件失败：" + (error instanceof Error ? error.message : "未知错误"));
    }
  }
  
  /**
   * 创建XMind内容结构
   * @param workItems 工作分解项数组
   * @param projectName 项目名称
   * @returns XMind内容结构
   */
  private createXMindContent(workItems: WorkItem[], projectName: string) {
    // XMind内容结构
    const rootTopic = {
      id: "root",
      title: projectName || "工作分解",
      children: {
        attached: this.convertWorkItemsToTopics(workItems)
      }
    };
    
    return [{
      id: "sheet-1",
      title: "工作分解",
      rootTopic
    }];
  }
  
  /**
   * 将工作分解项转换为XMind主题
   * @param workItems 工作分解项数组
   * @returns XMind主题数组
   */
  private convertWorkItemsToTopics(workItems: WorkItem[]) {
    return workItems.map(item => {
      const topic: any = {
        id: item.dbId || item.id,
        title: item.name
      };
      
      // 添加描述
      if (item.description) {
        topic.notes = {
          plain: {
            content: item.description
          }
        };
      }
      
      // 处理子项
      if (item.children && item.children.length > 0) {
        topic.children = {
          attached: this.convertWorkItemsToTopics(item.children)
        };
      }
      
      return topic;
    });
  }
  
  /**
   * 解析XMind内容为工作分解项
   * @param content XMind内容
   * @returns 工作分解项数组
   */
  private parseXMindContent(content: any): WorkItem[] {
    try {
      // 获取第一个sheet的根主题
      const sheet = content[0];
      if (!sheet || !sheet.rootTopic) {
        throw new Error("无效的XMind内容：缺少rootTopic");
      }
      
      const rootTopic = sheet.rootTopic;
      
      // 解析子主题
      if (rootTopic.children && rootTopic.children.attached) {
        return this.convertTopicsToWorkItems(rootTopic.children.attached);
      }
      
      return [];
    } catch (error) {
      console.error("解析XMind内容失败", error);
      throw new Error("解析XMind内容失败：" + (error instanceof Error ? error.message : "未知错误"));
    }
  }
  
  /**
   * 将XMind主题转换为工作分解项
   * @param topics XMind主题数组
   * @param level 层级
   * @returns 工作分解项数组
   */
  private convertTopicsToWorkItems(topics: any[], level: number = 0): WorkItem[] {
    return topics.map((topic, index) => {
      // 基本信息
      const workItem: WorkItem = {
        id: `import-${topic.id || Date.now() + index}`,
        name: topic.title || "未命名工作项",
        description: topic.notes?.plain?.content || "",
        children: [],
        level,
        position: index,
        isExpanded: true,
        status: '未开始' // 默认状态
      };
      
      // 处理子项
      if (topic.children && topic.children.attached) {
        workItem.children = this.convertTopicsToWorkItems(topic.children.attached, level + 1);
      }
      
      return workItem;
    });
  }
} 