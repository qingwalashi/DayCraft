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
  ControlButton,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { WorkItem } from '@/lib/services/work-breakdown';
import { XIcon, Lock, Unlock } from 'lucide-react';

// 自定义节点组件
const CustomNode = ({ data }: { data: any }) => {
  const style = getNodeStyle(data.level);
  
  return (
    <div className="px-4 py-2 rounded-md border-2 shadow-sm w-[180px]" 
         style={{ backgroundColor: style.backgroundColor, borderColor: style.borderColor }}>
      <Handle type="target" position={Position.Left} style={{ background: style.borderColor }} />
      <div className="font-medium text-sm">{data.label}</div>
      {data.status && (
        <div className="mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            data.status === '未开始' ? 'bg-gray-200 text-gray-800' :
            data.status === '进行中' ? 'bg-blue-100 text-blue-800' :
            data.status === '已暂停' ? 'bg-yellow-100 text-yellow-800' :
            data.status === '已完成' ? 'bg-green-100 text-green-800' :
            'bg-gray-200 text-gray-800'
          }`}>
            {data.status}
          </span>
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
const X_GAP = 250; // 增加水平间距，确保连线不转弯
const Y_GAP = 80;  // 减小垂直间距，使节点排列更密集

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
  } | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false); // 添加锁定状态
  
  // 将工作项转换为节点和边
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
    
    // 添加项目节点（根节点）
    const rootId = 'project-root';
    newNodes.push({
      id: rootId,
      type: 'custom',
      data: { 
        label: projectName,
        level: 0,
        originalItem: {
          id: rootId,
          name: projectName,
          description: '项目根节点',
        }
      },
      position: { x: 50, y: 0 },
    });
    
    // 递归处理工作项 - 从左到右布局
    const processItems = (
      items: WorkItem[], 
      parentId: string, 
      level: number, 
      startX: number, 
      startY: number
    ): { nodes: Node[], edges: Edge[], height: number } => {
      if (!items.length) return { nodes: [], edges: [], height: 0 };
      
      const currentX = startX + X_GAP;
      let currentY = startY;
      const allNodes: Node[] = [];
      const allEdges: Edge[] = [];
      
      // 处理每个工作项
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const nodeId = `node-${item.id}`;
        
        // 创建节点
        const node: Node = {
          id: nodeId,
          type: 'custom',
          data: { 
            label: item.name,
            status: item.status,
            level: level,
            originalItem: item
          },
          position: { x: currentX, y: currentY },
        };
        
        allNodes.push(node);
        
        // 创建与父节点的边
        allEdges.push({
          id: `edge-${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: 'straight', // 使用直线连接，避免转弯
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: getNodeStyle(level).borderColor,
          },
          style: { stroke: getNodeStyle(level).borderColor }
        });
        
        // 处理子项
        if (item.children && item.children.length > 0) {
          // 先计算子项的总高度
          let childrenTotalHeight = item.children.length * Y_GAP / 2;
          
          // 处理子项 - 从左到右递归
          const { nodes: childNodes, edges: childEdges, height: childHeight } = processItems(
            item.children,
            nodeId,
            level + 1,
            currentX,
            currentY - childrenTotalHeight / 2 // 使用预估的高度居中
          );
          
          allNodes.push(...childNodes);
          allEdges.push(...childEdges);
          
          // 更新Y坐标，使用实际计算出的子树高度
          currentY += Math.max(childHeight, Y_GAP);
        } else {
          currentY += Y_GAP;
        }
      }
      
      return { 
        nodes: allNodes, 
        edges: allEdges, 
        height: Math.max(currentY - startY, items.length * Y_GAP) 
      };
    };
    
    // 处理所有一级工作项
    const { nodes: itemNodes, edges: itemEdges } = processItems(
      workItems, 
      rootId, 
      1, 
      50,
      -((workItems.length - 1) * Y_GAP) / 4
    );
    
    newNodes.push(...itemNodes);
    newEdges.push(...itemEdges);
    
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
  
  // 处理锁定/解锁功能
  const toggleLock = () => {
    setIsLocked(!isLocked);
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
    <div className="w-full h-[600px] border border-gray-200 rounded-lg relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange} // 锁定时禁用节点变化
        onEdgesChange={isLocked ? undefined : onEdgesChange} // 锁定时禁用边变化
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        attributionPosition="bottom-right"
        onInit={setRfInstance}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'straight', // 默认使用直线连接
        }}
        nodesDraggable={!isLocked} // 锁定时禁用节点拖动
        nodesConnectable={!isLocked} // 锁定时禁用节点连接
        elementsSelectable={!isLocked} // 锁定时禁用元素选择
      >
        <Controls>
          {/* 添加自定义锁定/解锁按钮到Controls中 */}
          <ControlButton onClick={toggleLock} title={isLocked ? "解锁视图" : "锁定视图"}>
            {isLocked ? <Unlock size={18} /> : <Lock size={18} />}
          </ControlButton>
        </Controls>
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
        <div className="absolute top-4 right-4 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10">
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