/**
 * @fileoverview Editor Component - Unified Node-Based Document Editor
 *
 * Strategy:
 * - Level 0: Root ("Document")
 * - Levels 1 to (maxDepth-2): Intermediate grouping nodes
 * - Level (maxDepth-1): Content nodes (sentences)
 *
 * HIERARCHY AUTO-BUILD:
 * - Text edit → content nodes created → effect triggers hierarchy build
 * - Hierarchy built automatically based on maxDepth
 * - Button reserved for future AI regeneration
 *
 * Example with maxDepth = 4:
 * Root (level 0)
 *   └─ Group (level 1)
 *       └─ Group (level 2)
 *           ├─ Content (level 3)
 *           ├─ Content (level 3)
 *           └─ Content (level 3)
 *
 * STATE MANAGEMENT:
 * - nodeMap: Map<string, Node> - all nodes indexed by ID for O(1) lookup
 * - rootId: string - ID of the root node
 * - hierarchyState: 'none' | 'generated' | 'has-dirty-nodes'
 * - maxDepth: 3-6 - hierarchy depth control
 *
 * @typedef {import('../types/node').Node} Node
 * @typedef {Object} DocumentSnapshot
 * @property {Map<string, Node>} nodeMap
 * @property {string} rootId
 * @property {number} maxDepth
 * @property {string} savedAt
 */

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import React from 'react';
import { v4 as uuidv4 } from 'uuid';

// Components
import { HistoryGraph, TreeVisualization } from '../components';
import LogoMenu from '../components/LogoMenu/LogoMenu';
import RichTextEditor from '../components/RichTextEditor/RichTextEditor';

// Utils & Services
import posthog from '../utils/posthog';
import {
  EMOTIONS,
  EMOTION_COLORS,
  EMOTION_LABELS,
} from '../utils/constants';
import {
  createRootNode,
  createContentNode,
  createGroupNode,
  cloneNode,
  getChildren,
  getDescendants,
  isGroupNode,
  isContentNode,
} from '../types/node';
import { useUserIdentification } from '../hooks/useUserIdentification';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'editor_document';

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================

/**
 * Editor - Main component managing document state, editing, and visualization
 *
 * @component
 * @returns {React.ReactElement}
 */
