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
import LogoMenu from '@components/LogoMenu/LogoMenu';
import DepthRecommendationSnackbar from '@components/DepthRecommendation/DepthRecommendationSnackbar';
import DepthChangeConfirmationModal from '@components/DepthRecommendation/DepthChangeConfirmationModal';
import RichTextEditor from '@components/RichTextEditor/RichTextEditor';

// Utils & Services
import posthog from '@utils/posthog';
import {
  EMOTIONS,
  EMOTION_COLORS,
  EMOTION_LABELS,
} from '@utils/constants';
import { shouldShowRecommendation } from '@utils/depthRecommendation';
import { syncNodeMapWithText } from '@utils/textToNodesParser.js';

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
import { HorizontalDividerHandle, VerticalDividerHandle } from '@components/Deviders';
import { getContentNodeIdsInDocumentOrder, getContentNodesInDocumentOrder } from '@utils/nodeHelpers';
import { nodeMapToMarkdown } from '@utils/nodeToMarkdown';
import getPoemLines from '@utils/poetry';

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
    const markdown = nodeMapToMarkdown(nodeMap, rootId);
    console.log('[Editor] Reconstructed text length:', markdown.length);
    console.log('[Editor] Reconstructed preview:', markdown.substring(0, 100));
    return markdown;
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

  /**
   * Show depth recommendation snackbar
   * @type {[boolean, Function]}
   */
  const [showDepthRecommendation, setShowDepthRecommendation] = useState(false);

  /**
   * Recommended depth based on content analysis
   * @type {[number, Function]}
   */
  const [recommendedDepth, setRecommendedDepth] = useState(3);

  /**
   * Show depth change confirmation modal
   * @type {[boolean, Function]}
   */
  const [showDepthConfirmation, setShowDepthConfirmation] = useState(false);
  useEffect(() => {
    const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);
    const result = shouldShowRecommendation(contentNodes.length, maxDepth, lastRecommendedDepthRef.current);

    if (result.shouldShow) {
      setRecommendedDepth(result.recommendedDepth);
      setShowDepthRecommendation(true);
      lastRecommendedDepthRef.current = result.recommendedDepth;

      // Log recommendation event
      posthog.capture('depth_recommendation_shown', {
        current_depth: maxDepth,
        recommended_depth: result.recommendedDepth,
        content_node_count: contentNodes.length,
      });
    }
  }, [nodeMap, maxDepth]);

  /**
   * Last recommended depth to avoid repeated prompts
   * @type {React.MutableRefObject<number|null>}
   */
  const lastRecommendedDepthRef = useRef(null);

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
  const [draftText, setDraftText] = useState('');

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
  // POETRY LOADING
  // =========================================================================
  
  const [isLoadingPoetry, setIsLoadingPoetry] = useState(false);

  // =========================================================================
  // INITIALIZATION & EFFECTS
  // =========================================================================

  useUserIdentification();

  useEffect(() => {
    console.log('[Editor DEBUG] State changed:');
    console.log('  nodeMap.size:', nodeMap.size);
    console.log('  text length:', text.length);
    console.log('  pendingText length:', draftText.length);
    console.log('  text === pendingText:', text === draftText);
    console.log('  text preview:', text.substring(0, 100));
    console.log('  pendingText preview:', draftText.substring(0, 100));
  }, [nodeMap, text, draftText]);


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

    const contentNodes = getContentNodeIdsInDocumentOrder(nodeMap, rootId);
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
   * Repair orphaned nodes - ensure all content is reachable from root
   * @param {Map<string, Node>} nodeMap
   * @param {string} rootId
   * @returns {Map<string, Node>}
   */
  function repairOrphanedNodes(nodeMap, rootId) {
    const root = nodeMap.get(rootId);
    if (!root) return nodeMap;

    // Mark all reachable nodes via DFS
    const visited = new Set();
    const queue = [...(root.hierarchy.childIds || [])];
    
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodeMap.get(id);
      if (node && node.hierarchy.childIds) {
        queue.push(...node.hierarchy.childIds);
      }
    }

    // Find orphaned top-level groups (level 1, but not reachable)
    const orphanedGroups = Array.from(nodeMap.values())
      .filter(n => 
        isGroupNode(n) && 
        n.hierarchy.level === 1 && 
        !visited.has(n.id)
      );

    if (orphanedGroups.length === 0) {
      return nodeMap; // No orphans
    }

    console.warn(`[Editor] Found ${orphanedGroups.length} orphaned top-level groups, reattaching to root`);

    const updated = new Map(nodeMap);
    const patchedRoot = cloneNode(root);
    
    // Add orphaned groups to root
    for (const group of orphanedGroups) {
      if (!patchedRoot.hierarchy.childIds.includes(group.id)) {
        patchedRoot.hierarchy.childIds.push(group.id);
        console.warn(`[Editor]   - Re-attached orphaned group: ${group.id}`);
      }
      
      // Ensure group's parent is set to root
      if (group.hierarchy.parentId !== rootId) {
        const patchedGroup = cloneNode(group);
        patchedGroup.hierarchy.parentId = rootId;
        updated.set(group.id, patchedGroup);
      }
    }

    updated.set(rootId, patchedRoot);
    return updated;
  }

  const handleGenerateHierarchy = async () => {
    console.log('[CRITICAL] ▶ START handleGenerateHierarchy');
    console.log('  Current nodeMap size:', nodeMap.size);
    console.log('  Current nodeMap keys sample:', 
        Array.from(nodeMap.keys()).slice(0, 10).map(k => k.slice(0, 8)));
    
    const contentNodes = Array.from(nodeMap.values()).filter(isContentNode);
    console.log('  Content nodes:', contentNodes.length);
    console.log('  Content IDs sample:', contentNodes.slice(0, 5).map(n => n.id.slice(0, 8)));

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
      // const autoCreatedGroups = Array.from(restructured.values()).filter(
      //   n => isGroupNode(n) && n.hierarchy.level >= 1 && n.hierarchy.level < maxDepth - 1
      // );

      // ✅ LOG HERE
      // console.log('[CRITICAL] Before removing auto-created groups:');
      // console.log('  Groups to remove:', autoCreatedGroups.length);
      // console.log('  Group IDs:', autoCreatedGroups.map(g => g.id));
      // console.log('  Current restructured size:', restructured.size);

      // console.log('[CRITICAL] Removing auto-created groups...');
      // for (const group of autoCreatedGroups) {
      //     restructured.delete(group.id);
      // }
      console.log('  After deletion, restructured size:', restructured.size);

      // console.log(`[Editor] Removing ${autoCreatedGroups.length} auto-created groups`);
      // for (const group of autoCreatedGroups) {
      //   restructured.delete(group.id);
      // }

      // Reset root children to just content nodes
      const root = restructured.get(rootId);
      const contentNodeIds = contentNodes.map(n => n.id);
      const resetRoot = cloneNode(root);
      resetRoot.hierarchy.childIds = contentNodeIds;
      restructured.set(rootId, resetRoot);

      // ✅ LOG HERE
      console.log('[CRITICAL] After resetting root:');
      console.log('  Root now has children:', resetRoot.hierarchy.childIds.length);
      console.log('  Child IDs sample:', resetRoot.hierarchy.childIds.slice(0, 5).map(id => id.slice(0, 8)));
      console.log('  All children exist in restructured?', 
          resetRoot.hierarchy.childIds.every(id => restructured.has(id)));

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

        // ✅ LOG HERE
        console.log('[CRITICAL] After Claude restructure:');
        console.log('  Restructured size:', restructured.size);
      }

      // ✅ CRITICAL FIX 1: Ensure Root points to ALL top-level groups
      // After Claude restructuring, there might be new top-level groups
      // We MUST collect ALL of them and update Root
      {
        const patchedRoot = cloneNode(restructured.get(rootId) || root);
        
        // Find ALL groups at level 1 (top-level groups)
        const allTopLevelGroups = Array.from(restructured.values())
          .filter(n => isGroupNode(n) && n.hierarchy.level === 1)
          .map(n => n.id);
        console.log('  Top-level groups created:', allTopLevelGroups.length);
        console.log('  Group IDs:', allTopLevelGroups.map(g => g?.id));

        if (allTopLevelGroups.length > 0) {
          console.log(`[Editor] Found ${allTopLevelGroups.length} top-level groups after restructuring`);
          console.log('[Editor] Top-level group IDs:', allTopLevelGroups.join(', '));
          
          // Update root to point to ALL top-level groups (preserve order)
          patchedRoot.hierarchy.childIds = allTopLevelGroups;
        } else {
          // No groups created - point directly to content
          const allContentNodeIds = Array.from(restructured.values())
            .filter(isContentNode)
            .map(n => n.id);
          console.log(`[Editor] No top-level groups found, pointing root to ${allContentNodeIds.length} content nodes`);
          patchedRoot.hierarchy.childIds = allContentNodeIds;
        }

        restructured.set(rootId, patchedRoot);
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

        // ✅ CRITICAL FIX 2: Repair any orphaned nodes before saving
        const repaired = repairOrphanedNodes(final, rootId);
        // ✅ LOG HERE
        console.log('[CRITICAL] After repairOrphanedNodes:');
        console.log('  Repaired size:', repaired.size);
        console.log('  Before repair size:', final.size);
        console.log('  Nodes deleted:', final.size - repaired.size);
        // Verify all content is reachable
        try {
            const reachable = getContentNodeIdsInDocumentOrder(repaired, rootId);
            console.log('  Reachable content nodes:', reachable.length);
            console.log('  Content nodes in repaired:', Array.from(repaired.values()).filter(isContentNode).length);
        } catch (e) {
            console.error('  ❌ ERROR checking reachable nodes:', e.message);
        }

        // Clear dirty flags
        const clean = clearAllDirtyFlags(repaired);

        setNodeMap(clean);
        // ✅ DEBUG
        console.log('[Editor DEBUG] After setNodeMap:');
        console.log('  nodeMap.size:', clean.size);
        console.log('  Root:', clean.get(rootId));
        const groups = Array.from(clean.values()).filter(n => isGroupNode(n));
        console.log('  Groups:', groups.map(g => ({ id: g.id, level: g.hierarchy.level, childCount: g.hierarchy.childIds.length })));
        const contents = Array.from(clean.values()).filter(n => isContentNode(n));
        console.log('  Content nodes:', contents.length);
        const allReachable = getContentNodeIdsInDocumentOrder(clean, rootId);
        console.log('  Reachable content:', allReachable.length);
        // ✅ END DEBUG
        setHierarchyState('generated');
        addCommit(clean, 'AI hierarchy generated');

        posthog.capture('hierarchy_ai_generated', {
          node_count: clean.size,
        });
      } else {
        const repaired = repairOrphanedNodes(restructured, rootId);
        const clean = clearAllDirtyFlags(repaired);

        // ✅ LOG HERE - FINAL CHECK
        console.log('[CRITICAL] ◀ END handleGenerateHierarchy - Final state:');
        console.log('  Final nodeMap size:', clean.size);
        console.log('  Content nodes:', Array.from(clean.values()).filter(isContentNode).length);

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
  // DEPTH CHANGE HANDLING
  // ========================================================================

  // Handle dismissing the depth recommendation
  const handleDismissRecommendation = useCallback(() => {
      setShowDepthRecommendation(false);
      lastRecommendedDepthRef.current = recommendedDepth;

      posthog.capture('depth_recommendation_dismissed', {
          current_depth: maxDepth,
          recommended_depth: recommendedDepth,
      });
  }, [maxDepth, recommendedDepth]);

  // Handle accepting the depth recommendation
  const handleAcceptRecommendation = useCallback(() => {
      setShowDepthRecommendation(false);
      setShowDepthConfirmation(true);
  }, []);

  // Handle confirming the depth change in modal
  const handleConfirmDepthChange = useCallback(() => {
      setShowDepthConfirmation(false);
      lastRecommendedDepthRef.current = recommendedDepth;
      setMaxDepth(recommendedDepth);

      posthog.capture('depth_recommendation_accepted', {
          old_depth: maxDepth,
          new_depth: recommendedDepth,
      });
  }, [maxDepth, recommendedDepth]);

  const handleCancelDepthChange = useCallback(() => {
      setShowDepthConfirmation(false);
      // Maybe reshown the snackbar? Or just close. Let's just close for now.
  }, []);

  // =========================================================================
  // TEXT EDITING: DEBOUNCED NODE CREATION
  // =========================================================================

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
      
      const updated = syncNodeMapWithText(nodeMap, newText, {
        rootId,
        maxDepth,
        createId: () => uuidv4(),
        nowIso: () => new Date().toISOString(),
        spacesPerIndent: 2,
      });

      setNodeMap(updated);
      console.log('[Editor] Updated nodeMap, new size:', updated.size);
    },
    [nodeMap, rootId, maxDepth]
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
      setDraftText(newText);

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
      processTextToNodes(draftText);
    }
  }, [draftText, processTextToNodes]);

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
   * Handle document import from file
   * Updates nodeMap and draftText when a file is imported
   */
  const handleImportComplete = useCallback((importResult, importId) => {
    console.log('[Editor] Import completed:', {
      nodeCount: importResult.nodeMap.size,
      textLength: importResult.draftText.length,
      importId,
    });

    // Update state with imported content
    setNodeMap(importResult.nodeMap);
    setDraftText(importResult.draftText);

    console.log('[Editor] ✓ Import applied to editor');
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
        { metadata: {
          isDirty: true,
          createdAt: new Date().toISOString(),
          version: 1
        } }
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
  // POETRY
  // =========================================================================
  const insertPoetry = async () => {
    setIsLoadingPoetry(true);
    try {
      const poetryText = await getPoemLines(10);
      
      // Append poetry to current text
      const newText = draftText + (draftText ? '\n\n' : '') + poetryText;
      
      // Update draft text
      setDraftText(newText);
      
      // Process the new text into nodes immediately
      processTextToNodes(newText);
      
      // Mark hierarchy as having dirty nodes for potential regeneration
      setHierarchyState('has-dirty-nodes');
      
      // Log event
      posthog.capture('poetry_inserted', {
        text_length: poetryText.length,
        line_count: poetryText.split('\n').length,
        total_text_length: newText.length,
      });
      
      addCommit(nodeMap, 'Poetry inserted');
    } catch (error) {
      console.error('Failed to load poetry:', error);
      posthog.capture('poetry_load_error', {
        error: error.message,
      });
    } finally {
      setIsLoadingPoetry(false);
    }
  };
  // =========================================================================
  // HIERARCHY GENERATION
  // =========================================================================

  /**
   * Handle tree modifications (drag/drop in visualization)
   */
  const handleTreeUpdate = useCallback(updatedNodes => {
    console.log('[CRITICAL] AFTER tree update from subtree changes:');
    console.log('  Updated nodeMap size:', updatedNodes.size);
    
    // Calculate new text from updated nodes
    const root = updatedNodes.get(rootId);

    // DEV NODEMAP 
    const contentCount = Array.from(updatedNodes.values()).filter(isContentNode).length;
    const reachable = getContentNodesInDocumentOrder(updatedNodes, rootId).length;
    if (contentCount > 0 && reachable === 0) {
      console.error('nodeMap has content nodes but none are reachable from root!');
      console.log('root childIds:', root?.hierarchy.childIds);
      throw new Error('Invariant failed: content nodes unreachable from root');
    }

    if (root) {
      const contentNodes = getContentNodesInDocumentOrder(updatedNodes, rootId);
      const newText = nodeMapToMarkdown(updatedNodes, rootId);
      
      console.log('[Editor DEBUG] Tree update - syncing text:');
      console.log('  old draftText length:', draftText.length);
      console.log('  old draftText preview:', draftText.substring(0, 100));
      console.log('  new text length:', newText.length);
      console.log('  new text preview:', newText.substring(0, 100));
      console.log('  texts are equal:', draftText === newText);
      
      // Check first few content nodes for order
      console.log('  First 5 nodes in new order:');
      contentNodes.slice(0, 5).forEach((node, i) => {
        console.log(`    ${i}: "${node.content?.substring(0, 40)}"`);
      });
      

      // Clear timer FIRST
      if (textDebounceTimerRef.current) {
        clearTimeout(textDebounceTimerRef.current);
        textDebounceTimerRef.current = null;
      }

      // "Atomic" udpate
      setDraftText(newText);
      setNodeMap(updatedNodes);

      addCommit(updatedNodes, 'Tree updated');
      console.log('[Editor DEBUG] setPendingText called with new text');
      
    } else {
      console.error('[Editor] Root not found in updated nodes!');
    }
    
    posthog.capture('tree_updated', {
      node_count: updatedNodes.size,
    });
    
  }, [rootId, addCommit]);

  // Add this effect near your other useEffect hooks
  useEffect(() => {
    console.log('[Editor DEBUG] pendingText changed:');
    console.log('  new length:', draftText.length);
    console.log('  preview:', draftText.substring(0, 100));
  }, [draftText]);

  /**
   * Sync draftText when text is recalculated externally (e.g., history revert)
   * This ensures the editor updates when nodeMap changes
   */
  useEffect(() => {
    setDraftText(text);
  }, [text]);

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
          { metadata: {
            isDirty: false,
            createdAt: new Date().toISOString(),
            version: 1
          } }
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
      <LogoMenu 
        maxDepth={maxDepth} 
        setMaxDepth={setMaxDepth}
        nodeMap={nodeMap}
        setNodeMap={setNodeMap}
        setDraftText={setDraftText}
        rootId={rootId}
        onImportComplete={handleImportComplete}
        onInsertPoetry={insertPoetry} 
        isLoadingPoetry={isLoadingPoetry}
      />

      {/* Depth Recommendation Snackbar */}
      <DepthRecommendationSnackbar
          isVisible={showDepthRecommendation}
          recommendedDepth={recommendedDepth}
          currentDepth={maxDepth}
          onAccept={handleAcceptRecommendation}
          onDismiss={handleDismissRecommendation}
      />

      {/* Depth Change Confirmation Modal */}
      <DepthChangeConfirmationModal
          isOpen={showDepthConfirmation}
          currentDepth={maxDepth}
          newDepth={recommendedDepth}
          onConfirm={handleConfirmDepthChange}
          onCancel={handleCancelDepthChange}
      />

      {/* Main Content Area */}
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
              value={draftText}
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
                       ((isGenerating || nodeMap.size === 1) ? '#7c7c7cff' : '#0c0c0eff'),
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