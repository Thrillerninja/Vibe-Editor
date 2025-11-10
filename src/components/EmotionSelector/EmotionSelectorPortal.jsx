// Create: src/components/EmotionSelector/EmotionSelectorPortal.jsx
import React from 'react';
import { createPortal } from 'react-dom';
import { EmotionSelector } from './EmotionSelector';

export function EmotionSelectorPortal(props) {
  return createPortal(
    <EmotionSelector {...props} />,
    document.body
  );
}