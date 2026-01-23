/**
 * Deterministic hierarchy building from topics
 * System algorithm - no Claude needed
 */

export function buildHierarchyFromTopics(topics, sentences, maxDepth) {
  console.log(`[Hierarchy] Building from ${topics.length} topics, maxDepth=${maxDepth}`);

  const nodes = [];

  // Level 2: Create one group per topic
  const level2Nodes = topics.map((topic) => ({
    id: `group-l2-${topic.id}`,
    level: 2,
    title: topic.name,
    emotions: createDefaultEmotions(),
    childIds: topic.sentenceIndices.map(i => sentences[i].id), // Sentence IDs
  }));

  nodes.push(...level2Nodes);

  // Level 3+: Recursively group by hierarchical clustering
  let currentLevel = 3;
  let currentGroups = level2Nodes;

  while (currentLevel <= maxDepth - 1) {
    const nextGroups = createNextLevel(currentGroups, currentLevel);

    if (nextGroups.length === currentGroups.length) {
      // No more grouping possible
      break;
    }

    nodes.push(...nextGroups);
    currentGroups = nextGroups;
    currentLevel++;
  }

  // Top level: single root group if needed
  if (currentGroups.length > 1 && currentLevel <= maxDepth - 1) {
    const topGroup = {
      id: `group-l${currentLevel}-top`,
      level: currentLevel,
      title: 'All Topics',
      emotions: createDefaultEmotions(),
      childIds: currentGroups.map(g => g.id),
    };
    nodes.push(topGroup);
  }

  console.log(`[Hierarchy] Created ${nodes.length} group nodes`);
  return nodes;
}

function createNextLevel(groups, level) {
  if (groups.length <= 2) {
    // Can't group further meaningfully
    return groups;
  }

  // Simple clustering: group adjacent items
  // For 10 groups → 3-4 parent groups
  const groupSize = Math.ceil(Math.sqrt(groups.length));
  const nextGroups = [];

  for (let i = 0; i < groups.length; i += groupSize) {
    const chunk = groups.slice(i, i + groupSize);
    const parentId = `group-l${level}-${i}`;

    nextGroups.push({
      id: parentId,
      level,
      title: `Section ${Math.floor(i / groupSize) + 1}`,
      emotions: createDefaultEmotions(),
      childIds: chunk.map(g => g.id),
    });
  }

  return nextGroups;
}

function createDefaultEmotions() {
  return {
    interest: 50,
    joy: 50,
    surprise: 30,
    sadness: 20,
    anger: 10,
    disgust: 10,
    contempt: 5,
    fear: 15,
    shame: 10,
    guilt: 10,
  };
}