import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  NodeTypes,
  Handle,
  NodeMouseHandler,
  ReactFlowInstance,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { WorkItem } from '@/lib/services/work-breakdown';
import { XIcon } from 'lucide-react';

// 自定义节点组件
const CustomNode = ({ data }: { data: any }) => {
  const style = getNodeStyle(data.level);
  
  // 截取描述和备注的前部分字符，避免节点过大
  const truncateText = (text: string, maxLength: number = 30) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };
  
  return (
    <div className="px-4 py-2 rounded-md border-2 shadow-sm w-[220px]" 
         style={{ backgroundColor: style.backgroundColor, borderColor: style.borderColor }}>
      <Handle type="target" position={Position.Left} style={{ background: style.borderColor }} />
      <div className="font-medium text-sm">{data.label}</div>

      {/* 显示里程碑标识和状态 */}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {data.originalItem?.is_milestone && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-medium">
            🏁 里程碑
          </span>
        )}
        {data.status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            data.status === '未开始' ? 'bg-gray-200 text-gray-800' :
            data.status === '进行中' ? 'bg-blue-100 text-blue-800' :
            data.status === '已暂停' ? 'bg-yellow-100 text-yellow-800' :
            data.status === '已完成' ? 'bg-green-100 text-green-800' :
            'bg-gray-200 text-gray-800'
          }`}>
            {data.status}
          </span>
        )}
      </div>
      
      {/* 工作描述预览 */}
      {data.description && (
        <div className="mt-1 text-xs text-gray-600 border-t border-gray-100 pt-1">
          {truncateText(data.description)}
        </div>
      )}
      
      {/* 工作进展备注预览 */}
      {data.progress_notes && (
        <div className="mt-1 text-xs text-gray-500 italic border-t border-gray-100 pt-1 whitespace-pre-wrap">
          {truncateText(data.progress_notes)}
        </div>
      )}
      
      <Handle type="source" position={Position.Right} style={{ background: style.borderColor }} />
    </div>
  );
};

// 节点类型定义
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// 节点样式
const getNodeStyle = (level: number) => {
  const styles = [
    { backgroundColor: '#e3f2fd', borderColor: '#2196f3' }, // 项目节点
    { backgroundColor: '#e8f5e9', borderColor: '#4caf50' }, // 一级工作项
    { backgroundColor: '#fff8e1', borderColor: '#ffc107' }, // 二级工作项
    { backgroundColor: '#f3e5f5', borderColor: '#9c27b0' }, // 三级工作项
    { backgroundColor: '#ffebee', borderColor: '#f44336' }, // 四级工作项
    { backgroundColor: '#e0f7fa', borderColor: '#00bcd4' }, // 五级工作项
  ];
  
  return styles[Math.min(level, styles.length - 1)];
};

interface WorkMapProps {
  workItems: WorkItem[];
  projectName: string;
}

// 节点间的水平和垂直间距
const X_GAP = 300; // 增加水平间距，从250增加到300
const Y_GAP = 80; // 减少垂直间距，从100减少到80，使布局更紧凑
const NODE_HEIGHT = 60; // 估计的节点高度，用于计算间距

const WorkMap = ({ workItems, projectName }: WorkMapProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    name: string;
    description?: string;
    status?: string;
    tags?: string;
    members?: string;
    progress_notes?: string; // 新增工作进展备注
  } | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  // 将工作项转换为节点和边 - 改进的两阶段布局
  const convertWorkItemsToGraph = useCallback((items: WorkItem[], projectName: string) => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // 创建工作项ID到完整工作项的映射
    const itemMap = new Map<string, WorkItem>();
    const mapItems = (items: WorkItem[]) => {
      items.forEach(item => {
        itemMap.set(item.id, item);
        if (item.children && item.children.length > 0) {
          mapItems(item.children);
        }
      });
    };
    mapItems(items);
    
    // 第一阶段：创建所有节点并计算每个节点的子树高度和所需空间
    const createNodes = (
      items: WorkItem[],
      level: number,
      startX: number
    ): { nodes: Map<string, Node>, heights: Map<string, number>, spaces: Map<string, number> } => {
      const nodeMap = new Map<string, Node>();
      const heightMap = new Map<string, number>();
      const spaceMap = new Map<string, number>(); // 存储每个节点所需的垂直空间
      
      items.forEach(item => {
        const nodeId = `node-${item.id}`;
        
        // 创建节点（暂不设置Y坐标）
        const node: Node = {
          id: nodeId,
          type: 'custom',
          data: { 
            label: item.name,
            description: item.description,
            progress_notes: item.progress_notes,
            status: item.status,
            level: level,
            originalItem: item
          },
          position: { x: startX, y: 0 }, // Y坐标稍后设置
        };
        
        nodeMap.set(nodeId, node);
        
        // 递归处理子节点
        if (item.children && item.children.length > 0) {
          const { nodes: childNodes, heights: childHeights, spaces: childSpaces } = createNodes(
            item.children,
            level + 1,
            startX + X_GAP
          );
          
          // 合并节点映射
          childNodes.forEach((node, id) => {
            nodeMap.set(id, node);
          });
          
          // 计算子树总高度和所需空间
          let totalSpace = 0;
          
          item.children.forEach(child => {
            const childId = `node-${child.id}`;
            const childSpace = childSpaces.get(childId) || NODE_HEIGHT + Y_GAP;
            totalSpace += childSpace;
          });
          
          // 存储此节点子树的高度和所需空间
          heightMap.set(nodeId, totalSpace - Y_GAP); // 减去最后一个子节点后的额外间距
          spaceMap.set(nodeId, Math.max(totalSpace, NODE_HEIGHT + Y_GAP));
        } else {
          // 叶子节点高度和所需空间
          heightMap.set(nodeId, NODE_HEIGHT);
          spaceMap.set(nodeId, NODE_HEIGHT + Y_GAP);
        }
      });
      
      return { nodes: nodeMap, heights: heightMap, spaces: spaceMap };
    };
    
    // 第二阶段：设置节点Y坐标并创建边
    const positionNodesAndCreateEdges = (
      items: WorkItem[],
      parentId: string | null,
      level: number,
      startX: number,
      startY: number,
      nodeMap: Map<string, Node>,
      heightMap: Map<string, number>,
      spaceMap: Map<string, number>
    ): number => {
      let currentY = startY;
      
      items.forEach((item, index) => {
        const nodeId = `node-${item.id}`;
        const node = nodeMap.get(nodeId);
        
        if (!node) return;
        
        // 如果有子节点，先处理子节点
        if (item.children && item.children.length > 0) {
          // 记录当前Y位置
          const beforeY = currentY;
          
          // 处理所有子节点，并获取处理后的Y位置
          const afterY = positionNodesAndCreateEdges(
            item.children,
            nodeId,
            level + 1,
            startX + X_GAP,
            currentY,
            nodeMap,
            heightMap,
            spaceMap
          );
          
          // 将当前节点放在子节点的中间位置
          const middleY = (beforeY + afterY - NODE_HEIGHT) / 2;
          node.position.y = middleY;
          
          // 更新当前Y为子节点处理后的Y，并添加额外间距以避免与下一个节点的子节点重叠
          currentY = afterY + (index < items.length - 1 ? Y_GAP / 2 : 0);
        } else {
          // 叶子节点直接放在当前Y位置
          node.position.y = currentY;
          
          // 更新Y位置，为下一个节点留出空间
          currentY += NODE_HEIGHT + Y_GAP;
        }
        
        // 如果有父节点，创建连接边
        if (parentId) {
          newEdges.push({
            id: `edge-${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            type: 'bezier', // 改用贝塞尔曲线，减少弯折
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: getNodeStyle(level).borderColor,
            },
            style: { stroke: getNodeStyle(level).borderColor },
            // 添加贝塞尔曲线控制参数
            sourceHandle: 'right',
            targetHandle: 'left',
            animated: false,
            // 进一步减少曲率，使线条更直
            data: { curvature: 0.1 }
          });
        }
      });
      
      return currentY;
    };
    
    // 创建项目根节点
    const rootId = 'project-root';
    const rootNode: Node = {
      id: rootId,
      type: 'custom',
      data: { 
        label: projectName,
        description: '项目根节点',
        progress_notes: '',
        level: 0,
        originalItem: {
          id: rootId,
          name: projectName,
          description: '项目根节点',
          progress_notes: '',
        }
      },
      position: { x: 30, y: 0 }, // 将根节点向左移动一些，从50改为30
    };
    
    // 第一阶段：创建所有节点
    const { nodes: nodeMap, heights: heightMap, spaces: spaceMap } = createNodes(workItems, 1, 30 + X_GAP);
    
    // 第二阶段：设置Y坐标并创建边
    if (workItems.length > 0) {
      const totalHeight = positionNodesAndCreateEdges(
        workItems,
        rootId,
        1,
        30 + X_GAP,
        Y_GAP, // 从Y_GAP开始，给顶部留出空间
        nodeMap,
        heightMap,
        spaceMap
      );
      
      // 将根节点放在所有子节点的中间
      rootNode.position.y = totalHeight / 2;
    }
    
    // 添加根节点
    newNodes.push(rootNode);
    
    // 添加所有其他节点
    nodeMap.forEach(node => {
      newNodes.push(node);
    });
    
    return { nodes: newNodes, edges: newEdges };
  }, []);
  
  // 当工作项或项目名称变化时更新图表
  useEffect(() => {
    if (workItems.length > 0 && projectName) {
      const { nodes: newNodes, edges: newEdges } = convertWorkItemsToGraph(workItems, projectName);
      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [workItems, projectName, convertWorkItemsToGraph]);
  
  // 处理节点点击
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    // 获取原始工作项数据
    const originalItem = node.data.originalItem;
    if (originalItem) {
      // 高亮选中的节点和相关边
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            return {
              ...n,
              style: { ...n.style, boxShadow: '0 0 0 2px #ff0072' },
            };
          } else if (selectedNode && n.id === selectedNode.id) {
            // 移除之前选中节点的高亮
            return {
              ...n,
              style: { ...n.style, boxShadow: 'none' },
            };
          }
          return n;
        })
      );
      
      setSelectedNode({
        id: node.id,
        name: originalItem.name,
        description: originalItem.description,
        progress_notes: originalItem.progress_notes,
        status: originalItem.status,
        tags: originalItem.tags,
        members: originalItem.members
      });
    }
  }, [selectedNode]);
  
  // 关闭详情面板
  const closeDetails = () => {
    // 移除选中节点的高亮
    if (selectedNode) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === selectedNode.id) {
            return {
              ...n,
              style: { ...n.style, boxShadow: 'none' },
            };
          }
          return n;
        })
      );
    }
    setSelectedNode(null);
  };
  
  // 渲染标签
  const renderTags = (tags?: string) => {
    if (!tags) return null;
    
    const tagList = tags.split('，').filter(Boolean);
    if (tagList.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {tagList.map((tag, idx) => (
          <span key={`tag-${idx}`} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            {tag}
          </span>
        ))}
      </div>
    );
  };
  
  // 渲染人员
  const renderMembers = (members?: string) => {
    if (!members) return null;
    
    const memberList = members.split('，').filter(Boolean);
    if (memberList.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {memberList.map((member, idx) => (
          <span key={`member-${idx}`} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            {member}
          </span>
        ))}
      </div>
    );
  };
  
  return (
    <div 
      className="w-full border border-gray-200 rounded-lg relative h-[500px] sm:h-[600px]" 
      ref={reactFlowWrapper}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        attributionPosition="bottom-right"
        onInit={setRfInstance}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'bezier', // 默认边类型改为贝塞尔曲线
          animated: false,
          data: { curvature: 0.1 } // 进一步减少曲率
        }}
        proOptions={{ hideAttribution: true }} // 隐藏ReactFlow字样
      >
        <Controls />
        <MiniMap 
          nodeStrokeWidth={3}
          zoomable
          pannable
          nodeColor={(node) => {
            const level = node.data?.level || 0;
            return getNodeStyle(level).backgroundColor;
          }}
        />
        <Background color="#f8f8f8" gap={16} />
      </ReactFlow>
      
      {/* 工作项详情面板 */}
      {selectedNode && (
        <div className="absolute w-72 max-w-[calc(100%-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10 overflow-y-auto details-panel"
             style={{ 
               top: '1rem', 
               right: '1rem', 
               maxHeight: 'calc(100% - 2rem)',
               height: 'auto'
             }}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-medium text-lg">{selectedNode.name}</h3>
            <button 
              onClick={closeDetails}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <XIcon className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          
          {selectedNode.status && (
            <div className="mb-2">
              <span className={`text-xs px-2 py-1 rounded-full ${
                selectedNode.status === '未开始' ? 'bg-gray-200 text-gray-800' :
                selectedNode.status === '进行中' ? 'bg-blue-100 text-blue-800' :
                selectedNode.status === '已暂停' ? 'bg-yellow-100 text-yellow-800' :
                selectedNode.status === '已完成' ? 'bg-green-100 text-green-800' :
                'bg-gray-200 text-gray-800'
              }`}>
                {selectedNode.status}
              </span>
            </div>
          )}
          
          {selectedNode.description && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-1">工作描述</h4>
              <p className="text-sm text-gray-600">{selectedNode.description}</p>
            </div>
          )}
          
          {selectedNode.progress_notes && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-1">工作进展备注</h4>
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 whitespace-pre-wrap">
                {selectedNode.progress_notes}
              </p>
            </div>
          )}
          
          {selectedNode.tags && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-1">工作标签</h4>
              {renderTags(selectedNode.tags)}
            </div>
          )}
          
          {selectedNode.members && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-1">参与人员</h4>
              {renderMembers(selectedNode.members)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkMap;