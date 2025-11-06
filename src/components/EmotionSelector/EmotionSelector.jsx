/**
 * Single-file EmotionSelector – wide, vertically stacked, beautified with CSS
 * - One file only (component + styles)
 * - Titles for dialog, palette, text, actions
 * - Emotion coloring via CSS variables on the modal root
 * - Native resizable textarea with visually hidden scrollbars
 * - Keyboard: Esc to close, Ctrl/Cmd+Enter to submit
 * - API: { data: { isOpen, onClose, onSelect, id, startIdx, emotion, label } }
 */

import React, { useEffect, useRef, useState } from "react";
import { EMOTIONS, EMOTION_LABELS, EMOTION_COLORS } from "../../utils/constants";

const ES_STYLES = `
/* Backdrop */
.es-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  z-index: 9998;
  animation: es-fade-in 160ms ease-out;
}

/* Modal shell */
.es-modal {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: min(95vw, 800px);
  height: 800px; /* wide, short rectangle */
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;

  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(15, 23, 42, 0.06);

  z-index: 9999;
  padding: 16px;

  /* Theme variables with fallbacks */
  --tone-50: #eef2ff;
  --tone-200: #c7d2fe;
  --tone-600: #4338ca;

  animation: es-pop 180ms cubic-bezier(.2,.8,.2,1);
}

/* Header */
.es-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}
.es-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.1px;
}
.es-subtitle {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

/* Section scaffold */
.es-section { display: flex; flex-direction: column; gap: 10px; }
.es-section-title {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #64748b;
}

/* Palette */
.es-palette {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 4px 2px;
  scrollbar-width: none;           /* Firefox */
}
.es-palette::-webkit-scrollbar { display: none; }  /* WebKit */

.es-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1.5px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease, background 120ms ease;
  white-space: nowrap;
}
.es-chip:hover {
  border-color: var(--chip-600, #334155);
  box-shadow: 0 1px 0 rgba(0,0,0,0.03), 0 0 0 4px var(--chip-50, #f1f5f9);
  background: var(--chip-50, #ffffff);
}
.es-chip:active { transform: translateY(1px); }

.es-chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--chip-600, #334155);
  box-shadow: inset 0 0 0 2px #ffffff;
}

.es-chip.is-selected {
  border-color: var(--chip-600, #334155);
  background: var(--chip-50, #f1f5f9);
  color: var(--chip-600, #111827);
}

/* Growable middle section */
.es-section-grow { flex: 1 1 auto; }

/* Textarea */
.es-textarea-wrap { position: relative; flex: 1 1 auto; display: flex; }

.es-textarea {
  width: 100%;
  height: 100%;
  min-height: 180px;
  flex: 1 1 auto;

  font-size: 16px;
  line-height: 1.5;
  color: #0f172a;

  border-radius: 12px;
  border: 1px solid #d0d5dd;
  background: #ffffff;

  padding: 12px 14px;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(2, 6, 23, 0.04);

  resize: vertical;
  overflow: auto;
  scrollbar-width: none;
}
.es-textarea::-webkit-scrollbar { display: none; }
.es-textarea:focus {
  border-color: var(--tone-600);
  box-shadow:
    0 0 0 4px var(--tone-50),
    inset 0 1px 2px rgba(2, 6, 23, 0.04);
}

/* Hint */
.es-hint { margin-top: 6px; font-size: 12px; color: #64748b; }

/* Actions */
.es-actions { display: flex; justify-content: flex-end; gap: 10px; }

.es-btn {
  appearance: none;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 140ms ease, background 140ms ease, filter 120ms ease;
}
.es-btn:active { transform: translateY(1px); }

.es-btn-secondary {
  background: #eef2f7;
  color: #0f172a;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
}
.es-btn-secondary:hover {
  background: #e3e9f2;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.es-btn-primary {
  background: #3B82F6;
  color: #ffffff;
  box-shadow: 0 2px 0 rgba(0,0,0,0.04);
}
.es-btn-primary:hover {
  filter: brightness(0.98);
  box-shadow: 0 8px 20px rgba(67, 56, 202, 0.25);
}

/* Animations */
@keyframes es-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes es-pop {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 6px)) scale(0.995); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* Responsive */
@media (max-width: 720px) {
  .es-modal { height: 85vh; padding: 12px; }
  .es-title { font-size: 18px; }
}
`;

