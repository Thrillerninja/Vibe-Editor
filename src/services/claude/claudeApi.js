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

/**
 * Rewrite a sentence to match a specific emotion and intensity
 * @param {string} sentence - Original sentence to rewrite
 * @param {string} emotion - Target emotion (from EMOTIONS constant)
 * @param {number} intensity - Emotional intensity (0-99)
 * @returns {Promise<string>} Rewritten sentence
 */
export async function rewriteSentenceWithEmotion(sentence, emotion, intensity) {
    const client = getClient();
    
    console.log(`[Claude Service] Rewriting sentence with emotion: ${emotion}, intensity: ${intensity}`);
    
    // Map intensity to descriptive words
    let intensityDescription;
    if (intensity < 25) {
        intensityDescription = "very subtle and mild";
    } else if (intensity < 50) {
        intensityDescription = "moderate";
    } else if (intensity < 75) {
        intensityDescription = "strong and noticeable";
    } else {
        intensityDescription = "very intense and powerful";
    }

    const prompt = `Please rewrite the following sentence to convey a ${emotion} emotion with ${intensityDescription} intensity (${intensity}/99).
Hard Constraints:
- Keep the original meaning and information intact.
- Adjust tone, word choice, and phrasing to match the ${emotion} emotion.
- The emotional intensity should be ${intensityDescription} (${intensity}/99).
- Return only the rewritten sentence, no explanations.
- Keep the length very similar to the original sentence.
- NEVER GO MORE THAN 10% LONGER OR SHORTER THAN THE ORIGINAL SENTENCE.

Original sentence: "${sentence}"`;

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const rewrittenSentence = stripOuterQuotes(message.content[0].text.trim());
        console.log('[Claude Service] Sentence rewritten successfully', rewrittenSentence);
        
        return rewrittenSentence;
    } catch (error) {
        console.error('[Claude Service] Error rewriting sentence:', error);
        throw new Error(`Failed to rewrite sentence: ${error.message}`);
    }
}
function stripOuterQuotes(str) {
  return str.replace(/^(['"])(.*)\1$/, "$2");
}

/**
 * Rewrite a sentence and return multiple options
 * @param {string} sentence - Original sentence
 * @param {string} emotion - Target emotion
 * @param {number} intensity - Emotional intensity (0-99)
 * @param {number} numOptions - Number of options to return (default 3)
 * @returns {Promise<string[]>} Array of rewritten sentence options
 */
export async function rewriteSentenceWithEmotionOptions(sentence, emotion, intensity, numOptions = 3) {
    const client = getClient();

    console.log(`[Claude Service] Rewriting sentence with emotion (multi): ${emotion}, intensity: ${intensity}, options: ${numOptions}`);

    let intensityDescription;
    if (intensity < 25) {
        intensityDescription = "very subtle and mild";
    } else if (intensity < 50) {
        intensityDescription = "moderate";
    } else if (intensity < 75) {
        intensityDescription = "strong and noticeable";
    } else {
        intensityDescription = "very intense and powerful";
    }

    const prompt = `Please rewrite the following sentence to convey a ${emotion} emotion with ${intensityDescription} intensity (${intensity}/99).
Return exactly ${numOptions} distinct options that each meet all constraints.
Hard Constraints:
- Keep the original meaning and information intact.
- Adjust tone, word choice, and phrasing to match the ${emotion} emotion.
- The emotional intensity should be ${intensityDescription} (${intensity}/99).
- Return ONLY a JSON array of exactly ${numOptions} strings, no explanations.
- Keep the length very similar to the original sentence.
- NEVER GO MORE THAN 10% LONGER OR SHORTER THAN THE ORIGINAL SENTENCE.

Original sentence: "${sentence}"`;

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const raw = message.content[0].text.trim();
        let options;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                options = parsed.map(o => stripOuterQuotes(String(o).trim())).filter(Boolean);
            } else {
                options = [stripOuterQuotes(String(parsed).trim())];
            }
        } catch (e) {
            console.warn('[Claude Service] JSON parse failed for multi rewrite, falling back to heuristics');
            // Fallback: try to split by newlines or bullet points
            const candidates = raw
                .split(/\n+/)
                .map(l => l.replace(/^[-*\d)\.\s]+/, '').trim())
                .filter(Boolean);
            options = candidates.slice(0, numOptions).map(stripOuterQuotes);
            if (options.length === 0) {
                options = [stripOuterQuotes(raw)];
            }
        }

        // Ensure we return exactly numOptions by padding or trimming
        if (options.length < numOptions) {
            const last = options[options.length - 1] || sentence;
            while (options.length < numOptions) options.push(last);
        } else if (options.length > numOptions) {
            options = options.slice(0, numOptions);
        }

        console.log('[Claude Service] Multi rewrite options ready:', options);
        return options;
    } catch (error) {
        console.error('[Claude Service] Error rewriting sentence (multi):', error);
        throw new Error(`Failed to rewrite sentence (multi): ${error.message}`);
    }
}