export default function Editor() {
  // =========================================================================
  // CORE STATE: NODE TREE
  // =========================================================================

  /**
   * Primary node storage: Map<string, Node> for O(1) lookups
   *
   * Initialization: Root node only, no content/group nodes yet
   *
   * @type {[Map<string, Node>, Function]}
   */
  const [nodeMap, setNodeMap] = useState(
    new Map([[
      'root',
      createRootNode('root', 'Document', []),
    ]])
  );

  /**
   * Root node ID - conventionally always 'root'
   * @type {[string, Function]}
   */
  const [rootId, setRootId] = useState('root');

  /**
   * Reconstructed plain text from content nodes
   *
   * @type {string}
   */
  const text = useMemo(() => {
    const root = nodeMap.get(rootId);
    if (!root) return '';

    const contentNodes = getContentNodesInOrder(nodeMap, rootId);
    return contentNodes.map(n => n.content).join(' ');
  }, [nodeMap, rootId]);

  // =========================================================================
  // AI HIERARCHY STATE
  // =========================================================================

  /**
   * Maximum hierarchy depth (3-6)
   *
   * - 3: Root → Group → Content (1 intermediate level)
   * - 6: Root → Group → Group → Group → Group → Content (4 intermediate levels)
   *
   * @type {[number, Function]}
   */
  const [maxDepth, setMaxDepth] = useState(3);

  /**
   * Hierarchy state tracking
   * 'none': No hierarchy built yet
   * 'generated': Hierarchy successfully built
   * 'has-dirty-nodes': Content changed, needs hierarchy rebuild
   *
   * @type {['none'|'generated'|'has-dirty-nodes', Function]}
   */
  const [hierarchyState, setHierarchyState] = useState('none');

  // =========================================================================
  // TEXT EDITING STATE (DEBOUNCED)
  // =========================================================================

  /**
   * Pending text changes that haven't been processed yet
   *
   * This allows us to debounce node creation - we don't create nodes
   * on every single keystroke, only when user stops typing
   *
   * @type {[string, Function]}
   */
  const [pendingText, setPendingText] = useState('');

  /**
   * Debounce timer for text processing
   *
   * When user stops typing for 500ms, we process the text and
   * create/update content nodes
   *
   * @type {React.MutableRefObject<NodeJS.Timeout>}
   */
  const textDebounceTimerRef = useRef(null);

  // =========================================================================
  // LAYOUT STATE
  // =========================================================================

  const [leftPct, setLeftPct] = useState(50);
  const horizontalContainerRef = useRef(null);
  const draggingHorizontalRef = useRef(false);

  const [bottomPct, setBottomPct] = useState(12);
  const verticalContainerRef = useRef(null);
  const topPanelRef = useRef(null);
  const draggingVerticalRef = useRef(false);

  // =========================================================================
  // HISTORY & PERSISTENCE
  // =========================================================================

  const historyGraphRef = useRef(null);
  const initialCommitAdded = useRef(false);

  // =========================================================================
  // INITIALIZATION & EFFECTS
  // =========================================================================

  useUserIdentification();

  /**
   * Add initial commit to history
   */
  useEffect(() => {
    if (!initialCommitAdded.current && historyGraphRef.current) {
      historyGraphRef.current.addCommit(
        { nodeMap, rootId },
        'Initial state'
      );
      initialCommitAdded.current = true;
    }
  }, []);

  /**
   * Track page load time
   */
  useEffect(() => {
    if (window.performance?.timing) {
      const perf = window.performance.timing;
      const pageLoadTime = perf.loadEventEnd - perf.navigationStart;
      posthog.capture('page_load_time', { load_time_ms: pageLoadTime });
    }
  }, []);

  /**
   * Update hierarchy state based on nodeMap
   */
  useEffect(() => {
    const root = nodeMap.get(rootId);
    if (!root) {
      setHierarchyState('none');
      return;
    }

    const contentNodes = getContentNodesInOrder(nodeMap, rootId);
    if (contentNodes.length === 0) {
      setHierarchyState('none');
      return;
    }

    const hasDirtyNodesFlag = Array.from(nodeMap.values()).some(
      n => n.metadata.isDirty
    );

    if (hasDirtyNodesFlag) {
      setHierarchyState('has-dirty-nodes');
    } else {
      const hasGroupNodes = Array.from(nodeMap.values()).some(isGroupNode);
      setHierarchyState(hasGroupNodes ? 'generated' : 'none');
    }
  }, [nodeMap, rootId]);

// =========================================================================
// HIERARCHY GENERATION
// =========================================================================

/**
 * Automatically build intermediate group nodes based on maxDepth
 *
 * Called by auto-build effect after content nodes are created
 *
 * This creates the organizational structure:
 * - Root (level 0) is already created
 * - Levels 1 to (maxDepth - 2): Create intermediate groups
 * - Level (maxDepth - 1): Content nodes (already exist)
 *
 * For maxDepth = 3:
 *   Level 0: Root
 *   Level 1: One grouping layer
 *   Level 2: Content nodes (sentences)
 *
 * For maxDepth = 5:
 *   Level 0: Root
 *   Level 1: Top grouping layer
 *   Level 2: Mid grouping layer
 *   Level 3: Sub grouping layer
 *   Level 4: Content nodes (sentences)
 *
 * @returns {void}
 */
const createHierarchyStructure = useCallback(() => {
  console.log(
    `[Editor] Building hierarchy structure with maxDepth=${maxDepth}`
  );

  const updated = new Map(nodeMap);
  const root = updated.get(rootId);
  if (!root) return;

  // Get current content nodes (direct children of root, before hierarchy)
  const contentNodeIds = root.hierarchy.childIds.filter(id => {
    const node = updated.get(id);
    return node && isContentNode(node);
  });

  if (contentNodeIds.length === 0) {
    console.log('[Editor] No content nodes to organize');
    return;
  }

  console.log(`[Editor] Organizing ${contentNodeIds.length} content nodes`);

  // Target level for content nodes is one less than maxDepth
  const contentLevel = maxDepth - 1;

  // Step 1: Update all content nodes to correct level
  contentNodeIds.forEach(contentId => {
    const node = updated.get(contentId);
    if (node && node.hierarchy.level !== contentLevel) {
      const updatedNode = cloneNode(node);
      updatedNode.hierarchy.level = contentLevel;
      updated.set(contentId, updatedNode);
    }
  });

  // Step 2: Handle maxDepth === 1 (content directly under root)
  if (maxDepth === 1) {
    const newRoot = cloneNode(root);
    newRoot.hierarchy.childIds = contentNodeIds;
    updated.set(rootId, newRoot);

    console.log('[Editor] maxDepth=1: Content directly under root');
    setNodeMap(updated);
    setHierarchyState('generated');
    addCommit(updated, 'Hierarchy generated');
    return;
  }

  // Step 3: Create all group nodes (levels 1 through maxDepth - 2)
  const groupIds = [];
  let parentId = rootId;

  for (let level = 1; level <= maxDepth - 2; level++) {
    const nodeId = uuidv4();
    const groupNode = createGroupNode(
      nodeId,
      level === 1 ? 'Content Sections' : `Level ${level}`,
      level,
      parentId,
      [],
      { metadata: { isDirty: true } }
    );

    updated.set(nodeId, groupNode);
    groupIds.push(nodeId);
    console.log(
      `[Editor] Created group node at level ${level}: ${nodeId.substring(0, 8)}`
    );

    parentId = nodeId;
  }

  // Step 4: Chain groups together (each group points to the next)
  for (let i = 0; i < groupIds.length - 1; i++) {
    const currentGroupId = groupIds[i];
    const nextGroupId = groupIds[i + 1];

    const currentGroup = updated.get(currentGroupId);
    if (currentGroup) {
      const chainedGroup = cloneNode(currentGroup);
      chainedGroup.hierarchy.childIds = [nextGroupId];
      updated.set(currentGroupId, chainedGroup);
      console.log(
        `[Editor] Chained level ${i + 1} group to level ${i + 2} group`
      );
    }
  }

  // Step 5: Connect final group to content nodes
  const lastGroupId = groupIds[groupIds.length - 1];
  if (lastGroupId) {
    const lastGroup = updated.get(lastGroupId);
    if (lastGroup) {
      const connectedGroup = cloneNode(lastGroup);
      connectedGroup.hierarchy.childIds = contentNodeIds;
      updated.set(lastGroupId, connectedGroup);
      console.log(
        `[Editor] Connected level ${maxDepth - 2} group to ${contentNodeIds.length} content nodes`
      );
    }
  }

  // Step 6: Update all content nodes to reference the final group as parent
  contentNodeIds.forEach(contentId => {
    const contentNode = updated.get(contentId);
    if (contentNode) {
      const updatedContent = cloneNode(contentNode);
      updatedContent.hierarchy.parentId = lastGroupId;
      updatedContent.hierarchy.level = contentLevel;
      updated.set(contentId, updatedContent);
    }
  });

  // Step 7: Update root to point to first group
  const newRoot = cloneNode(root);
  if (groupIds.length > 0) {
    newRoot.hierarchy.childIds = [groupIds[0]];
    updated.set(rootId, newRoot);
    console.log(
      `[Editor] Updated root to point to level 1 group: ${groupIds[0].substring(0, 8)}`
    );
  }

  console.log('[Editor] ✓ Hierarchy structure complete');
  console.log(
    `[Editor] Structure: Root → ${groupIds.map((_, i) => `L${i + 1}`).join(' → ')} → Content (${contentNodeIds.length} nodes)`
  );

  setNodeMap(updated);
  setHierarchyState('generated');
  addCommit(updated, 'Hierarchy generated');
}, [nodeMap, rootId, maxDepth]);

/**
 * Auto-build or reorganize hierarchy when content nodes change
 *
 * Ensures all content nodes are properly connected through the
 * intermediate group structure, even when adding new nodes
 */
useEffect(() => {
  const root = nodeMap.get(rootId);
  if (!root) return;

  // Get current content nodes
  const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);
  if (contentNodes.length === 0) return;

  // Check if hierarchy structure exists
  const hasIntermediateGroups = Array.from(nodeMap.values()).some(
    n => isGroupNode(n) && n.hierarchy.level >= 1 && n.hierarchy.level < maxDepth - 1
  );

  // Check if all content nodes are properly organized
  // They should NOT be direct children of root if groups exist
  const contentNodesUnderRoot = contentNodes.filter(
    n => n.hierarchy.parentId === rootId
  );

  // Build hierarchy if:
  // 1. No groups exist yet, OR
  // 2. Some content nodes are still direct children of root (not reorganized)
  if (!hasIntermediateGroups || contentNodesUnderRoot.length > 0) {
    console.log(
      `[Editor] Rebuilding hierarchy: ${contentNodesUnderRoot.length} content nodes under root`
    );
    createHierarchyStructure();
  }
}, [nodeMap, rootId, maxDepth, createHierarchyStructure]);

