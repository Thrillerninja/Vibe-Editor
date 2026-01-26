/**
 * @fileoverview Integration tests for hierarchy generation pipeline
 * 
 * Tests the complete flow:
 * 1. Topic boundary detection
 * 2. Hierarchy building
 * 3. Emotion evaluation
 * 4. NodeMap application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EMOTION_AXES } from '@utils/constants';

// Import modules under test
import {
  validateEmotionProfile,
  validateHierarchyStructure,
  buildHierarchyFromTopics,
  createEmotionProfile,
} from '../src/services/claude/hierarchyBuilder';
import {
  validateBoundaryResult,
  boundariesToTopics,
} from '../src/services/claude/claudeTopicDetection';
import {
  evaluateSentenceEmotions,
} from '../src/services/claude/emotionEvaluator';
import {
  nodeMapToSentenceFormat,
  applyClaudeRestructureToNodeMap,
  applyEmotionsToNodeMap,
} from '../src/services/nodeToSentenceAdapter';
import {
  createContentNode,
  createGroupNode,
  createRootNode,
  isGroupNode,
  isContentNode,
  cloneNode,
} from '../src/types/node';

// ============================================================================
// TEST DATA
// ============================================================================

const createTestSentences = () => [
  { id: 's1', content: 'Dogs are loyal companions.' },
  { id: 's2', content: 'They require regular care.' },
  { id: 's3', content: 'Cats are independent animals.' },
  { id: 's4', content: 'They are aloof and mysterious.' },
  { id: 's5', content: 'Birds can fly high in the sky.' },
  { id: 's6', content: 'They sing beautiful songs.' },
];

const createTestNodeMap = () => {
  const map = new Map();
  
  // Root
  const root = createRootNode('root', 'Document');
  map.set('root', root);
  
  // Content nodes
  for (let i = 1; i <= 6; i++) {
    const node = createContentNode(
      `s${i}`,
      'sentence',
      `Sentence ${i}`,
      'root',
      4
    );
    map.set(`s${i}`, node);
  }
  
  return map;
};

// ============================================================================
// EMOTION PROFILE TESTS
// ============================================================================

describe('Emotion Profile Management', () => {
  
  it('should create emotion profile with all 10 DES axes', () => {
    const profile = createEmotionProfile();
    
    // Check all axes present
    for (const axis of EMOTION_AXES) {
      expect(profile).toHaveProperty(axis);
      expect(typeof profile[axis]).toBe('number');
      expect(profile[axis]).toBeGreaterThanOrEqual(0);
      expect(profile[axis]).toBeLessThanOrEqual(100);
    }
  });

  it('should create profile with overrides', () => {
    const profile = createEmotionProfile({
      joy: 80,
      sadness: 20,
    });
    
    expect(profile.joy).toBe(80);
    expect(profile.sadness).toBe(20);
    // Others should be defaults
    expect(profile.interest).toBe(50);
  });

  it('should validate complete emotion profile', () => {
    const validProfile = createEmotionProfile();
    expect(() => validateEmotionProfile(validProfile)).not.toThrow();
  });

  it('should reject profile missing axes', () => {
    const invalidProfile = {
      interest: 50,
      joy: 50,
      // Missing others
    };
    
    expect(() => validateEmotionProfile(invalidProfile)).toThrow(/missing axes/i);
  });

  it('should reject profile with out-of-range values', () => {
    const invalidProfile = createEmotionProfile();
    invalidProfile.interest = 150; // Out of range
    
    expect(() => validateEmotionProfile(invalidProfile)).toThrow(/out of range/i);
  });
});

// ============================================================================
// HIERARCHY STRUCTURE TESTS
// ============================================================================

describe('Hierarchy Structure Building', () => {
  
  it('should build hierarchy from topics', () => {
    const sentences = createTestSentences();
    
    const topics = [
      {
        id: 'topic-0',
        name: 'Dogs',
        sentenceIndices: [0, 1],
      },
      {
        id: 'topic-1',
        name: 'Cats',
        sentenceIndices: [2, 3],
      },
      {
        id: 'topic-2',
        name: 'Birds',
        sentenceIndices: [4, 5],
      },
    ];
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 4);
    
    // Should create level 2 nodes (one per topic)
    const level2 = nodes.filter(n => n.level === 2);
    expect(level2).toHaveLength(3);
    
    // Should have emotions
    for (const node of nodes) {
      expect(() => validateEmotionProfile(node.emotions)).not.toThrow();
    }
  });

  it('should validate hierarchy structure', () => {
    const sentences = createTestSentences();
    const topics = [
      { id: 'topic-0', name: 'Dogs', sentenceIndices: [0, 1] },
      { id: 'topic-1', name: 'Cats', sentenceIndices: [2, 3, 4, 5] },
    ];
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 4);
    const sentenceIds = sentences.map(s => s.id);
    
    // Should not throw
    expect(() => {
      validateHierarchyStructure(nodes, 4, sentenceIds);
    }).not.toThrow();
  });

  it('should create all levels from 2 to maxLevel', () => {
    const sentences = createTestSentences();
    const topics = boundariesToTopics([2, 4], sentences);
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 5);
    
    const levels = new Set(nodes.map(n => n.level));
    expect(levels.has(2)).toBe(true); // Level 2 always created
    expect(levels.has(3)).toBe(true); // Level 3 created for grouping
    expect(levels.has(4)).toBe(true); // Level 4 created if needed
  });

  it('should reject hierarchy with missing levels', () => {
    const sentences = createTestSentences();
    const topics = boundariesToTopics([2], sentences);
    
    // Create incomplete hierarchy manually
    const incompleteNodes = [
      {
        id: 'g1',
        level: 2, // Only level 2, missing level 3
        title: 'Group',
        emotions: createEmotionProfile(),
        childIds: sentences.map(s => s.id),
      },
    ];
    
    expect(() => {
      validateHierarchyStructure(incompleteNodes, 4, sentences.map(s => s.id));
    }).toThrow(/missing levels/i);
  });
});

// ============================================================================
// BOUNDARY DETECTION TESTS
// ============================================================================

describe('Topic Boundary Detection', () => {
  
  it('should validate boundary result', () => {
    const validResult = { boundaryIndices: [2, 5] };
    expect(() => validateBoundaryResult(validResult, 10)).not.toThrow();
  });

  it('should reject boundary indices out of range', () => {
    const invalidResult = { boundaryIndices: [0, 10] }; // 0 and 10 are invalid for 10 sentences
    expect(() => validateBoundaryResult(invalidResult, 10)).toThrow(/out of range/i);
  });

  it('should reject unsorted boundaries', () => {
    const invalidResult = { boundaryIndices: [5, 2] };
    expect(() => validateBoundaryResult(invalidResult, 10)).toThrow(/not sorted/i);
  });

  it('should convert boundaries to topics', () => {
    const sentences = createTestSentences();
    const topics = boundariesToTopics([2, 4], sentences);
    
    expect(topics).toHaveLength(3); // 3 topics
    expect(topics[0].sentenceIndices).toEqual([0, 1]);
    expect(topics[1].sentenceIndices).toEqual([2, 3]);
    expect(topics[2].sentenceIndices).toEqual([4, 5]);
  });
});

// ============================================================================
// NODEEMAP ADAPTER TESTS
// ============================================================================

describe('NodeMap Adapter', () => {
  
  it('should convert nodeMap to sentence format', () => {
    // FIXED: Create proper hierarchy
    const nodeMap = new Map();
    
    // Root
    const root = createRootNode('root', 'Document');
    
    // Group
    const group = createGroupNode('g1', 'Group 1', 1, 'root', []);
    
    // Content nodes
    const contentIds = [];
    for (let i = 1; i <= 6; i++) {
      const node = createContentNode(
        `s${i}`,
        'sentence',
        `Sentence ${i}`,
        'g1',  // ← ATTACH TO GROUP, NOT ROOT
        4
      );
      nodeMap.set(`s${i}`, node);
      contentIds.push(`s${i}`);
    }
    
    // Update group to point to content
    group.hierarchy.childIds = contentIds;
    
    // Update root to point to group
    root.hierarchy.childIds = ['g1'];
    
    // Add all to map
    nodeMap.set('root', root);
    nodeMap.set('g1', group);
    
    // NOW convert
    const sentences = nodeMapToSentenceFormat(nodeMap, 'root', 4);
    
    expect(Array.isArray(sentences)).toBe(true);
    expect(sentences.length).toBe(6);
    expect(sentences[0]).toHaveProperty('id');
    expect(sentences[0]).toHaveProperty('content');
    expect(sentences[0]).toHaveProperty('emotions');
    expect(sentences._hierarchyMeta).toBeDefined();
  });

  it('should apply emotions to nodeMap', () => {
    const nodeMap = createTestNodeMap();
    
    const emotionData = [
      { id: 's1', emotions: createEmotionProfile({ joy: 80 }) },
      { id: 's2', emotions: createEmotionProfile({ sadness: 70 }) },
    ];
    
    const updated = applyEmotionsToNodeMap(nodeMap, emotionData);
    
    const s1 = updated.get('s1');
    expect(s1.emotion).toBeDefined();
    expect(s1.emotion.profile.joy).toBe(80);
    expect(s1.emotion.dominantEmotion).toBe('joy');
  });

  it('should apply restructuring to nodeMap', () => {
    // FIXED: Setup proper initial hierarchy
    const nodeMap = new Map();
    
    // Root
    const root = createRootNode('root', 'Document');
    
    // Old group (to be replaced)
    const oldGroup = createGroupNode('old-g1', 'Old Group', 1, 'root', ['s1', 's2', 's3', 's4', 's5', 's6']);
    
    // Content nodes
    for (let i = 1; i <= 6; i++) {
      const node = createContentNode(
        `s${i}`,
        'sentence',
        `Sentence ${i}`,
        'old-g1',
        4
      );
      nodeMap.set(`s${i}`, node);
    }
    
    root.hierarchy.childIds = ['old-g1'];
    nodeMap.set('root', root);
    nodeMap.set('old-g1', oldGroup);
    
    // New structure
    const newNodes = [
      {
        id: 'g1',
        level: 2,
        title: 'Group 1',
        emotions: createEmotionProfile(),
        childIds: ['s1', 's2'],
      },
      {
        id: 'g2',
        level: 2,
        title: 'Group 2',
        emotions: createEmotionProfile(),
        childIds: ['s3', 's4', 's5', 's6'],
      },
      {
        id: 'g3',
        level: 3,
        title: 'Top Group',
        emotions: createEmotionProfile(),
        childIds: ['g1', 'g2'],
      },
    ];
    
    const updated = applyClaudeRestructureToNodeMap(
      nodeMap,
      'root',
      [{ rootNodeId: 'root', newNodes }],
      null,
      null,
      4
    );
    
    // New groups should exist
    expect(updated.get('g1')).toBeDefined();
    expect(updated.get('g2')).toBeDefined();
    expect(updated.get('g3')).toBeDefined();
    
    // Old group should be gone
    expect(updated.get('old-g1')).toBeUndefined();
    
    // Root should point to top-level group
    const rootUpdated = updated.get('root');
    expect(rootUpdated.hierarchy.childIds).toContain('g3');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Full Pipeline Integration', () => {
  
  it('should complete full hierarchy generation', async () => {
    const sentences = createTestSentences();
    
    // Step 1: Create topics
    const boundaries = [2, 4];
    const topics = boundariesToTopics(boundaries, sentences);
    
    // Step 2: Build hierarchy
    const nodes = buildHierarchyFromTopics(topics, sentences, 4);
    
    // Validate structure
    const sentenceIds = sentences.map(s => s.id);
    validateHierarchyStructure(nodes, 4, sentenceIds);
    
    // Check each node has valid emotions
    for (const node of nodes) {
      validateEmotionProfile(node.emotions);
    }
    
    console.log('✓ Full pipeline completed successfully');
  });

  it('should handle document with single topic', () => {
    const sentences = createTestSentences();
    
    // All sentences in one topic (no boundaries)
    const topics = boundariesToTopics([], sentences);
    
    expect(topics).toHaveLength(1);
    expect(topics[0].sentenceIndices).toHaveLength(6);
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 4);
    expect(nodes.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Edge Cases', () => {
  
  it('should handle single sentence', () => {
    const sentences = [{ id: 's1', content: 'Hello world' }];
    const topics = boundariesToTopics([], sentences);
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 3);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('should handle many sentences', () => {
    const sentences = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      content: `Sentence ${i}`,
    }));
    
    // Create some boundaries
    const boundaries = [25, 50, 75];
    const topics = boundariesToTopics(boundaries, sentences);
    
    expect(topics).toHaveLength(4);
    
    const nodes = buildHierarchyFromTopics(topics, sentences, 5);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('should handle emotion profile with extreme values', () => {
    const profile = createEmotionProfile({
      interest: 100,
      sadness: 0,
      joy: 99,
    });
    
    expect(() => validateEmotionProfile(profile)).not.toThrow();
  });
});