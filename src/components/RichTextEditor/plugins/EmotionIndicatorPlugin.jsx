/**
 * Displays emotion/intensity from hierarchy metadata
 * Read-only - emotions are controlled by the hierarchy, not the editor
 * Shows which sentences have assigned emotions
 */

import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';

const EMOTION_COLORS = {
  neutral: '#e5e7eb',
  positive: '#6ee7b7',
  negative: '#f87171',
  uncertain: '#fbbf24',
  emphasis: '#a78bfa',
};

export function EmotionIndicatorPlugin({ sentences }) {
  const [editor] = useLexicalComposerContext();
  const [emotionMap, setEmotionMap] = useState(new Map());

  useEffect(() => {
    if (!sentences || sentences.length === 0) return;

    // Build a map of sentence content → emotion
    const map = new Map();
    sentences.forEach((sentence) => {
      if (sentence.emotion) {
        map.set(sentence.content, {
          emotion: sentence.emotion,
          intensity: sentence.intensity || 0,
        });
      }
    });

    setEmotionMap(map);

    // Optionally: Add visual indicators to text nodes with emotions
    editor.update(() => {
      const root = $getRoot();
      const children = root.getChildren();

      children.forEach((paragraph) => {
        const text = paragraph.getTextContent();
        if (map.has(text)) {
          const { emotion, intensity } = map.get(text);
          // Store metadata on paragraph (don't modify structure)
          paragraph.__emotionMarker = emotion;
          paragraph.__intensityMarker = intensity;
        }
      });
    });
  }, [sentences, editor]);

  return null; // Pure metadata tracking, no visual render
}