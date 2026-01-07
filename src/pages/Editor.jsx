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
import { HistoryGraph, TreeVisualization, EmotionsLegend } from '../components';
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
import { HorizontalDividerHandle, VerticalDividerHandle } from '../components/Deviders';

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

  const clearAllDirtyFlags = useCallback((map) => {
    const updated = new Map(map);

    for (const [id, node] of updated.entries()) {
      if (node?.metadata?.isDirty) {
        const cleaned = cloneNode(node);
        cleaned.metadata.isDirty = false;
        updated.set(id, cleaned);
      }
    }

    return updated;
  }, []);
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
    console.log('[Editor] Reconstructing text from nodeMap');
    const root = nodeMap.get(rootId);
    if (!root) {
      console.log('[Editor] No root found for text reconstruction');
      return '';
    }

    const contentNodes = getContentNodesInOrder(nodeMap, rootId);
    console.log(`[Editor] Reconstructing from ${contentNodes.length} content nodes`);
    
    const reconstructed = contentNodes.map(n => n.content).join(' ');
    console.log('[Editor] Reconstructed text length:', reconstructed.length);
    console.log('[Editor] Reconstructed preview:', reconstructed.substring(0, 100));
    
    return reconstructed;
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
  useEffect(() => {
    console.error(`[Editor] maxDepth changed to ${maxDepth}`);
  }, [maxDepth]);

  const restructuringRef = useRef(false);

  /**
   * Hierarchy state tracking
   * 'none': No hierarchy built yet
   * 'generated': Hierarchy successfully built
   * 'has-dirty-nodes': Content changed, needs hierarchy rebuild
   *
   * @type {['none'|'generated'|'has-dirty-nodes', Function]}
   */
  const [hierarchyState, setHierarchyState] = useState('none');

  /**
   * Is AI hierarchy generation in progress
   * @type {[boolean, Function]}
   */
  const [isGenerating, setIsGenerating] = useState(false);

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

  useEffect(() => {
    console.log('[Editor DEBUG] State changed:');
    console.log('  nodeMap.size:', nodeMap.size);
    console.log('  text length:', text.length);
    console.log('  pendingText length:', pendingText.length);
    console.log('  text === pendingText:', text === pendingText);
    console.log('  text preview:', text.substring(0, 100));
    console.log('  pendingText preview:', pendingText.substring(0, 100));
  }, [nodeMap, text, pendingText]);


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
  const handleGenerateHierarchy = async () => {
    const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);

    if (contentNodes.length === 0) {
      alert('Please add some text first');
      return;
    }

    setIsGenerating(true);

    try {
      console.log('[Editor] Starting AI hierarchy generation');

      const {
        nodeMapToSentenceFormat,
        applyClaudeRestructureToNodeMap,
        applyEmotionsToNodeMap,
      } = await import('../services/nodeToSentenceAdapter');
      const { updateDirtyNodes, evaluateSentenceEmotions } = await import(
        '../services/claude'
      );

      // Step 1: Convert nodeMap to sentence format for Claude
      const sentences = nodeMapToSentenceFormat(nodeMap, rootId, maxDepth);

      console.log('[Editor] Converted nodeMap to sentence format');

      // Step 2: Call Claude to restructure dirty portions
      const hierarchyMeta = sentences._hierarchyMeta;
      const dirtyNodeIds = hierarchyMeta.dirtyNodeIds || [];
      const dirtySentenceIds = hierarchyMeta.dirtySentenceIds || [];

      let restructured = new Map(nodeMap);
      const autoCreatedGroups = Array.from(restructured.values()).filter(
        n => isGroupNode(n) && n.hierarchy.level >= 1 && n.hierarchy.level < maxDepth - 1
      );

      console.log(`[Editor] Removing ${autoCreatedGroups.length} auto-created groups`);
      for (const group of autoCreatedGroups) {
        restructured.delete(group.id);
      }

      // Reset root children to just content nodes
      const root = restructured.get(rootId);
      const contentNodeIds = contentNodes.map(n => n.id);
      const resetRoot = cloneNode(root);
      resetRoot.hierarchy.childIds = contentNodeIds;
      restructured.set(rootId, resetRoot);

      if (dirtyNodeIds.length === 0 && dirtySentenceIds.length === 0) {
        console.log('[Editor] No dirty nodes - skipping restructure');
      } else {
        const { restructuredSubtrees, newRootTitle, newRootEmotions } =
          await updateDirtyNodes(
            sentences,
            hierarchyMeta,
            dirtyNodeIds,
            dirtySentenceIds,
            maxDepth
          );

        console.log('[Editor] ✓ Restructured dirty subtrees');

        // Apply restructuring to cleaned nodeMap
        restructured = applyClaudeRestructureToNodeMap(
          restructured,
          rootId,
          restructuredSubtrees,
          newRootTitle,
          newRootEmotions,
          maxDepth
        );
      }

      // Step 4: Evaluate emotions for all content
      const contentNodesToEvaluate = Array.from(restructured.values())
        .filter(isContentNode)
        .map((n) => ({
          id: n.id,
          content: n.content,
        }));

      if (contentNodesToEvaluate.length > 0) {
        const sentencesWithEmotions = await evaluateSentenceEmotions(
          contentNodesToEvaluate
        );

        console.log('[Editor] ✓ Evaluated emotions');

        // Step 5: Apply emotions back to nodeMap
        const final = applyEmotionsToNodeMap(restructured, sentencesWithEmotions);

        // IMPORTANT: keep hierarchyState === "generated" by clearing dirty flags
        const clean = clearAllDirtyFlags(final);

        setNodeMap(clean);
        setHierarchyState('generated');
        addCommit(clean, 'AI hierarchy generated');

        posthog.capture('hierarchy_ai_generated', {
          node_count: clean.size,
        });
      } else {
        const clean = clearAllDirtyFlags(restructured);

        setNodeMap(clean);
        setHierarchyState('generated');
        addCommit(clean, 'Hierarchy restructured');
      }
    } catch (error) {
      console.error('[Editor] AI generation failed:', error);
      alert(
        'Failed to generate hierarchy: ' +
        (error?.message ? error.message : String(error))
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // =========================================================================
  // TEXT EDITING: DEBOUNCED NODE CREATION
  // =========================================================================
  /**
   * Mark a node as dirty and propagate up the parent chain (inclusive to root)
   * Only marks nodes that aren't already dirty
   */
  const markDirtyUpToRoot = useCallback(
    (nodeId, updated) => {
      const path = [];
      let current = updated.get(nodeId);

      // Collect the path to root
      while (current) {
        path.push(current.id);
        if (current.id === rootId) break;
        current = updated.get(current.hierarchy.parentId);
      }

      // Mark only nodes in the direct path
      path.forEach(id => {
        const node = updated.get(id);
        if (node && !node.metadata.isDirty) {
          const patched = cloneNode(node);
          patched.metadata.isDirty = true;
          patched.metadata.modifiedAt = new Date().toISOString();
          updated.set(id, patched);
          console.log(
            `[Editor] Marked dirty: ${id.substring(0, 8)}`
          );
        }
      });

      // Explicitly mark root as dirty
      const root = updated.get(rootId);
      if (root && !root.metadata.isDirty) {
        const patchedRoot = cloneNode(root);
        patchedRoot.metadata.isDirty = true;
        patchedRoot.metadata.modifiedAt = new Date().toISOString();
        updated.set(rootId, patchedRoot);
        console.log(`[Editor] Marked root dirty: ${rootId.substring(0, 8)}`);
      }
    },
    [rootId]
  );

  /**
   * Process text and update content nodes
   *
   * New nodes are created with the correct parent (same parent as last content node
   * if hierarchy exists, or first group in chain if no content exists yet)
   * to avoid needing reorganization
   *
   * @param {string} newText - Text to process
   * @returns {void}
   */
  const processTextToNodes = useCallback(
    (newText) => {
      console.log('[Editor] Processing text:', newText.substring(0, 50));

      const sentences = parseTextToSentences(newText);

      setNodeMap((prevNodeMap) => {
        const updated = new Map(prevNodeMap);
        const root = updated.get(rootId);
        if (!root) {
          console.error('[Editor] Root not found');
          return prevNodeMap;
        }

        const contentLevel = maxDepth - 1;

        // Groups + top-level groups (ONLY these should be root children)
        const groupNodes = Array.from(updated.values())
          .filter(isGroupNode)
          .sort((a, b) => a.hierarchy.level - b.hierarchy.level);

        const topGroupIds = groupNodes
          .filter((g) => g.hierarchy.parentId === rootId)
          .map((g) => g.id);

        // Content nodes in document order (robust)
        let existingContentIdsOrdered = getContentNodesInOrder(updated, rootId).map(
          (n) => n.id
        );

        // Fallback if tree is temporarily inconsistent
        if (existingContentIdsOrdered.length === 0) {
          existingContentIdsOrdered = Array.from(updated.values())
            .filter(isContentNode)
            .sort((a, b) =>
              String(a.metadata.createdAt).localeCompare(
                String(b.metadata.createdAt)
              )
            )
            .map((n) => n.id);
        }

        // Find the correct parent for NEW content nodes
        // Strategy: Place them in the same group as the LAST existing content node
        let contentParentId = rootId;
        const targetParentLevel = maxDepth - 2;

        if (targetParentLevel > 0 && existingContentIdsOrdered.length > 0) {
          // Get the last existing content node
          const lastExistingId = existingContentIdsOrdered[existingContentIdsOrdered.length - 1];
          const lastExistingNode = updated.get(lastExistingId);

          if (lastExistingNode && lastExistingNode.hierarchy.parentId) {
            // Use the same parent as the last existing content node
            contentParentId = lastExistingNode.hierarchy.parentId;

            console.log(
              `[Editor] New content will use same parent as last content node: ${contentParentId.substring(0, 8)} (level ${updated.get(contentParentId)?.hierarchy.level || 0})`
            );
          } else {
            // Fallback: find ANY group at the target parent level
            const groupAtTargetLevel = Array.from(updated.values()).find(
              n => isGroupNode(n) && n.hierarchy.level === targetParentLevel
            );

            if (groupAtTargetLevel) {
              contentParentId = groupAtTargetLevel.id;
              console.log(
                `[Editor] Found group at target level: ${contentParentId.substring(0, 8)}`
              );
            } else {
              console.warn('[Editor] No suitable parent found, will use root');
            }
          }
        } else if (targetParentLevel > 0 && existingContentIdsOrdered.length === 0) {
          // No existing content - follow the chain from root
          let current = rootId;

          while (true) {
            const node = updated.get(current);
            if (!node) break;

            const nextGroup = node.hierarchy.childIds
              .map(id => updated.get(id))
              .find(child => isGroupNode(child) && child.hierarchy.level < maxDepth - 1);

            if (!nextGroup) {
              contentParentId = current;
              break;
            }

            current = nextGroup.id;

            if (nextGroup.hierarchy.level === targetParentLevel) {
              contentParentId = nextGroup.id;
              break;
            }
          }

          console.log(
            `[Editor] First content - following chain to: ${contentParentId === rootId ? 'root' : contentParentId.substring(0, 8)}`
          );
        }

        // Handle empty text: delete all content and all groups
        if (sentences.length === 0) {
          console.log(
            `[Editor] Empty text - clearing ${existingContentIdsOrdered.length} content nodes`
          );

          for (const id of existingContentIdsOrdered) updated.delete(id);
          for (const g of groupNodes) updated.delete(g.id);

          const newRoot = cloneNode(root);
          newRoot.hierarchy.childIds = [];
          newRoot.metadata.isDirty = true;
          updated.set(rootId, newRoot);

          console.log('[Editor] ✓ All content and groups cleared');
          return updated;
        }

        console.log(`[Editor] Parsed ${sentences.length} sentences`);

        // Update or create content nodes
        const newContentIds = sentences.map((sentence, index) => {
          // Check if this is a list item and extract the marker
          const listMatch = sentence.match(/^(\d+\.|[a-zA-Z]\.) (.+)$/);
          let content = sentence;
          let listMarker = null;

          if (listMatch) {
            listMarker = listMatch[1]; // "1.", "2.", "a.", etc.
            content = listMatch[2]; // The actual content after the marker
          }

          if (index < existingContentIdsOrdered.length) {
            const nodeId = existingContentIdsOrdered[index];
            const existingNode = updated.get(nodeId);

            if (existingNode && existingNode.content !== sentence) {
              const updatedNode = cloneNode(existingNode);
              updatedNode.content = sentence;

              // Store list marker in metadata or structure
              if (listMarker) {
                updatedNode.structure = {
                  type: 'list-item',
                  marker: listMarker,
                  content: content
                };
              }

              updatedNode.metadata.isDirty = true;
              updatedNode.metadata.modifiedAt = new Date().toISOString();
              updated.set(nodeId, updatedNode);

              markDirtyUpToRoot(nodeId, updated);
            }

            return nodeId;
          }

          // Create new node
          const nodeId = uuidv4();
          const newNode = createContentNode(
            nodeId,
            listMarker ? 'list-item' : 'sentence',
            sentence,
            contentParentId,
            {
              metadata: { isDirty: true },
              structure: listMarker ? {
                type: 'list-item',
                marker: listMarker,
                content: content
              } : undefined
            }
          );

          newNode.hierarchy.level = contentLevel;
          updated.set(nodeId, newNode);

          console.log(
            `[Editor] Created content node ${nodeId.substring(0, 8)} under ${contentParentId === rootId ? 'root' : contentParentId.substring(0, 8)}`
          );

          // Propagate dirty flag up
          markDirtyUpToRoot(nodeId, updated);

          // Append to parent's childIds
          if (contentParentId !== rootId) {
            const parent = updated.get(contentParentId);
            if (parent && isGroupNode(parent)) {
              const patchedParent = cloneNode(parent);
              patchedParent.hierarchy.childIds = [
                ...patchedParent.hierarchy.childIds,
                nodeId,
              ];
              updated.set(contentParentId, patchedParent);
            }
          }

          return nodeId;
        });

        // Delete excess content nodes and remove references from any groups
        for (let i = newContentIds.length; i < existingContentIdsOrdered.length; i++) {
          const idToDelete = existingContentIdsOrdered[i];
          updated.delete(idToDelete);

          // Remove from any group childIds
          for (const g of groupNodes) {
            const current = updated.get(g.id);
            if (!current || !isGroupNode(current)) continue;

            if (current.hierarchy.childIds.includes(idToDelete)) {
              const patched = cloneNode(current);
              patched.hierarchy.childIds = patched.hierarchy.childIds.filter(
                (cid) => cid !== idToDelete
              );
              updated.set(g.id, patched);
            }
          }

          console.log(
            `[Editor] Deleted excess content node ${idToDelete.substring(0, 8)}`
          );
        }

        // Root children must be:
        // - top-level groups only (if any groups exist)
        // - otherwise all content nodes
        const updatedRoot = updated.get(rootId) || root; // Get the potentially-marked root
        const newRoot = cloneNode(updatedRoot);
        newRoot.hierarchy.childIds =
          topGroupIds.length > 0 ? topGroupIds : newContentIds;
        updated.set(rootId, newRoot);

        // Ensure content nodes have correct level (and parentId if root has no groups)
        if (topGroupIds.length === 0) {
          for (const id of newContentIds) {
            const node = updated.get(id);
            if (!node || !isContentNode(node)) continue;

            const patched = cloneNode(node);
            patched.hierarchy.parentId = rootId;
            patched.hierarchy.level = contentLevel;
            updated.set(id, patched);
          }
        } else {
          for (const id of newContentIds) {
            const node = updated.get(id);
            if (!node || !isContentNode(node)) continue;

            if (node.hierarchy.level !== contentLevel) {
              const patched = cloneNode(node);
              patched.hierarchy.level = contentLevel;
              updated.set(id, patched);
            }
          }
        }

        console.log(
          `[Editor] Updated: ${topGroupIds.length} top groups, ${newContentIds.length} content`
        );

        return updated;
      });
    },
    [rootId, maxDepth, nodeMap]
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
      console.log(nodeMap.entries);
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
    console.log(`[Editor] Building hierarchy structure with maxDepth=${maxDepth}`);

    const updated = new Map(nodeMap);
    const root = updated.get(rootId);
    if (!root) return;

    // Get all content nodes
    const contentNodes = Array.from(updated.values()).filter(isContentNode);
    if (contentNodes.length === 0) {
      console.log('[Editor] No content nodes to organize');
      return;
    }

    console.log(`[Editor] Organizing ${contentNodes.length} content nodes`);

    // Calculate: how many intermediate groups do we need?
    // maxDepth=2: 0 groups (root → content)
    // maxDepth=3: 1 group (root → group → content)
    // maxDepth=5: 3 groups (root → g1 → g2 → g3 → content)
    const numGroups = maxDepth - 2;

    // Special case: content directly under root
    if (numGroups <= 0) {
      const newRoot = cloneNode(root);
      newRoot.hierarchy.childIds = contentNodes.map(n => n.id);
      updated.set(rootId, newRoot);

      contentNodes.forEach(node => {
        const updatedNode = cloneNode(node);
        updatedNode.hierarchy.level = 1;
        updatedNode.hierarchy.parentId = rootId;
        updated.set(node.id, updatedNode);
      });

      console.log('[Editor] Content directly under root (no groups)');
      setNodeMap(updated);
      setHierarchyState('generated');
      addCommit(updated, 'Hierarchy generated');
      return;
    }

    // Create the group chain: g1 → g2 → ... → gN
    const groups = [];
    for (let i = 0; i < numGroups; i++) {
      const level = i + 1;
      const parentId = i === 0 ? rootId : groups[i - 1].id;
      const groupId = uuidv4();

      const group = createGroupNode(
        groupId,
        i === numGroups - 1 ? 'Content Sections' : `Level ${level}`,
        level,
        parentId,
        [], // childIds filled below
        { metadata: { isDirty: true } }
      );

      groups.push(group);
      updated.set(groupId, group);
    }

    // Connect the chain: each group points to the next (or to content if last)
    const lastGroupId = groups[groups.length - 1].id;
    const contentLevel = maxDepth - 1;

    groups.forEach((group, i) => {
      const updatedGroup = cloneNode(group);
      updatedGroup.hierarchy.childIds =
        i === numGroups - 1
          ? contentNodes.map(n => n.id)  // Last group → content
          : [groups[i + 1].id];          // Other groups → next group
      updated.set(group.id, updatedGroup);
    });

    // Update root to point to first group
    const newRoot = cloneNode(root);
    newRoot.hierarchy.childIds = [groups[0].id];
    updated.set(rootId, newRoot);

    // Update all content nodes: set level and parent
    contentNodes.forEach(node => {
      const updatedNode = cloneNode(node);
      updatedNode.hierarchy.level = contentLevel;
      updatedNode.hierarchy.parentId = lastGroupId;
      updated.set(node.id, updatedNode);
    });

    console.log(`[Editor] ✓ Created ${numGroups} groups, content at level ${contentLevel}`);
    console.log(`[Editor] Structure: Root (0) → ${groups.map((_, i) => `L${i + 1}`).join(' → ')} → Content (${contentLevel})`);

    setNodeMap(updated);
    setHierarchyState('generated');
    addCommit(updated, 'Hierarchy generated');
  }, [nodeMap, rootId, maxDepth, addCommit]);

  /**
   * Auto-build or reorganize hierarchy when content nodes change
   *
   * Ensures all content nodes are properly connected through the
   * intermediate group structure, even when adding new nodes
   */
  useEffect(() => {
    if (restructuringRef.current) {  // ← CHECK FLAG
      restructuringRef.current = false;
      return;
    }

    const root = nodeMap.get(rootId);
    if (!root) return;

    // Get current content nodes
    const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);
    if (contentNodes.length === 0) return;

    // Check if hierarchy structure exists
    const hasIntermediateGroups = Array.from(nodeMap.values()).some(
      n => isGroupNode(n) && n.hierarchy.level >= 1 && n.hierarchy.level <= maxDepth - 2
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
  // HIERARCHY GENERATION
  // =========================================================================

  /**
   * Handle tree modifications (drag/drop in visualization)
   */
  const handleTreeUpdate = useCallback(updatedNodes => {
    console.log('[Editor] Tree updated, node count:', updatedNodes.size);
    
    // Calculate new text from updated nodes
    const root = updatedNodes.get(rootId);
    if (root) {
      const contentNodes = getContentNodesInOrder(updatedNodes, rootId);
      const newText = contentNodes.map(n => n.content).join(' ');
      
      console.log('[Editor DEBUG] Tree update - syncing text:');
      console.log('  old pendingText length:', pendingText.length);
      console.log('  old pendingText preview:', pendingText.substring(0, 100));
      console.log('  new text length:', newText.length);
      console.log('  new text preview:', newText.substring(0, 100));
      console.log('  texts are equal:', pendingText === newText);
      
      // Check first few content nodes for order
      console.log('  First 5 nodes in new order:');
      contentNodes.slice(0, 5).forEach((node, i) => {
        console.log(`    ${i}: "${node.content.substring(0, 40)}"`);
      });
      
      // Sync pendingText with the new order
      setPendingText(newText);
      console.log('[Editor DEBUG] setPendingText called with new text');
      
      // Clear any pending debounce timer since we're updating directly
      if (textDebounceTimerRef.current) {
        console.log('[Editor DEBUG] Clearing existing debounce timer');
        clearTimeout(textDebounceTimerRef.current);
        textDebounceTimerRef.current = null;
      } else {
        console.log('[Editor DEBUG] No debounce timer to clear');
      }
    } else {
      console.error('[Editor] Root not found in updated nodes!');
    }
    
    posthog.capture('tree_updated', {
      node_count: updatedNodes.size,
    });
    
    setNodeMap(updatedNodes);
    addCommit(updatedNodes, 'Tree updated');
  }, [rootId, pendingText, addCommit]);

  // Add this effect near your other useEffect hooks
  useEffect(() => {
    console.log('[Editor DEBUG] pendingText changed:');
    console.log('  new length:', pendingText.length);
    console.log('  preview:', pendingText.substring(0, 100));
  }, [pendingText]);

  
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

  /**
   * Handle maxDepth changes
   *
   * Restructures the entire hierarchy to match the new depth:
   * - Increased depth: Insert new intermediate levels between root and existing groups
   * - Decreased depth: Remove outermost group levels
   */
  useEffect(() => {
    const root = nodeMap.get(rootId);
    if (!root) return;

    // Get all groups sorted by level
    const groupNodes = Array.from(nodeMap.values())
      .filter(isGroupNode)
      .sort((a, b) => a.hierarchy.level - b.hierarchy.level);

    if (groupNodes.length === 0) return;

    const currentMaxLevel = Math.max(...groupNodes.map(n => n.hierarchy.level));
    const currentDepth = currentMaxLevel + 2;

    if (currentDepth === maxDepth) return; // No change needed

    console.log(
      `[Editor] maxDepth changed: ${currentDepth} → ${maxDepth}`
    );

    restructuringRef.current = true;

    const updated = new Map(nodeMap);
    const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);
    const levelDiff = Math.abs(maxDepth - currentDepth);

    if (maxDepth > currentDepth) {
      // ========== INCREASE DEPTH ==========
      console.log(`[Editor] Inserting ${levelDiff} new levels`);

      const oldTopGroupId = root.hierarchy.childIds[0];
      if (!oldTopGroupId) return;

      const newGroupIds = [];
      let currentParent = rootId;

      // Create new groups to insert
      for (let i = 0; i < levelDiff; i++) {
        const newGroupId = uuidv4();
        const newGroup = createGroupNode(
          newGroupId,
          `Level ${i + 1}`,
          i + 1,
          currentParent,
          [],
          { metadata: { isDirty: false } }
        );
        updated.set(newGroupId, newGroup);
        newGroupIds.push(newGroupId);
        currentParent = newGroupId;
      }

      // Chain new groups together
      for (let i = 0; i < newGroupIds.length - 1; i++) {
        const group = updated.get(newGroupIds[i]);
        const chainedGroup = cloneNode(group);
        chainedGroup.hierarchy.childIds = [newGroupIds[i + 1]];
        updated.set(newGroupIds[i], chainedGroup);
      }

      // Connect last new group to old top group
      const lastNewGroupId = newGroupIds[newGroupIds.length - 1];
      const lastNewGroup = updated.get(lastNewGroupId);
      const connectedGroup = cloneNode(lastNewGroup);
      connectedGroup.hierarchy.childIds = [oldTopGroupId];
      updated.set(lastNewGroupId, connectedGroup);

      // Update old top group's parent and level
      const oldTopGroup = updated.get(oldTopGroupId);
      const updatedOldTop = cloneNode(oldTopGroup);
      updatedOldTop.hierarchy.parentId = lastNewGroupId;
      updatedOldTop.hierarchy.level += levelDiff;
      updated.set(oldTopGroupId, updatedOldTop);

      // Update all other groups' levels
      groupNodes.forEach(group => {
        if (group.id !== oldTopGroupId) {
          const updatedGroup = cloneNode(group);
          updatedGroup.hierarchy.level += levelDiff;
          updated.set(group.id, updatedGroup);
        }
      });

      // Update content nodes' levels
      contentNodes.forEach(node => {
        const updatedNode = cloneNode(node);
        updatedNode.hierarchy.level += levelDiff;
        updated.set(node.id, updatedNode);
      });

      // Update root
      const updatedRoot = cloneNode(root);
      updatedRoot.hierarchy.childIds = [newGroupIds[0]];
      updated.set(rootId, updatedRoot);

      console.log(`[Editor] ✓ Inserted ${levelDiff} new levels`);
    } else {
      // ========== DECREASE DEPTH ==========
      console.log(`[Editor] Removing ${levelDiff} outermost levels`);

      const groupsToDelete = groupNodes.filter(g => g.hierarchy.level <= levelDiff);
      const groupsToKeep = groupNodes.filter(g => g.hierarchy.level > levelDiff);

      groupsToDelete.forEach(group => updated.delete(group.id));

      groupsToKeep.forEach(group => {
        const updatedGroup = cloneNode(group);
        updatedGroup.hierarchy.level -= levelDiff;

        if (updatedGroup.hierarchy.parentId && !updated.has(updatedGroup.hierarchy.parentId)) {
          updatedGroup.hierarchy.parentId = rootId;
        }

        updated.set(group.id, updatedGroup);
      });

      contentNodes.forEach(node => {
        const updatedNode = cloneNode(node);
        updatedNode.hierarchy.level -= levelDiff;
        updated.set(node.id, updatedNode);
      });

      const updatedRoot = cloneNode(root);
      if (groupsToKeep.length > 0) {
        const firstKeptGroup = updated.get(groupsToKeep[0].id);
        const updatedFirst = cloneNode(firstKeptGroup);
        updatedFirst.hierarchy.parentId = rootId;
        updated.set(firstKeptGroup.id, updatedFirst);
        updatedRoot.hierarchy.childIds = [groupsToKeep[0].id];
      } else {
        updatedRoot.hierarchy.childIds = contentNodes.map(n => n.id);
      }
      updated.set(rootId, updatedRoot);

      console.log(`[Editor] ✓ Removed ${levelDiff} levels`);
    }

    // Update immediately
    setNodeMap(updated);
    addCommit(updated, `Depth changed: ${currentDepth} → ${maxDepth}`);

    // Clear flag after update
    restructuringRef.current = false;
  }, [maxDepth, hierarchyState, nodeMap, rootId, addCommit]);

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
                    handleGenerateHierarchy();
                  }}
                  disabled={isGenerating || nodeMap.size === 1}
                  style={{
                    ...floatingButtonStyle,
                    backgroundColor:
                      hierarchyState !== 'generated' ? ((isGenerating || nodeMap.size === 1) ? '#7c7c7cff' : '#0c0c0eff') : '#10b981',
                    color: 'white',
                  }}
                >
                  {isGenerating ? (
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
              </div>

              <EmotionsLegend />

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

    // Split on sentence punctuation, but preserve numbered lists
    const parts = [];
    let current = '';
    let i = 0;

    while (i < trimmed.length) {
      const char = trimmed[i];
      current += char;

      // Check for sentence ending punctuation
      if (char === '.' || char === '!' || char === '?') {
        // Look for following whitespace
        let spaceStart = i + 1;
        while (spaceStart < trimmed.length && /\s/.test(trimmed[spaceStart])) {
          spaceStart++;
        }

        // If we have whitespace and more content after
        if (spaceStart > i + 1 && spaceStart < trimmed.length) {
          // Check if this is NOT a list marker
          // List markers: "1.", "2.", "a.", "A.", etc. at the start of current segment
          const currentTrimmed = current.trim();
          const isListMarker = /^[0-9]+\.$|^[a-zA-Z]\.$/.test(currentTrimmed);

          if (!isListMarker) {
            // This is a sentence ending, split here
            parts.push(current.trim());
            current = '';
            i = spaceStart - 1; // Position before next content (will be incremented)
          }
        }
      }
      i++;
    }

    // Add remaining content
    if (current.trim()) {
      parts.push(current.trim());
    }

    sentences.push(...parts.filter(part => part.length > 0));
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
  console.log('[DEBUG getContentNodesInOrder] Starting traversal from root:', rootId);
  
  const root = nodeMap.get(rootId);
  if (!root) {
    console.log('[DEBUG getContentNodesInOrder] Root not found!');
    return [];
  }

  console.log('[DEBUG getContentNodesInOrder] Root children:', root.hierarchy.childIds);

  const nodes = [];
  const queue = [...root.hierarchy.childIds];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeMap.get(nodeId);
    
    console.log(`[DEBUG getContentNodesInOrder] Processing node ${nodeId}:`, 
                node ? `${node.hierarchy.role} - "${node.content?.substring(0, 30)}"` : 'NOT FOUND');
    
    if (!node) continue;

    if (isContentNode(node)) {
      nodes.push(node);
      console.log(`[DEBUG getContentNodesInOrder] Added content node: "${node.content.substring(0, 30)}"`);
    } else if (isGroupNode(node)) {
      console.log(`[DEBUG getContentNodesInOrder] Expanding group node, children:`, node.hierarchy.childIds);
      queue.unshift(...node.hierarchy.childIds);
    }
  }

  console.log(`[DEBUG getContentNodesInOrder] Final order: ${nodes.length} content nodes`);
  nodes.forEach((node, i) => {
    console.log(`  ${i}: "${node.content.substring(0, 30)}"`);
  });

  return nodes;
}