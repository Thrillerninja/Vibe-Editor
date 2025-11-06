import React, { useMemo, useCallback, useState } from 'react';
import { SimpleNodeComponent } from './SimpleNodeComponent'; // Use the new simple component
import { parseTextToHierarchy } from '../../utils/treeParser'; // Use your existing parser
import { LOG_PREFIX } from '../../utils/constants';

/**
 * A new, minimal TreeInner component.
 * It uses your parseTextToHierarchy and renders the result
 * using a simple, recursive node component.
 */
export function TreeInner({ text, onNodeEmotionChange, applyTreeModification }) {
  const safeText = String(text ?? '');
  
  // State to manage node emotions, since ReactFlow is gone
  const [nodeData, setNodeData] = useState({});

  // 1. Parse text using your existing parser
  const tree = useMemo(() => {
    console.log(`${LOG_PREFIX.PARSER} Minimalist TreeInner parsing text...`);
    const parsedTree = parseTextToHierarchy(safeText);
    
    // This function now correctly transforms the parser's output
    // into the { id, data, children } structure SimpleNodeComponent expects.
    const applyData = (node) => {
      if (!node) return null;
      
      // 1. Get stored emotion data for this node
      const storedData = nodeData[node.id];
      
      // 2. Clean the label
      const labelParts = node.label?.split('|') || [node.label];
      const displayLabel = labelParts[0];
      
      // 3. Recurse for children first
      const processedChildren = node.children.map(applyData);

      // 4. Return the new, clean node structure
      return {
        id: node.id,
        data: {
          label: displayLabel,
          type: node.type,
          startIdx: node.startIdx,
          emotion: storedData?.emotion || 'neutral',
          intensity: storedData?.intensity || 50,
        },
        children: processedChildren,
      };
    };

    return applyData(parsedTree);
  }, [safeText, nodeData, applyTreeModification]);

  // 2. Handle emotion changes from nodes
  const handleEmotionChange = useCallback(
    (nodeId, emotion, intensity) => {
      console.log(`[SimpleTree] Emotion change on ${nodeId}: ${emotion} (${intensity})`);
      
      // Update our local state for node data
      setNodeData(prevData => ({
        ...prevData,
        [nodeId]: {
          emotion,
          intensity,
        }
      }));

      // Notify parent component for AI rewriting (if needed)
      if (onNodeEmotionChange) {
        // Find the node in the tree to get its original label
        const findNode = (node, id) => {
          if (!node) return null;
          if (node.id === id) return node;
          for (const child of node.children) {
            const found = findNode(child, id);
            if (found) return found;
          }
          return null;
        };
        const node = findNode(tree, nodeId);
        if (node) {
          onNodeEmotionChange(nodeId, node.data.label, emotion, intensity);
        }
      }
    },
    [onNodeEmotionChange, tree] // tree dependency is correct here
  );

  if (!tree || !tree.children || tree.children.length === 0) {
    return <div style={{ padding: 20, fontFamily: 'sans-serif', color: '#888', fontSize: '14px' }}>
      Start typing to build your tree...
    </div>;
  }
  
  // 3. Render the tree starting from the root's CHILDREN (e.g., chapters)
  //    This skips the "Document" node and renders your actual content.
  return (
    <div style={{ width: '100%', height: '100%', padding: '20px', fontFamily: 'sans-serif', overflow: 'auto' }}>
      {tree.children.map(rootNode => (
          <SimpleNodeComponent 
            key={rootNode.id}
            node={rootNode} 
            onNodeEmotionChange={handleEmotionChange}
            applyTreeModification={applyTreeModification}
          />
        ))}
    </div>
  );
}