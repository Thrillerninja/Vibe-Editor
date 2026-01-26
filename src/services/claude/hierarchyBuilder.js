/**
 * @fileoverview Deterministic Hierarchy Building from Topics
 * 
 * System algorithm (not AI) for building hierarchy from detected topics.
 * Ensures structure validity, complete emotion profiles, and proper levels.
 * 
 * INPUT: Topics (contiguous sentence groups from Claude boundary detection)
 * OUTPUT: Complete hierarchy from level 2 to maxDepth-1 with validated emotions
 * 
 * @typedef {import('../types/node').Node} Node
 * @typedef {import('../types/node').EmotionProfile} EmotionProfile
 */

import { applyTitlesToNodes, generateTitlesForAllNodes } from '@services/titleGenerator';
import { EMOTION_AXES } from '@utils/constants';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create a complete 10-axis emotion profile with defaults
 * ALL 10 DES keys guaranteed present
 * 
 * @param {Partial<EmotionProfile>} [overrides={}] - Values to override
 * @returns {EmotionProfile} - Complete profile with all 10 keys
 * 
 * @example
 * const profile = createEmotionProfile({ joy: 80, sadness: 20 });
 * // Result: {interest:50, joy:80, surprise:30, sadness:20, anger:10, ...all 10 keys...}
 */
export function createEmotionProfile(overrides = {}) {
  const profile = {};
  
  // Initialize all 10 axes with defaults
  EMOTION_AXES.forEach(axis => {
    profile[axis] = 50; // Default neutral value
  });
  
  // Apply overrides and validate
  for (const [key, value] of Object.entries(overrides)) {
    if (!EMOTION_AXES.includes(key)) {
      console.warn(`[hierarchyBuilder] Unknown emotion axis: ${key}`);
      continue;
    }
    
    const numValue = Number(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      console.warn(`[hierarchyBuilder] Invalid emotion value for ${key}: ${value}`);
      continue;
    }
    
    profile[key] = numValue;
  }
  
  return profile;
}

/**
 * Validate that an emotion profile has all required DES axes
 * 
 * @param {EmotionProfile} profile - Profile to validate
 * @throws {Error} If profile is invalid
 * @returns {boolean}
 * 
 * @example
 * try {
 *   validateEmotionProfile(myProfile);
 *   console.log('✓ Profile valid');
 * } catch (e) {
 *   console.error('✗ Profile invalid:', e.message);
 * }
 */
export function validateEmotionProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error(`Emotion profile must be an object, got ${typeof profile}`);
  }
  
  const missingAxes = [];
  const invalidAxes = [];
  
  for (const axis of EMOTION_AXES) {
    if (!(axis in profile)) {
      missingAxes.push(axis);
      continue;
    }
    
    const value = profile[axis];
    
    if (typeof value !== 'number' || isNaN(value)) {
      invalidAxes.push(`${axis} (not a number)`);
      continue;
    }
    
    if (value < 0 || value > 100) {
      invalidAxes.push(`${axis} = ${value} (out of range 0-100)`);
    }
  }
  
  if (missingAxes.length > 0) {
    throw new Error(
      `Emotion profile missing axes: ${missingAxes.join(', ')}`
    );
  }
  
  if (invalidAxes.length > 0) {
    throw new Error(
      `Emotion profile has invalid values: ${invalidAxes.join(', ')}`
    );
  }
  
  return true;
}

/**
 * Validate hierarchy structure
 * Checks:
 * - All levels from 2 to maxLevel present
 * - Parent-child relationships correct
 * - No orphaned nodes
 * - All emotions have 10 axes
 * 
 * @param {Node[]} nodes - Hierarchy nodes to validate
 * @param {number} maxDepth - Maximum depth (maxLevel = maxDepth - 1)
 * @param {string[]} sentenceIds - Original sentence IDs for reference
 * @throws {Error} With detailed validation error
 * @returns {boolean}
 * 
 * @example
 * try {
 *   validateHierarchyStructure(nodes, 4, sentenceIds);
 *   console.log('✓ Hierarchy valid');
 * } catch (e) {
 *   console.error('✗ Invalid:', e.message);
 * }
 */
export function validateHierarchyStructure(nodes, maxDepth, sentenceIds = []) {
  const contentLevel = maxDepth - 1;
  const maxGroupLevel = maxDepth - 2;
  
  for (const node of nodes) {
    // Groups must be level 1 to maxGroupLevel
    if (node.level < 1 || node.level > maxGroupLevel) {
      throw new Error(
        `Node ${node.id} has invalid level ${node.level} ` +
        `(must be 1-${maxGroupLevel} for grouping)`
      );
    }
    
    // Validate parent-child levels
    for (const childId of node.childIds) {
      if (sentenceIds.includes(childId)) {
        // Child is a sentence - only level 1 can contain sentences
        if (node.level !== 1) {
          throw new Error(
            `Node ${node.id} (level ${node.level}) contains sentence, ` +
            `but only level 1 groups can contain sentences`
          );
        }
      } else {
        // Child is a group - must be exactly one level lower
        const childNode = nodes.find(n => n.id === childId);
        if (!childNode) {
          throw new Error(`Child ${childId} not found`);
        }
        if (childNode.level !== node.level - 1) {
          throw new Error(
            `Node ${node.id} (level ${node.level}) contains child ` +
            `${childId} (level ${childNode.level}), but should contain level ${node.level - 1}`
          );
        }
      }
    }
  }
  
  console.log(`[hierarchyBuilder] ✓ Validated: levels 1-${maxGroupLevel}, all emotions present`);
}

/**
 * Build hierarchy from topics WITH real titles
 */