function EmotionSelector({ data = {}}) {
  const {
    isOpen = false,
    onClose,
    onSelect,                 // ({ emotion, text, id, startIdx })
    id,
    startIdx,
    emotion = EMOTIONS.NEUTRAL,
    label = "",
    setText,
    setTextTree
  } = data;

  const [selectedEmotion, setSelectedEmotion] = useState(emotion);
  const [textValue, setTextValue] = useState(label);
  const textareaRef = useRef(null);


  // EmotionSelector.jsx (already present)
  const submit = () => {
    console.log("typeof setText in EmotionSelector:", typeof setTextTree, { setText, setTextTree, id, startIdx, label });
    //alert("HANDLE FUCNTION CALLED!")
    console.log(data)
    setText(textValue);
    setTextTree(textValue);
    setTextTree("Hallo")
    onSelect?.({
      emotion: selectedEmotion,
      text: textValue,   // ✅ now the latest textarea content
      id,
      startIdx
    });
    onClose?.();
  };

  // Inject styles once while open (keeps one-file constraint)
  const Styles = () => <style>{ES_STYLES}</style>;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSelectedEmotion(emotion);
      setTextValue(label);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen, emotion, label]);

  console.log("TEST0typeof setTextTree in EmotionSelector:", typeof setTextTree);

  // Block background scroll while open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Keyboard affordances
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedEmotion, textValue]);

  if (!isOpen) return null;

  // Resolve color set and expose as CSS variables
  const colors =
    EMOTION_COLORS?.[selectedEmotion] ||
    { light: "#eef2ff", medium: "#c7d2fe", strong: "#4338ca" };

  return (
    <>
      <Styles />

      <div className="es-backdrop" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="es-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          ["--tone-50"]: colors.light,
          ["--tone-200"]: colors.medium,
          ["--tone-600"]: colors.strong
        }}
      >
        {/* Dialog Title */}
        <header className="es-header">
          <h2 className="es-title">Edit Emotion & Text</h2>
          <p className="es-subtitle">Select an emotion, then refine your note.</p>
        </header>

        {/* Emotion Palette */}
        <section className="es-section">
          <h3 className="es-section-title">Emotion</h3>
          <div className="es-palette" role="listbox" aria-label="Emotion palette">
            {Object.entries(EMOTIONS).map(([_, value]) => {
              const isSelected = selectedEmotion === value;
              const paletteColors =
                EMOTION_COLORS?.[value] ||
                { light: "#f3f4f6", medium: "#e5e7eb", strong: "#9ca3af" };

              return (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`es-chip ${isSelected ? "is-selected" : ""}`}
                  title={EMOTION_LABELS[value]}
                  onClick={() => setSelectedEmotion(value)}
                  style={{
                    ["--chip-50"]: paletteColors.light,
                    ["--chip-200"]: paletteColors.medium,
                    ["--chip-600"]: paletteColors.strong
                  }}
                >
                  <span className="es-chip-dot" />
                  {EMOTION_LABELS[value]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Text Input */}
        <section className="es-section es-section-grow">
          <h3 className="es-section-title">Text</h3>
          <div className="es-textarea-wrap">
            <textarea
              ref={textareaRef}
              className="es-textarea"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}  // ✅ update the correct state
              placeholder="Type your note…"
            />
          </div>
          <div className="es-hint">Tip: Press Ctrl/⌘ + Enter to submit.</div>
        </section>

        {/* Actions */}
        <section className="es-section">
          <h3 className="es-section-title">Actions</h3>
          <div className="es-actions">
            <button
              type="button"
              className="es-btn es-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="button"
              className="es-btn es-btn-primary"
              onClick={submit}
            >
              Submit
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

export default EmotionSelector;
export { EmotionSelector };
