/**
 * Claude API Service
 * Main entry point for Claude API interactions
 */

import Anthropic from '@anthropic-ai/sdk';
import { findDirtyRootNodes, buildDirtySubtrees } from './dirtyNodeFinder.js';
import { buildDirtyRestructurePrompt } from './promptBuilder.js';
import { parseDirtyRestructureResponse } from './responseValidator.js';
import { EMOTIONS } from '../../utils/constants.js';
import { a } from 'framer-motion/client';

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
    console.log('[Claude Service] Dirty root node IDs:', dirtyRootNodes.map(n => n.id).join(', '));

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


export async function evaluateSentenceEmotions(sentences) {

    const client = getClient();
    
    console.log('[Claude Service] Evaluating emotions for sentences');
    const prompt = `For each of the following input sentences i give you, please assign an Emotion and Intensity level from 0 to 100 based on the emotional tone of the sentence.
    For the emotions YOU MUST ONLY choose one out of this list: ${JSON.stringify(EMOTIONS)}.
    Respond in JSON format as an array of objects with "id", "emotion", and "intensity" fields. Only respond in plain json format.
    Sentences:
    ${sentences.map(s => `- (${s.id}) ${s.content}`).join('\n')}
    `;
    console.log('[Claude Service] Emotion evaluation prompt constructed', prompt);
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
        console.log('[Claude Service] Received emotion evaluation:', responseText);

        // Parse the JSON response
        const emotionData = JSON.parse(responseText);
        console.log('[Claude Service] Parsed emotion data:', emotionData);

        return applyEmotionsToSentences(sentences, emotionData); // Array of { id, emotion, intensity }
    } catch (error) {
        console.error('[Claude Service] Error evaluating sentence emotions:', error);
        console.error('[Claude Service] Error stack:', error.stack);
        throw new Error(`Failed to evaluate sentence emotions: ${error.message}`);
    }
}


function applyEmotionsToSentences(sentences, emotionData) {
    const hierarchy = sentences._hierarchyMeta;
    const emotionMap = new Map();
    for (const item of emotionData) {
        emotionMap.set(item.id, { emotion: item.emotion, intensity: item.intensity });
    }

    const newSentences = sentences.map(s => {
        if (emotionMap.has(s.id)) {
            const { emotion, intensity } = emotionMap.get(s.id);
            return { ...s, emotion, intensity };
        }
        return s;
    });
    newSentences._hierarchyMeta = hierarchy; // Preserve hierarchy meta
    return newSentences;
}