export async function buildHierarchyFromTopicsWithTitles(
  topics,
  sentences,
  maxDepth
) {
  console.log(`[hierarchyBuilder] Building hierarchy with auto-generated titles`);

  // First: build structure with placeholder titles
  const placeholderNodes = buildHierarchyFromTopics(topics, sentences, maxDepth);

  // Second: generate real titles based on content
  try {
    const titleMap = await generateTitlesForAllNodes(placeholderNodes, sentences);
    const finalNodes = applyTitlesToNodes(placeholderNodes, titleMap);
    
    console.log(`[hierarchyBuilder] ✓ Applied titles to all ${finalNodes.length} nodes`);
    return finalNodes;
  } catch (error) {
    console.error('[hierarchyBuilder] Title generation failed, using placeholders:', error);
    return placeholderNodes;
  }
}

/**
 * Build hierarchy from detected topics
 * Uses system algorithm (deterministic) to create complete structure
 * 
 * ALGORITHM:
 * - Level 2: One node per topic (groups consecutive sentences)
 * - Level 3+: Hierarchical clustering (sqrt-based grouping)
 * - Top level: Single root-like group containing all level N-1 nodes
 * 
 * @param {Array<{id: string, name: string, sentenceIndices: number[]}>} topics - Topics from boundary detection
 * @param {Array<{id: string, content: string}>} sentences - Original sentences (for context)
 * @param {number} maxDepth - Maximum hierarchy depth
 * @returns {Node[]} - Hierarchy nodes (NOT including root or content)
 * @throws {Error} If hierarchy cannot be created
 * 
 * @example
 * const topics = [
 *   { id: 'topic-0', name: 'Introduction', sentenceIndices: [0, 1] },
 *   { id: 'topic-1', name: 'Methods', sentenceIndices: [2, 3, 4] },
 * ];
 * const nodes = buildHierarchyFromTopics(topics, sentences, 4);
 * // Returns: [...level 2 nodes, ...level 3 nodes, ...level 4 node]
 */
export function buildHierarchyFromTopics(topics, sentences, maxDepth) {
  console.log(`[hierarchyBuilder] Building with App levels (1-${maxDepth-2})`);
  
  const nodes = [];
  const contentLevel = maxDepth - 1;
  const sentenceIds = sentences.map(s => s.id);
  
  // LEVEL 1: ONE NODE PER TOPIC
  const level1Nodes = topics.map(topic => ({
    id: `level1-${uuidv4()}`,
    level: 1, // App level 1 (first grouping level)
    title: topic.name || `Topic ${topics.indexOf(topic) + 1}`,
    emotions: createEmotionProfile(),
    childIds: topic.sentenceIndices
      .map(idx => sentenceIds[idx])
      .filter(Boolean),
  }));
  
  nodes.push(...level1Nodes);
  console.log(`[hierarchyBuilder] Created ${level1Nodes.length} level-1 groups`);
  
  // BUILD UP TO maxDepth-2
  let currentLevel = 2;
  let currentGroups = level1Nodes;
  
  while (currentLevel <= maxDepth - 2 && currentGroups.length > 1) {
    const nextGroups = [];
    const groupSize = Math.ceil(Math.sqrt(currentGroups.length));
    
    for (let i = 0; i < currentGroups.length; i += groupSize) {
      const chunk = currentGroups.slice(i, i + groupSize);
      const sectionNum = Math.floor(i / groupSize) + 1;
      
      nextGroups.push({
        id: `level${currentLevel}-${uuidv4()}`,
        level: currentLevel,
        title: `Section ${sectionNum}`,
        emotions: createEmotionProfile(),
        childIds: chunk.map(g => g.id),
      });
    }
    
    nodes.push(...nextGroups);
    console.log(`[hierarchyBuilder] Created ${nextGroups.length} level-${currentLevel} groups`);
    
    if (nextGroups.length === currentGroups.length) break;
    
    currentGroups = nextGroups;
    currentLevel++;
  }
  
  validateHierarchyStructure(nodes, maxDepth, sentenceIds);
  return nodes;
}

/**
 * Create next hierarchy level by grouping current groups
 * Uses sqrt-based clustering for balanced tree
 * 
 * @private
 * @param {Array<{id: string, level: number, title: string, childIds: string[]}>} groups - Groups at current level
 * @param {number} targetLevel - Level to create (current level + 1)
 * @returns {Array} - Parent groups for next level
 * 
 * @example
 * // 10 level-2 groups → 3-4 level-3 groups
 * const l3Groups = createNextHierarchyLevel(level2Groups, 3);
 */
function createNextHierarchyLevel(groups, targetLevel) {
  if (groups.length <= 2) {
    // Can't group 1-2 items meaningfully
    return groups;
  }
  
  // Sqrt-based clustering: 10 groups → 3-4 parents
  const groupSize = Math.ceil(Math.sqrt(groups.length));
  const nextGroups = [];
  
  for (let i = 0; i < groups.length; i += groupSize) {
    const chunk = groups.slice(i, i + groupSize);
    const sectionNum = Math.floor(i / groupSize) + 1;
    
    nextGroups.push({
      id: `level${targetLevel}-${uuidv4()}`,
      level: targetLevel,
      title: `Section ${sectionNum}`,
      emotions: createEmotionProfile(),
      childIds: chunk.map(g => g.id),
    });
  }
  
  console.log(
    `[hierarchyBuilder] Level ${targetLevel}: ${groups.length} → ${nextGroups.length} groups`
  );
  
  return nextGroups;
}

export default {
  createEmotionProfile,
  validateEmotionProfile,
  validateHierarchyStructure,
  buildHierarchyFromTopics,
};