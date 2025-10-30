import React from 'react';

// Helper function to calculate text height
function getTextHeight(text, fontSize, maxWidth) {
  // More accurate character-per-line calculation
  // Average character width is approximately 0.5-0.6 of font size for most fonts
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.floor(maxWidth / avgCharWidth);

  // Split text into words and calculate actual wrapping
  const words = text.split(/\s+/);
  let lines = 1;
  let currentLineLength = 0;

  words.forEach(word => {
    const wordLength = word.length;
    if (currentLineLength + wordLength > charsPerLine && currentLineLength > 0) {
      lines++;
      currentLineLength = wordLength;
    } else {
      currentLineLength += wordLength + 1; // +1 for space
    }
  });

  const lineHeight = fontSize * 1.5; // Slightly more generous line height
  const padding = 24; // More padding for comfort
  return Math.max(50, lines * lineHeight + padding);
}

export default function TreeNode({
  node,
  x,
  y,
  xOffset,
  yOffset,
  isRoot = false,
  isHorizontal = false,
  onDragStart,
  onDropTargetEnter,
  onDropTargetLeave,
  draggingNodeId,
  dropTargetId
}) {
  const hasChildren = node.children && node.children.length > 0;
  const nodeWidth = 140;
  const fontSize = 12;
  const nodeHeight = getTextHeight(node.label, fontSize, nodeWidth - 20);

  const isDragging = draggingNodeId === node.id;
  const isDropTarget = dropTargetId === node.id;

  // Calculate child positions based on layout
  let childElements = [];
  if (hasChildren) {
    if (isHorizontal) {
      // Horizontal layout: children extend to the right, vertically distributed
      const childHeights = node.children.map(child => getTextHeight(child.label, fontSize, nodeWidth - 20));
      const totalChildHeight = childHeights.reduce((sum, h) => sum + h + yOffset, 0) - yOffset;
      const startY = y + nodeHeight / 2 - totalChildHeight / 2;

      let currentY = startY;
      node.children.forEach((child, index) => {
        const childHeight = childHeights[index];
        const childX = x + xOffset;
        const childY = currentY;
        childElements.push({
          node: child,
          x: childX,
          y: childY,
          height: childHeight
        });
        currentY += childHeight + yOffset;
      });
    } else {
      // Vertical layout: children extend downward
      const totalChildWidth = node.children.length * (nodeWidth + xOffset);
      const startX = x - totalChildWidth / 2 + nodeWidth / 2;

      node.children.forEach((child, index) => {
        const childX = startX + index * (nodeWidth + xOffset);
        const childY = y + yOffset;
        childElements.push({
          node: child,
          x: childX,
          y: childY
        });
      });
    }
  }

  return (
    <g key={`${node.id}-group`}>
      {/* Connection lines to children */}
      {childElements.map((child, index) => (
        <line
          key={`${node.id}-line-${index}`}
          x1={x + nodeWidth}
          y1={y + nodeHeight / 2}
          x2={child.x}
          y2={child.y + child.height / 2}
          stroke="#d1d5db"
          strokeWidth="2"
        />
      ))}

      {/* Node box */}
      {!isDragging && (
        <g
          key={`${node.id}-node`}
          onMouseDown={(e) => !isRoot && onDragStart && onDragStart(node, e)}
          onMouseEnter={() => onDropTargetEnter && onDropTargetEnter(node)}
          onMouseLeave={() => onDropTargetLeave && onDropTargetLeave()}
          style={{ cursor: isRoot ? 'default' : 'grab' }}
        >
          <rect
            x={x}
            y={y}
            width={nodeWidth}
            height={nodeHeight}
            rx="6"
            fill={isDropTarget ? '#10b981' : (isRoot ? '#3b82f6' : '#f3f4f6')}
            stroke={isDropTarget ? '#059669' : (isRoot ? '#1e40af' : '#d1d5db')}
            strokeWidth={isDropTarget ? '3' : (isRoot ? '2' : '1')}
          />

          {/* Drop target indicator */}
          {isDropTarget && (
            <rect
              x={x + 4}
              y={y + 4}
              width={nodeWidth - 8}
              height={nodeHeight - 8}
              rx="4"
              fill="none"
              stroke="#d1fae5"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}

          {/* Text with wrapping support */}
          <foreignObject
            x={x + 8}
            y={y + 8}
            width={nodeWidth - 16}
            height={nodeHeight - 16}
          >
            <div style={{
              fontSize: `${fontSize}px`,
              fontWeight: isRoot ? '600' : '500',
              color: isDropTarget ? 'white' : (isRoot ? 'white' : '#374151'),
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
              hyphens: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              textAlign: 'center',
              lineHeight: '1.5',
              padding: '4px',
              boxSizing: 'border-box',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif'
            }}>
              {node.label}
            </div>
          </foreignObject>
        </g>
      )}

      {/* Render child nodes */}
      {childElements.map((child) => (
        <TreeNode
          key={child.node.id}
          node={child.node}
          x={child.x}
          y={child.y}
          xOffset={xOffset}
          yOffset={yOffset}
          isHorizontal={isHorizontal}
          onDragStart={onDragStart}
          onDropTargetEnter={onDropTargetEnter}
          onDropTargetLeave={onDropTargetLeave}
          draggingNodeId={draggingNodeId}
          dropTargetId={dropTargetId}
        />
      ))}
    </g>
  );
}
