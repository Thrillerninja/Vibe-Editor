/**
 * Utility for recommending tree depth based on sentence count
 */

/**
 * Thresholds for depth recommendations based on sentence count
 * These are tuned to provide optimal hierarchy for different text sizes:
 * - Short texts (≤ 10 sentences): 3 levels sufficient
 * - Medium texts (11-30 sentences): 4 levels for better organization
 * - Long texts (31-60 sentences): 5 levels for detailed structure
 * - Very long texts (> 60 sentences): 6 levels for maximum granularity
 */
const DEPTH_THRESHOLDS = [
    { maxSentences: 10, recommendedDepth: 3 },
    { maxSentences: 30, recommendedDepth: 4 },
    { maxSentences: 60, recommendedDepth: 5 },
    { maxSentences: Infinity, recommendedDepth: 6 },
];

/**
 * Get recommended depth based on sentence count
 * @param {number} sentenceCount - The number of sentences
 * @returns {number} Recommended depth (3-6)
 */
export function getRecommendedDepth(sentenceCount) {
    for (const threshold of DEPTH_THRESHOLDS) {
        if (sentenceCount <= threshold.maxSentences) {
            return threshold.recommendedDepth;
        }
    }

    return 6; // Fallback to max depth
}

/**
 * Check if a depth recommendation should be shown
 * @param {number} sentenceCount - The number of sentences
 * @param {number} currentDepth - The current depth setting
 * @param {number|null} lastRecommendedDepth - The last recommended depth (to avoid duplicate notifications)
 * @returns {{ shouldShow: boolean, recommendedDepth: number }} Recommendation info
 */
export function shouldShowRecommendation(sentenceCount, currentDepth, lastRecommendedDepth) {
    // Don't show recommendation if there are no sentences
    if (sentenceCount === 0) {
        return { shouldShow: false, recommendedDepth: currentDepth };
    }

    const recommendedDepth = getRecommendedDepth(sentenceCount);

    // Only show if:
    // 1. Recommended depth is different from current depth
    // 2. We haven't already recommended this depth (to avoid repeated notifications)
    const shouldShow =
        recommendedDepth !== currentDepth &&
        recommendedDepth !== lastRecommendedDepth;

    return { shouldShow, recommendedDepth };
}

/**
 * Get a description of the recommended depth level
 * @param {number} depth - The depth level
 * @returns {string} Description of what this depth provides
 */
export function getDepthDescription(depth) {
    const descriptions = {
        3: "Root → Topic Groups → Sentences",
        4: "Root → Main Topics → Subtopics → Sentences",
        5: "Root → Themes → Topics → Subtopics → Sentences",
        6: "Root → Parts → Themes → Topics → Subtopics → Sentences",
    };

    return descriptions[depth] || "";
}