'use client';

import React, { useCallback, useMemo } from 'react';
import { 
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeTypes,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  ReactFlowProvider,
  Panel,
  BackgroundVariant,
  ConnectionLineType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkItem } from '@/lib/services/work-breakdown';

// 自定义节点类型
const CustomNode = ({ data }: { data: any }) => {
  // 根据工作项状态设置不同的样式
  const getStatusColor = () => {
    switch (data.status) {
      case '未开始':
        return 'bg-gray-100 border-gray-300 shadow-gray-200';
      case '进行中':
        return 'bg-blue-50 border-blue-300 shadow-blue-100';
      case '已暂停':
        return 'bg-yellow-50 border-yellow-300 shadow-yellow-100';
      case '已完成':
        return 'bg-green-50 border-green-300 shadow-green-100';
      default:
        return 'bg-gray-100 border-gray-300 shadow-gray-200';
    }
  };

  // 根据层级设置不同的样式
  const getLevelStyle = () => {
    switch (data.level) {
      case -1: // 项目节点
        return 'text-xl font-bold border-l-4 border-l-purple-500';
      case 0:
        return 'text-lg font-bold border-l-4 border-l-blue-500';
      case 1:
        return 'text-base font-semibold border-l-4 border-l-green-500';
      case 2:
        return 'text-sm font-medium border-l-4 border-l-yellow-500';
      case 3:
        return 'text-sm border-l-4 border-l-purple-500';
      default:
        return 'text-xs border-l-4 border-l-red-500';
    }
  };

  return (
    <div 
      className={`p-3 rounded-lg ${getStatusColor()} ${getLevelStyle()} border shadow-md min-w-[180px] max-w-[250px] transition-all hover:shadow-lg ${data.isProject ? 'bg-purple-50 border-purple-300 shadow-purple-100' : ''}`}
    >
      <div className="font-medium text-gray-800">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-600 mt-1 line-clamp-2">{data.description}</div>
      )}
      
      {/* 显示工作状态 */}
      {data.status && !data.isProject && (
        <div className={`mt-2 text-xs px-2 py-0.5 rounded-full inline-flex items-center ${
          data.status === '未开始' ? 'bg-gray-200 text-gray-800' :
          data.status === '进行中' ? 'bg-blue-200 text-blue-800' :
          data.status === '已暂停' ? 'bg-yellow-200 text-yellow-800' :
          data.status === '已完成' ? 'bg-green-200 text-green-800' :
          'bg-gray-200 text-gray-800'
        }`}>
          {data.status}
        </div>
      )}
      
      {/* 显示标签和参与人员 */}
      <div className="flex flex-wrap gap-1 mt-2">
        {data.tags && data.tags.split('，').map((tag: string, idx: number) => (
          <span key={`tag-${idx}`} className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
            {tag}
          </span>
        ))}
      </div>
      
      {data.members && (
        <div className="flex flex-wrap gap-1 mt-1">
          {data.members.split('，').map((member: string, idx: number) => (
            <span key={`member-${idx}`} className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              {member}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// 节点类型定义
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

interface MindMapViewProps {
  workItems: WorkItem[];
  projectName?: string;
}

const MindMapContent: React.FC<MindMapViewProps> = ({ workItems, projectName = "项目工作分解" }) => {
  // 将工作项转换为React Flow节点和边
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // 添加项目根节点
    const rootNode: Node = {
      id: 'project-root',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { 
        label: projectName,
        description: "项目总览",
        isProject: true,
        level: -1
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    
    nodes.push(rootNode);
    
    // 递归构建节点和边
    const processItems = (items: WorkItem[], parentId: string | null = null, xOffset = 300, yOffset = 0) => {
      // 计算垂直总高度以便居中
      const totalHeight = items.length * 200; // 每个节点预估高度
      const startY = yOffset - (totalHeight / 2) + 100;
      
      items.forEach((item, index) => {
        // 计算节点位置，根据层级和索引确定位置
        const x = xOffset + item.level * 400; // 增加水平间距
        const y = startY + index * 200; // 增加垂直间距
        
        // 创建节点
        const node: Node = {
          id: item.id,
          type: 'custom',
          position: { x, y },
          data: { 
            label: item.name,
            description: item.description,
            status: item.status,
            tags: item.tags,
            members: item.members,
            level: item.level
          },
          // 根据层级设置不同的样式
          style: {
            width: 'auto',
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };
        
        nodes.push(node);
        
        // 连接到父节点
        if (parentId) {
          edges.push({
            id: `e-${parentId}-${item.id}`,
            source: parentId,
            target: item.id,
            type: 'smoothstep',
            animated: item.status === '进行中',
            style: { 
              strokeWidth: 3,
              stroke: item.status === '已完成' ? '#10b981' : 
                      item.status === '进行中' ? '#3b82f6' :
                      item.status === '已暂停' ? '#f59e0b' : '#9ca3af'
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: item.status === '已完成' ? '#10b981' : 
                     item.status === '进行中' ? '#3b82f6' :
                     item.status === '已暂停' ? '#f59e0b' : '#9ca3af'
            }
          });
        }
        // 如果是顶层节点且没有父节点，连接到项目根节点
        else if (item.level === 0) {
          edges.push({
            id: `e-project-root-${item.id}`,
            source: 'project-root',
            target: item.id,
            type: 'smoothstep',
            animated: item.status === '进行中',
            style: { 
              strokeWidth: 3,
              stroke: item.status === '已完成' ? '#10b981' : 
                      item.status === '进行中' ? '#3b82f6' :
                      item.status === '已暂停' ? '#f59e0b' : '#9ca3af'
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: item.status === '已完成' ? '#10b981' : 
                     item.status === '进行中' ? '#3b82f6' :
                     item.status === '已暂停' ? '#f59e0b' : '#9ca3af'
            }
          });
        }
        
        // 递归处理子项
        if (item.children && item.children.length > 0) {
          // 改进子项的布局计算
          const childYOffset = y;
          processItems(item.children, item.id, x + 400, childYOffset);
        }
      });
    };
    
    // 处理顶层工作项
    processItems(workItems);
    
    return { initialNodes: nodes, initialEdges: edges };
  }, [workItems, projectName]);
  
  // 使用React Flow的状态管理
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // 自动布局和居中
  const fitViewOptions = useMemo(() => ({ 
    padding: 0.2,
    includeHiddenNodes: false,
    minZoom: 0.2,
    maxZoom: 1.5
  }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={fitViewOptions}
      minZoom={0.1}
      maxZoom={1.5}
      defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
      proOptions={{ hideAttribution: true }}
      connectionLineType={ConnectionLineType.SmoothStep}
      defaultEdgeOptions={{
        type: 'smoothstep',
        style: { strokeWidth: 3 },
        markerEnd: { 
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20
        }
      }}
    >
      <Background color="#f8f8f8" gap={16} variant={BackgroundVariant.Dots} />
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap 
        zoomable 
        pannable 
        nodeColor={(node) => {
          if (node.data?.isProject) return '#9333ea';
          const status = (node.data?.status as string) || '未开始';
          switch (status) {
            case '未开始': return '#9ca3af';
            case '进行中': return '#3b82f6';
            case '已暂停': return '#f59e0b';
            case '已完成': return '#10b981';
            default: return '#9ca3af';
          }
        }}
        maskColor="rgba(240, 240, 240, 0.6)"
      />
      <Panel position="top-left" className="bg-white p-2 rounded shadow-md">
        <div className="text-sm font-medium mb-1">状态图例:</div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-1"></div>
            <span className="text-xs">项目</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-gray-400 mr-1"></div>
            <span className="text-xs">未开始</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
            <span className="text-xs">进行中</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-yellow-500 mr-1"></div>
            <span className="text-xs">已暂停</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div>
            <span className="text-xs">已完成</span>
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

// 包装组件，提供ReactFlowProvider
const MindMapView: React.FC<MindMapViewProps> = ({ workItems, projectName }) => {
  return (
    <div className="h-[calc(100vh-200px)] w-full bg-white rounded-lg shadow-sm border border-gray-200">
      <ReactFlowProvider>
        <MindMapContent workItems={workItems} projectName={projectName} />
      </ReactFlowProvider>
    </div>
  );
};

export default MindMapView; 