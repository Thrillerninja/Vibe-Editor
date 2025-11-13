/**
 * Claude API Service
 * Main entry point for Claude API interactions
 */

import Anthropic from '@anthropic-ai/sdk';
import { findDirtyRootNodes, buildDirtySubtrees } from './dirtyNodeFinder.js';
import { buildDirtyRestructurePrompt } from './promptBuilder.js';
import { parseDirtyRestructureResponse } from './responseValidator.js';

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
 * Restructure dirty portions of the hierarchy
 * Allows Claude to add/remove/reorganize nodes for dirty sentences
 * @param {Array} sentences - Array of sentence objects
 * @param {Object} hierarchyMeta - Existing hierarchy metadata
 * @param {Array} dirtyNodeIds - IDs of nodes affected by changes
 * @param {Array} dirtySentenceIds - IDs of sentences that were modified
 * @param {number} maxDepth - Maximum depth of hierarchy
 * @returns {Promise<Object>} Updated hierarchy structure
 */
export async function updateDirtyNodes(sentences, hierarchyMeta, dirtyNodeIds, dirtySentenceIds, maxDepth) {
    const client = getClient();

    console.log('[Claude Service] Restructuring dirty portions of hierarchy');
    console.log('[Claude Service] Dirty nodes:', dirtyNodeIds.length);
    console.log('[Claude Service] Dirty sentences:', dirtySentenceIds.length);

    // Check if root node is dirty
    const isRootDirty = dirtyNodeIds.includes('root');
    if (isRootDirty) {
        console.log('[Claude Service] Root node is dirty - will regenerate document title');
    }

    // Find the highest-level dirty nodes (roots of dirty subtrees)
    const dirtyRootNodes = findDirtyRootNodes(dirtyNodeIds, hierarchyMeta);

    console.log('[Claude Service] Dirty root nodes to restructure:', dirtyRootNodes.length);

    // Build subtree information for each dirty root
    const dirtySubtrees = buildDirtySubtrees(dirtyRootNodes, hierarchyMeta, sentences, dirtySentenceIds);

    // Build the prompt
    const prompt = buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty);

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = message.content[0].text;
        console.log('[Claude Service] Received dirty subtree restructure:', responseText);

        // Parse and validate the response
        const { restructuredSubtrees, newRootTitle } = parseDirtyRestructureResponse(responseText, maxDepth, dirtySubtrees, isRootDirty);

        console.log('[Claude Service] Parsed response - subtrees:', restructuredSubtrees?.length, 'newRootTitle:', newRootTitle);

        return {
            dirtyRootNodes: dirtyRootNodes.map(n => n.id),
            restructuredSubtrees,
            newRootTitle
        };
    } catch (error) {
        console.error('[Claude Service] Error restructuring dirty nodes:', error);
        console.error('[Claude Service] Error stack:', error.stack);
        throw new Error(`Failed to restructure dirty nodes: ${error.message}`);
    }
}
