import React, { useState, useEffect, useRef } from 'react';
import TreeNode from './TreeNode';

export default function TreeVisualization({ text }) {
  const [treeData, setTreeData] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState(null);
  const svgRef = useRef(null);

  // Mock tree structure generation from text
  // This will be replaced with an LLM API call later
  const generateMockTreeStructure = (inputText) => {
    const titleMatch = inputText.split('.')[0].trim();
    const title = titleMatch.length > 0 ? titleMatch : 'Document';

    return {
      id: 'root',
      label: title,
      children: [
        {
          id: 'topic-1',
          label: 'Environmental Impact',
          children: [
            {
              id: 'subtopic-1-1',
              label: 'Rising Temperatures',
              children: [
                {
                  id: 'detail-1-1-1',
                  label: 'Crop Yield Effects'
                }
              ]
            },
            {
              id: 'subtopic-1-2',
              label: 'Precipitation Changes',
              children: []
            }
          ]
        },
        {
          id: 'topic-2',
          label: 'Solutions',
          children: [
            {
              id: 'subtopic-2-1',
              label: 'Crop Development',
              children: [
                {
                  id: 'detail-2-1-1',
                  label: 'Drought Resistance'
                }
              ]
            }
          ]
        },
        {
          id: 'topic-3',
          label: 'Cooperation',
          children: [
            {
              id: 'subtopic-3-1',
              label: 'Climate Policy',
              children: []
            }
          ]
        }
      ]
    };
  };

  useEffect(() => {
    if (text && text.trim()) {
      const tree = generateMockTreeStructure(text);
      setTreeData(tree);
    }
  }, [text]);

  // Helper function to find and remove a node from the tree
  const removeNodeFromTree = (tree, nodeId) => {
    if (tree.id === nodeId) return null;

    if (tree.children) {
      const newChildren = [];
      for (const child of tree.children) {
        if (child.id === nodeId) {
          // Skip this child (remove it)
          continue;
        }
        const updatedChild = removeNodeFromTree(child, nodeId);
        if (updatedChild) {
          newChildren.push(updatedChild);
        }
      }
      return { ...tree, children: newChildren };
    }
    return tree;
  };

  // Helper function to add a node to a parent
  const addNodeToParent = (tree, parentId, nodeToAdd) => {
    if (tree.id === parentId) {
      const children = tree.children || [];
      return { ...tree, children: [...children, nodeToAdd] };
    }

    if (tree.children) {
      const newChildren = tree.children.map(child =>
        addNodeToParent(child, parentId, nodeToAdd)
      );
      return { ...tree, children: newChildren };
    }
    return tree;
  };

  // Handle drag start
  const handleDragStart = (node, event) => {
    if (node.id === 'root') return; // Can't drag root

    setDraggingNode(node);
    const svgRect = svgRef.current.getBoundingClientRect();
    setDragPosition({
      x: event.clientX - svgRect.left,
      y: event.clientY - svgRect.top
    });
  };

  // Handle drag move
  const handleDragMove = (event) => {
    if (!draggingNode) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    setDragPosition({
      x: event.clientX - svgRect.left,
      y: event.clientY - svgRect.top
    });
  };

  // Handle drag end
  const handleDragEnd = () => {
    if (draggingNode && dropTarget && dropTarget.id !== draggingNode.id) {
      // Remove the node from its current position
      let newTree = removeNodeFromTree(treeData, draggingNode.id);

      // Add it to the new parent
      if (newTree) {
        newTree = addNodeToParent(newTree, dropTarget.id, draggingNode);
        setTreeData(newTree);
      }
    }

    setDraggingNode(null);
    setDropTarget(null);
  };

  // Handle drop target hover
  const handleDropTargetEnter = (node) => {
    if (draggingNode && node.id !== draggingNode.id) {
      setDropTarget(node);
    }
  };

  const handleDropTargetLeave = () => {
    setDropTarget(null);
  };

  if (!treeData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <p>Enter text to generate tree structure...</p>
      </div>
    );
  }

  const svgWidth = 1400;
  const svgHeight = 700;
  const xOffset = 200;
  const yOffset = 80;
  const startX = 60;
  const startY = svgHeight / 2 - 25;

  return (
    <div className="w-full h-full overflow-auto">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block' }}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <defs>
          <style>{`
            text {
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
            }
          `}</style>
        </defs>
        <TreeNode
          node={treeData}
          x={startX}
          y={startY}
          xOffset={xOffset}
          yOffset={yOffset}
          isRoot={true}
          isHorizontal={true}
          onDragStart={handleDragStart}
          onDropTargetEnter={handleDropTargetEnter}
          onDropTargetLeave={handleDropTargetLeave}
          draggingNodeId={draggingNode?.id}
          dropTargetId={dropTarget?.id}
        />

        {/* Render dragging node following cursor */}
        {draggingNode && (
          <g style={{ pointerEvents: 'none', opacity: 0.7 }}>
            <rect
              x={dragPosition.x - 70}
              y={dragPosition.y - 25}
              width={140}
              height={50}
              rx="6"
              fill="#3b82f6"
              stroke="#1e40af"
              strokeWidth="2"
            />
            <foreignObject
              x={dragPosition.x - 62}
              y={dragPosition.y - 17}
              width={124}
              height={34}
            >
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                color: 'white',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif'
              }}>
                {draggingNode.label}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  );
}
