import * as XLSX from 'xlsx';
import { WorkItem } from './work-breakdown';

/**
 * Excel转换服务类
 * 用于处理工作分解项与Excel格式之间的转换
 */
export class ExcelConverter {
  /**
   * 将工作分解项导出为Excel格式
   * @param workItems 工作分解项数组
   * @param projectName 项目名称
   * @returns Excel文件的二进制数据
   */
  exportToExcel(workItems: WorkItem[], projectName: string): Blob {
    // 扁平化工作项树，转换为表格结构
    const rows = this.flattenWorkItems(workItems);
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 创建工作表
    const ws = XLSX.utils.json_to_sheet(rows);
    
    // 设置列宽
    const colWidths = [
      { wch: 5 },  // 层级
      { wch: 40 }, // 工作项名称
      { wch: 50 }, // 工作描述
      { wch: 15 }, // 工作进展
      { wch: 30 }, // 工作标签
      { wch: 30 }, // 参与人员
    ];
    ws['!cols'] = colWidths;
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, projectName || '工作分解');
    
    // 生成Excel文件
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    return blob;
  }
  
  /**
   * 从Excel文件导入工作分解项
   * @param file Excel文件
   * @returns 工作分解项数组
   */
  async importFromExcel(file: File): Promise<WorkItem[]> {
    try {
      // 读取Excel文件
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      
      // 获取第一个工作表
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      
      // 转换为JSON
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      
      // 解析为工作项树
      return this.buildWorkItemsTree(rows);
    } catch (error) {
      console.error("导入Excel文件失败", error);
      throw new Error("导入Excel文件失败：" + (error instanceof Error ? error.message : "未知错误"));
    }
  }
  
  /**
   * 创建空的Excel导入模板
   * @returns Excel模板文件的二进制数据
   */
  createImportTemplate(): Blob {
    // 创建模板数据
    const templateData = [
      { 
        "层级": 1, 
        "工作项名称": "一级工作项示例", 
        "工作描述": "这是一个一级工作项的示例",
        "工作进展": "未开始",
        "工作标签": "需求对接，产品设计",
        "参与人员": "张三，李四"
      },
      { 
        "层级": 2, 
        "工作项名称": "二级工作项示例", 
        "工作描述": "这是一个二级工作项的示例，是上面一级工作项的子项",
        "工作进展": "进行中",
        "工作标签": "UI 设计",
        "参与人员": "王五"
      },
      { 
        "层级": 3, 
        "工作项名称": "三级工作项示例", 
        "工作描述": "这是一个三级工作项的示例，是上面二级工作项的子项",
        "工作进展": "已完成",
        "工作标签": "前端开发",
        "参与人员": "赵六"
      },
      { 
        "层级": 1, 
        "工作项名称": "另一个一级工作项", 
        "工作描述": "这是另一个一级工作项，与第一个一级工作项平级",
        "工作进展": "已暂停",
        "工作标签": "后端开发，数据开发",
        "参与人员": "张三，赵六"
      },
      { 
        "层级": 2, 
        "工作项名称": "另一个二级工作项", 
        "工作描述": "这是另一个二级工作项，是上面一级工作项的子项",
        "工作进展": "未开始",
        "工作标签": "前后端联调",
        "参与人员": "李四，王五"
      }
    ];
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 创建工作表
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // 设置列宽
    const colWidths = [
      { wch: 5 },  // 层级
      { wch: 40 }, // 工作项名称
      { wch: 50 }, // 工作描述
      { wch: 15 }, // 工作进展
      { wch: 30 }, // 工作标签
      { wch: 30 }, // 参与人员
    ];
    ws['!cols'] = colWidths;
    
    // 添加说明工作表
    const instructionData = [
      { "说明": "使用说明：" },
      { "说明": "1. 层级：表示工作项的层级，从1开始，最大支持5级（对应程序中的0-4级）" },
      { "说明": "2. 工作项名称：必填，表示工作项的名称" },
      { "说明": "3. 工作描述：选填，表示工作项的详细描述" },
      { "说明": "4. 工作进展：选填，可选值为\"未开始\"、\"进行中\"、\"已暂停\"、\"已完成\"，默认为\"未开始\"" },
      { "说明": "5. 工作标签：选填，多个标签用中文顿号(、)或英文逗号(,)分隔" },
      { "说明": "6. 参与人员：选填，多个人员用中文顿号(、)或英文逗号(,)分隔" },
      { "说明": "7. 层级顺序要连贯，例如一个三级工作项的上方必须有一个二级工作项" },
      { "说明": "8. 导入时，系统会自动按照层级关系构建工作项树" }
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructionData, { header: ["说明"] });
    wsInstructions['!cols'] = [{ wch: 90 }];
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "工作分解项");
    XLSX.utils.book_append_sheet(wb, wsInstructions, "使用说明");
    
    // 生成Excel文件
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    return blob;
  }
  
  /**
   * 将工作项树扁平化为表格结构
   * @param workItems 工作分解项数组
   * @returns 扁平化的表格数据
   */
  private flattenWorkItems(workItems: WorkItem[]): any[] {
    const rows: any[] = [];
    
    const processItem = (item: WorkItem, parentPath: string = '') => {
      // 添加当前项
      rows.push({
        "层级": item.level + 1, // 转换为从1开始的层级
        "工作项名称": item.name,
        "工作描述": item.description || '',
        "工作进展": item.status || '未开始',
        "工作标签": item.tags || '',
        "参与人员": item.members || ''
      });
      
      // 处理子项
      if (item.children && item.children.length > 0) {
        item.children.forEach(child => processItem(child, parentPath + item.name + '/'));
      }
    };
    
    workItems.forEach(item => processItem(item));
    
    return rows;
  }
  
  /**
   * 从扁平表格数据构建工作项树
   * @param rows 表格数据
   * @returns 工作分解项数组
   */
  private buildWorkItemsTree(rows: any[]): WorkItem[] {
    // 验证数据格式
    if (!rows.length || !('层级' in rows[0]) || !('工作项名称' in rows[0])) {
      throw new Error('Excel文件格式不正确，必须包含"层级"和"工作项名称"列');
    }
    
    const rootItems: WorkItem[] = [];
    const itemStack: WorkItem[][] = []; // 用于存储每个层级的最后一个项目
    
    rows.forEach((row, index) => {
      const level = Number(row['层级']) - 1; // 转换为从0开始的层级
      
      // 验证层级有效性
      if (isNaN(level) || level < 0 || level > 4) {
        throw new Error(`第${index + 2}行的层级无效，必须是1-5之间的数字`);
      }
      
      // 验证层级连贯性
      if (level > 0 && (itemStack.length < level || !itemStack[level - 1] || itemStack[level - 1].length === 0)) {
        throw new Error(`第${index + 2}行的层级(${level + 1})不连贯，其上方必须有一个层级${level}的工作项`);
      }
      
      // 验证工作进展值
      const validStatus = ['未开始', '进行中', '已暂停', '已完成'];
      const status = row['工作进展'];
      if (status && !validStatus.includes(status)) {
        throw new Error(`第${index + 2}行的工作进展值"${status}"无效，必须是以下值之一：${validStatus.join('、')}`);
      }

      // 标准化标签和人员的分隔符
      const normalizeList = (value: string) => {
        if (!value) return '';
        return value.replace(/,|，|、/g, '，');
      };
      
      // 创建工作项
      const workItem: WorkItem = {
        id: `import-excel-${index}`,
        name: row['工作项名称'] || `未命名工作项-${index + 1}`,
        description: row['工作描述'] || '',
        status: row['工作进展'] || '未开始',
        tags: normalizeList(row['工作标签'] || ''),
        members: normalizeList(row['参与人员'] || ''),
        children: [],
        level,
        position: itemStack[level]?.length || 0,
        isExpanded: true
      };
      
      // 根据层级关系添加到相应位置
      if (level === 0) {
        rootItems.push(workItem);
        // 重置更深层级的堆栈
        itemStack[0] = itemStack[0] || [];
        itemStack[0].push(workItem);
        itemStack.splice(1);
      } else {
        const parentArray = itemStack[level - 1];
        if (parentArray && parentArray.length > 0) {
          const parent = parentArray[parentArray.length - 1];
          parent.children.push(workItem);
          // 更新当前层级堆栈
          itemStack[level] = itemStack[level] || [];
          itemStack[level].push(workItem);
          // 重置更深层级的堆栈
          itemStack.splice(level + 1);
        }
      }
    });
    
    return rootItems;
  }
} 