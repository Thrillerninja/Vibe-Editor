/**
 * Claude API Service
 * Handles API calls to Claude for generating hierarchical document structures
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialize the Anthropic client
const getClient = () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;

    if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error(
            'Claude API key not configured. Please set VITE_CLAUDE_API_KEY in your .env file.\n' +
            'Get your API key from https://console.anthropic.com/'
        );
    }

    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
    });
};

/**
 * Generate hierarchical structure for document
 * @param {Array} sentences - Array of sentence objects with {id, content, ...}
 * @param {number} maxDepth - Maximum depth of hierarchy (3-6)
 * @returns {Promise<Object>} Hierarchical structure with nodes and relationships
 */
export async function generateHierarchy(sentences, maxDepth) {
    const client = getClient();

    // Prepare sentence data for Claude
    const sentencesData = sentences.map((s, idx) => ({
        id: s.id,
        index: idx,
        content: s.content
    }));

    const prompt = buildHierarchyPrompt(sentencesData, maxDepth);

    console.log('[Claude Service] Sending request to Claude...');
    console.log('[Claude Service] Max depth:', maxDepth);
    console.log('[Claude Service] Sentences:', sentencesData.length);

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        console.log('[Claude Service] Received response from Claude');

        // Extract the JSON response
        const responseText = message.content[0].text;
        console.log('[Claude Service] Response:', responseText);

        // Parse the JSON response
        const sentenceIds = sentencesData.map(s => s.id);
        const hierarchy = parseClaudeResponse(responseText, maxDepth, sentenceIds);

        console.log('[Claude Service] Parsed hierarchy:', hierarchy);

        return hierarchy;
    } catch (error) {
        console.error('[Claude Service] Error:', error);
        throw new Error(`Failed to generate hierarchy: ${error.message}`);
    }
}

/**
 * Build the prompt for Claude to generate hierarchy
 */
function buildHierarchyPrompt(sentences, maxDepth) {
    // Send full sentence content for proper analysis
    // Claude will only return IDs in the response to reduce output token cost
    const sentencesWithContent = sentences.map(s => ({
        id: s.id,
        content: s.content
    }));

    return `You are organizing a document into a ${maxDepth}-level hierarchy.

**Sentences (analyze the full content to create meaningful groupings):**
${JSON.stringify(sentencesWithContent, null, 2)}

**Hierarchy Rules:**
1. EXACTLY ${maxDepth} levels total (Level 1 through Level ${maxDepth})
2. Level 1 (bottom): Individual sentences (the IDs provided above)
3. Level 2: Groups of sentences (paragraphs, related topics)
4. Levels 3-${maxDepth - 1}: Progressive groupings of lower levels
5. Level ${maxDepth} (top/root): Single document title

**Critical Requirements:**
- Sentences MUST be at Level 1 (lowest level)
- Every sentence ID must appear in exactly ONE Level 2 node's childIds
- Every Level 2+ node must have a descriptive title
- Each level groups nodes from the level below
- **IMPORTANT: Return ONLY sentence IDs in childIds, NOT the sentence content**

**JSON Output Format (no markdown, no explanations, IDs only in childIds):**
{
  "rootTitle": "Document title (Level ${maxDepth})",
  "nodes": [
    {
      "id": "node-1",
      "level": 2,
      "title": "First paragraph topic",
      "childIds": ["sentence-0", "sentence-1"]
    },
    {
      "id": "node-2",
      "level": 2,
      "title": "Second paragraph topic",
      "childIds": ["sentence-2"]
    },
    {
      "id": "node-3",
      "level": 3,
      "title": "Higher level grouping",
      "childIds": ["node-1", "node-2"]
    }
  ]
}

**Example for maxDepth=${maxDepth}:**
- Level 1: sentence-0, sentence-1, sentence-2, ... (all provided sentences)
- Level 2: node-1 (contains some sentence IDs), node-2 (contains other sentence IDs), ...
- Level 3: node-X (contains Level 2 node IDs), ...
- Level ${maxDepth}: rootTitle (contains top-level node IDs from Level ${maxDepth - 1})

Return valid JSON only.`;
}

/**
 * Parse Claude's response and validate the structure
 */
function parseClaudeResponse(responseText, maxDepth, sentenceIds) {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }

    try {
        const parsed = JSON.parse(jsonText);

        // Validate structure
        if (!parsed.rootTitle || !Array.isArray(parsed.nodes)) {
            throw new Error('Invalid response structure: missing rootTitle or nodes array');
        }

        // Validate nodes
        for (const node of parsed.nodes) {
            if (!node.id || !node.level || !node.title || !Array.isArray(node.childIds)) {
                throw new Error(`Invalid node structure: ${JSON.stringify(node)}`);
            }

            // Validate level range (2 to maxDepth-1, since level 1 is sentences and maxDepth is root)
            if (node.level < 2 || node.level > maxDepth) {
                throw new Error(`Invalid level ${node.level} for node ${node.id}. Must be between 2 and ${maxDepth}`);
            }
        }

        // Validate that all sentences are referenced at level 2
        const allSentenceIds = new Set(sentenceIds);
        const referencedSentenceIds = new Set();

        // Collect all sentence IDs from level 2 nodes
        const level2Nodes = parsed.nodes.filter(n => n.level === 2);
        for (const node of level2Nodes) {
            for (const childId of node.childIds) {
                if (childId.startsWith('sentence-')) {
                    referencedSentenceIds.add(childId);
                }
            }
        }

        // Check if all sentences are referenced
        const missingSentences = [...allSentenceIds].filter(id => !referencedSentenceIds.has(id));
        if (missingSentences.length > 0) {
            console.warn('[Claude Service] Warning: Some sentences not referenced:', missingSentences);
        }

        // Check if any sentence is referenced multiple times
        const sentenceRefCounts = new Map();
        for (const node of level2Nodes) {
            for (const childId of node.childIds) {
                if (childId.startsWith('sentence-')) {
                    sentenceRefCounts.set(childId, (sentenceRefCounts.get(childId) || 0) + 1);
                }
            }
        }

        const duplicateSentences = [...sentenceRefCounts.entries()]
            .filter(([id, count]) => count > 1)
            .map(([id]) => id);

        if (duplicateSentences.length > 0) {
            throw new Error(`Sentences referenced multiple times: ${duplicateSentences.join(', ')}`);
        }

        return parsed;
    } catch (error) {
        console.error('[Claude Service] Failed to parse response:', responseText);
        throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
}