// =========================================================================
// TEXT EDITING: DEBOUNCED NODE CREATION
// =========================================================================

  /**
   * Process text and update content nodes
   *
   * New nodes are created with the correct parent (deepest group if hierarchy exists)
   * to avoid needing reorganization
   *
   * @param {string} newText - Text to process
   * @returns {void}
   */
  const processTextToNodes = useCallback(
    (newText) => {
      console.log('[Editor] Processing text:', newText.substring(0, 50));

      const sentences = parseTextToSentences(newText);

      setNodeMap(prevNodeMap => {
        const updated = new Map(prevNodeMap);
        const root = updated.get(rootId);
        if (!root) {
          console.error('[Editor] Root not found');
          return prevNodeMap;
        }

        // Find the deepest group node (where content should be parented)
        // If no groups exist, use root
        let contentParentId = rootId;
        let deepestLevel = 0;

        Array.from(updated.values()).forEach(node => {
          if (isGroupNode(node) && node.hierarchy.level > deepestLevel) {
            deepestLevel = node.hierarchy.level;
            contentParentId = node.id;
          }
        });

        console.log(
          `[Editor] Content parent: ${contentParentId === rootId ? 'root' : contentParentId.substring(0, 8)} (level ${deepestLevel})`
        );

        // Find ALL content nodes in the tree (not just under root)
        const allContentIds = Array.from(updated.keys()).filter(id => {
          const node = updated.get(id);
          return node && isContentNode(node);
        });

        const groupNodeIds = Array.from(updated.keys()).filter(id => {
          const node = updated.get(id);
          return node && isGroupNode(node);
        });

        // Handle empty text - delete all content nodes
        if (sentences.length === 0) {
          console.log(
            `[Editor] Empty text - clearing ${allContentIds.length} content nodes`
          );

          // Delete ALL content nodes
          allContentIds.forEach(id => {
            updated.delete(id);
            console.log(`[Editor] Deleted content node ${id.substring(0, 8)}`);
          });

          // Clear all group nodes' childIds
          groupNodeIds.forEach(groupId => {
            const group = updated.get(groupId);
            if (group) {
              const updatedGroup = cloneNode(group);
              updatedGroup.hierarchy.childIds = [];
              updated.set(groupId, updatedGroup);
            }
          });

          // Update root
          const newRoot = cloneNode(root);
          newRoot.hierarchy.childIds = groupNodeIds;
          updated.set(rootId, newRoot);

          console.log('[Editor] ✓ All content nodes cleared');
          return updated;
        }

        console.log(`[Editor] Parsed ${sentences.length} sentences`);

        // Update or create content nodes with correct parent
        const newContentIds = sentences.map((sentence, index) => {
          let nodeId;

          if (index < allContentIds.length) {
            // Reuse existing node
            nodeId = allContentIds[index];
            const existingNode = updated.get(nodeId);

            if (existingNode && existingNode.content !== sentence) {
              const updatedNode = cloneNode(existingNode);
              updatedNode.content = sentence;
              updatedNode.metadata.isDirty = true;
              updatedNode.metadata.modifiedAt = new Date().toISOString();
              updated.set(nodeId, updatedNode);
              console.log(`[Editor] Updated content node ${nodeId.substring(0, 8)}`);
            }
          } else {
            // Create new node with correct parent from the start
            nodeId = uuidv4();
            const newNode = createContentNode(
              nodeId,
              'sentence',
              sentence,
              contentParentId,
              { metadata: { isDirty: true } }
            );
            updated.set(nodeId, newNode);
            console.log(
              `[Editor] Created content node ${nodeId.substring(0, 8)} under ${contentParentId === rootId ? 'root' : 'group'}`
            );
          }

          return nodeId;
        });

        // Delete excess content nodes
        for (let i = newContentIds.length; i < allContentIds.length; i++) {
          const idToDelete = allContentIds[i];
          updated.delete(idToDelete);
          console.log(`[Editor] Deleted excess content node ${idToDelete.substring(0, 8)}`);
        }

        // Update root to only have groups
        const newRoot = cloneNode(root);
        newRoot.hierarchy.childIds = groupNodeIds;
        updated.set(rootId, newRoot);

        // If hierarchy exists, update deepest group to have all content nodes
        if (contentParentId !== rootId) {
          const contentParent = updated.get(contentParentId);
          if (contentParent) {
            const updatedParent = cloneNode(contentParent);
            updatedParent.hierarchy.childIds = newContentIds;
            updated.set(contentParentId, updatedParent);
            console.log(
              `[Editor] Updated parent group with ${newContentIds.length} content nodes`
            );
          }
        } else {
          // No hierarchy yet, add content to root
          newRoot.hierarchy.childIds = [...groupNodeIds, ...newContentIds];
          updated.set(rootId, newRoot);
        }

        console.log(
          `[Editor] Updated: ${groupNodeIds.length} groups + ${newContentIds.length} content`
        );

        return updated;
      });
    },
    [rootId]
  );
  /**
   * Handle text input - DEBOUNCED
   *
   * Does NOT immediately create nodes. Instead:
   * 1. Store pending text
   * 2. Start/restart debounce timer
   * 3. When timer fires (500ms of no input), process sentences
   *
   * This prevents creating nodes on every keystroke
   *
   * @param {string} newText - Updated text content
   * @param {number} cursorPosition - Cursor position (unused currently)
   * @returns {void}
   */
  const handleTextChange = useCallback(
    (newText, cursorPosition) => {
      console.log('[Editor] Text changed, length:', newText.length);

      // Store pending text
      setPendingText(newText);

      // Clear previous timer
      if (textDebounceTimerRef.current) {
        clearTimeout(textDebounceTimerRef.current);
      }

      // Analytics
      const textLengthChange = newText.length - text.length;
      posthog.capture('text_edited', {
        text_length_change: textLengthChange,
        total_text_length: newText.length,
        operation: textLengthChange > 0 ? 'insert' : 'delete',
      });

      // Set debounce timer
      console.log('[Editor] Starting debounce timer (500ms)');
      textDebounceTimerRef.current = setTimeout(() => {
        console.log('[Editor] Debounce timer fired - processing text');
        processTextToNodes(newText);
      }, 500);
    },
    [text, processTextToNodes]
  );

  /**
   * Handle editor blur - process pending text immediately
   */
  const handleTextBlur = useCallback(() => {
    if (textDebounceTimerRef.current) {
      clearTimeout(textDebounceTimerRef.current);
      console.log('[Editor] Blur - processing pending text immediately');
      processTextToNodes(pendingText);
    }
  }, [pendingText, processTextToNodes]);

  // =========================================================================
  // HIERARCHY GENERATION
  // =========================================================================

  /**
   * Handle tree modifications (drag/drop in visualization)
   */
  const handleTreeUpdate = useCallback(updatedNodes => {
    console.log('[Editor] Tree updated, node count:', updatedNodes.size);

    posthog.capture('tree_updated', {
      node_count: updatedNodes.size,
    });

    setNodeMap(updatedNodes);
    addCommit(updatedNodes, 'Tree updated');
  }, []);

  // =========================================================================
  // HISTORY & COMMITS
  // =========================================================================

  /**
   * Add commit to history
   */
  const addCommit = useCallback(
    (nodes, title, options = {}) => {
      historyGraphRef.current?.addCommit(
        { nodeMap: nodes, rootId },
        title,
        options
      );
    },
    [rootId]
  );

  /**
   * Handle revert from history
   */
  const handleRevertComplete = useCallback(snapshot => {
    setNodeMap(snapshot.nodeMap);
    setRootId(snapshot.rootId);

    console.log('[Editor] Reverted to commit');
  }, []);

  /**
   * Handle commit complete
   */
  const handleCommitComplete = useCallback(committed => {
    setNodeMap(committed);
  }, []);

  // =========================================================================
  // LAYOUT MANAGEMENT
  // =========================================================================

  const onHorizontalHandleMouseDown = useCallback(() => {
    draggingHorizontalRef.current = true;
  }, []);

  const onVerticalHandleMouseDown = useCallback(() => {
    draggingVerticalRef.current = true;
  }, []);

  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (draggingHorizontalRef.current && horizontalContainerRef.current) {
        const rect = horizontalContainerRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(clientX, rect.left), rect.right);
        const pct = ((x - rect.left) / rect.width) * 100;
        const clamped = Math.min(80, Math.max(20, pct));
        setLeftPct(clamped);
      }

      if (
        draggingVerticalRef.current &&
        verticalContainerRef.current &&
        topPanelRef.current
      ) {
        const rect = verticalContainerRef.current.parentElement?.getBoundingClientRect();
        if (!rect) return;

        const y = Math.min(Math.max(clientY, rect.top), rect.bottom);
        const pct = ((rect.bottom - y) / rect.height) * 100;
        const clamped = Math.min(80, Math.max(5, pct));

        verticalContainerRef.current.style.flexBasis = `${clamped}%`;
        topPanelRef.current.style.flexBasis = `${100 - clamped}%`;
      }
    };

    const handleMouseMove = e => onMove(e.clientX, e.clientY);
    const handleTouchMove = e => {
      if (e.touches?.[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const endDrag = () => {
      if (draggingVerticalRef.current && verticalContainerRef.current) {
        const newBottomPct = parseFloat(
          verticalContainerRef.current.style.flexBasis
        );
        if (!isNaN(newBottomPct)) setBottomPct(newBottomPct);
      }

      draggingHorizontalRef.current = false;
      draggingVerticalRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    window.addEventListener('touchend', endDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  const floatingButtonStyle = {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    border: 'none',
    cursor: 'pointer',
    zIndex: 50,
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <LogoMenu maxDepth={maxDepth} setMaxDepth={setMaxDepth} />

      <div
        ref={horizontalContainerRef}
        className="flex flex-col h-screen select-none"
        style={{
          userSelect:
            draggingHorizontalRef.current || draggingVerticalRef.current
              ? 'none'
              : undefined,
        }}
      >
        {/* Top Panel */}
        <div
          ref={topPanelRef}
          className="flex-1 flex"
          style={{ flexBasis: `${100 - bottomPct}%`, minHeight: 0 }}
        >
          {/* Left Pane: Editor */}
          <div
            className="flex flex-col relative"
            style={{ flexBasis: `${leftPct}%`, minWidth: 0 }}
          >
            <RichTextEditor
              value={pendingText}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              placeholder="Enter your text here..."
              hierarchyState={hierarchyState}
              sentences={Array.from(nodeMap.values()).filter(isContentNode)}
            />
          </div>

          {/* Horizontal Divider */}
          <VerticalDividerHandle onMouseDown={onHorizontalHandleMouseDown} />

          {/* Right Pane: Tree */}
          <div
            className="flex flex-col"
            style={{ flexBasis: `${100 - leftPct}%`, minWidth: 0 }}
          >
            <div id="graph-pane" className="flex-1 relative overflow-hidden">
              {/* AI Hierarchy Regeneration Button */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  gap: '8px',
                  zIndex: 50,
                }}
              >
                <button
                  onClick={() => {
                    console.log('[Editor] Triggering AI hierarchy regeneration');
                    posthog.capture('hierarchy_ai_regenerate_clicked');
                    // TODO: Implement AI hierarchy regeneration
                    alert('AI hierarchy regeneration coming soon');
                  }}
                  disabled={hierarchyState !== 'generated'}
                  title="Regenerate hierarchy with AI (coming soon)"
                  style={{
                    ...floatingButtonStyle,
                    backgroundColor:
                      hierarchyState !== 'generated' ? '#9ca3af' : '#10b981',
                    color: 'white',
                  }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>

              {/* Emotion Legend */}
              <div
                aria-label="Emotion legend"
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                  padding: '10px 12px',
                  zIndex: 50,
                  fontSize: '13px',
                  color: '#111827',
                  maxWidth: '260px',
                  backdropFilter: 'saturate(180%) blur(4px)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  DES Emotions Legend
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: 10,
                    rowGap: 8,
                  }}
                >
                  {[
                    EMOTIONS.INTEREST,
                    EMOTIONS.JOY,
                    EMOTIONS.SURPRISE,
                    EMOTIONS.SADNESS,
                    EMOTIONS.ANGER,
                    EMOTIONS.DISGUST,
                    EMOTIONS.CONTEMPT,
                    EMOTIONS.FEAR,
                    EMOTIONS.SHAME,
                    EMOTIONS.GUILT,
                  ].map(key => {
                    const swatch = EMOTION_COLORS[key]?.medium || '#e5e7eb';
                    const label = EMOTION_LABELS[key] || key;

                    return (
                      <React.Fragment key={key}>
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: swatch,
                            border: '1px solid rgba(0,0,0,0.1)',
                            marginTop: 2,
                          }}
                        />
                        <span style={{ whiteSpace: 'nowrap' }}>
                          {label}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <TreeVisualization
                rootId={rootId}
                nodeMap={nodeMap}
                onTreeUpdate={handleTreeUpdate}
              />
            </div>
          </div>
        </div>

        {/* Vertical Divider */}
        <HorizontalDividerHandle onMouseDown={onVerticalHandleMouseDown} />

        {/* Bottom Panel: History */}
        <div
          ref={verticalContainerRef}
          className="bg-white bottom-pane"
          style={{ flexBasis: `${bottomPct}%`, minHeight: 0 }}
        >
          <div className="pt-3 pr-3 pl-3 h-full">
            <HistoryGraph
              rootId={rootId}
              nodeMap={nodeMap}
              onRevertComplete={handleRevertComplete}
              onCommitComplete={handleCommitComplete}
              ref={historyGraphRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Vertical divider handle for horizontal panel resizing
 * @param {{onMouseDown: Function}} props
 * @returns {React.ReactElement}
 */
function VerticalDividerHandle({ onMouseDown }) {
  return (
    <button
      aria-label="Resize panels left and right"
      title="Drag to resize"
      onMouseDown={onMouseDown}
      className="relative group"
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: 'white',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        className="block h-full bg-gray-300 group-hover:bg-gray-400 transition-colors"
        style={{ width: '2px', margin: '0 auto' }}
      />
    </button>
  );
}

/**
 * Horizontal divider handle for vertical panel resizing
 * @param {{onMouseDown: Function}} props
 * @returns {React.ReactElement}
 */
function HorizontalDividerHandle({ onMouseDown }) {
  return (
    <button
      aria-label="Resize panels top and bottom"
      title="Drag to resize"
      onMouseDown={onMouseDown}
      className="relative group"
      style={{
        height: '6px',
        cursor: 'row-resize',
        background: 'white',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        className="block w-full bg-gray-300 group-hover:bg-gray-400 transition-colors"
        style={{ height: '2px', margin: 'auto 0' }}
      />
    </button>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse text into sentences
 *
 * Splits on newlines, then on sentence punctuation
 * Returns array of sentence strings
 *
 * @param {string} text - Raw text input
 * @returns {string[]} Array of sentence strings
 *
 * @example
 * parseTextToSentences("Hello. World! How are you?")
 * // → ["Hello.", "World!", "How are you?"]
 */
function parseTextToSentences(text) {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const sentences = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/(?<=[.!?])\s+/);
    sentences.push(
      ...parts.filter(part => part.trim()).map(part => part.trim())
    );
  });

  return sentences.filter(s => s.length > 0);
}

/**
 * Get all content nodes in order
 *
 * Traverses tree from root, collecting content nodes in breadth-first order
 *
 * @param {Map<string, Node>} nodeMap - All nodes
 * @param {string} rootId - Root node ID
 * @returns {Node[]} Array of content nodes in order
 */
function getContentNodesInOrder(nodeMap, rootId) {
  const root = nodeMap.get(rootId);
  if (!root) return [];

  const nodes = [];
  const queue = [...root.hierarchy.childIds];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    if (isContentNode(node)) {
      nodes.push(node);
    } else if (isGroupNode(node)) {
      queue.unshift(...node.hierarchy.childIds);
    }
  }

  return nodes;
}