import React from 'react';
import { createPortal } from 'react-dom';
import { EmotionSelector } from './EmotionSelector';

export function EmotionSelectorPortal(props) {
  const container =
    document.getElementById('graph-pane') || document.body; // fallback

  return createPortal(<EmotionSelector {...props} />, container);
}