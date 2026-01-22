/**
 * @fileoverview AnimatedNodeComponent Renderers - JSX rendering functions
 *
 * Provides React components for rendering markdown, list items, and skeleton loaders.
 * All functions return JSX elements for visualization in the node tree.
 * 
 * @module components/TreeVisualization/animatedNodeComponentRenderers
 * 
 * @typedef {import('../../types/node').InlineElement} InlineElement
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { applyformatting, buildMarkdownFromStructure } from './animatedNodeComponentHelpers';
import { getIndentPadding, renderIndentationGuide } from './indentationRenderer';


/**
 * Render node content with full markdown support
 * Handles links, lists, code blocks, blockquotes, and all inline formatting
 *
 * @param {string} content - Content text
 * @param {string} type - Node type
 * @param {Object} [structure] - Structure metadata
 * @param {InlineElement[]} [formatting] - Inline format elements
 * @returns {React.ReactElement} Rendered markdown content
 */
export function renderNodeContent(content, type, structure, formatting) {
  // Special handling for list items with custom markers
  if (structure?.marker) {
    const markdown = applyformatting(content, formatting);
    const indentLevel = structure.indentLevel || 0;
    const indentPadding = getIndentPadding(indentLevel, 12); // 12px per level

    return (
      <div
        style={{
          width: '100%',
          lineHeight: 1.4,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5em',
          paddingLeft: indentPadding,
          position: 'relative',
        }}
      >
        {/* Indentation guide for nested lists */}
        {indentLevel > 0 && renderIndentationGuide(indentLevel, 'dots')}

        <span
          style={{
            flexShrink: 0,
            fontFamily: 'monospace',
            fontWeight: 500,
            color: '#30363f',
            fontSize: '0.95em',
          }}
        >
          {structure.marker}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <span>{children}</span>,
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    color: '#2563eb',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    wordBreak: 'break-all',
                  }}
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong style={{ fontWeight: 700 }}>{children}</strong>
              ),
              em: ({ children }) => (
                <em style={{ fontStyle: 'italic' }}>{children}</em>
              ),
              code: ({ children }) => (
                <code
                  style={{
                    backgroundColor: '#f3f4f6',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    fontSize: '0.9em',
                    fontFamily: 'monospace',
                  }}
                >
                  {children}
                </code>
              ),
            }}
            skipHtml
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // Original markdown rendering for non-list items
  const markdown = buildMarkdownFromStructure(
    content,
    structure,
    formatting
  );

  return (
    <div
      style={{
        width: '100%',
        lineHeight: 1.4,
      }}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => <span>{children}</span>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
                cursor: 'pointer',
                wordBreak: 'break-all',
              }}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700 }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic' }}>{children}</em>
          ),
          code: ({ children }) => (
            <code
              style={{
                backgroundColor: '#f3f4f6',
                padding: '2px 4px',
                borderRadius: '2px',
                fontSize: '0.9em',
                fontFamily: 'monospace',
              }}
            >
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: '1.5em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: '1.3em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: '1.1em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: '3px solid #3b82f6',
                paddingLeft: '0.8em',
                margin: '0.3em 0',
                fontStyle: 'italic',
                color: '#666',
              }}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                margin: '0.3em 0',
                paddingLeft: '1.5em',
                listStyleType: 'disc',
                textAlign: 'left',
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                margin: '0.3em 0',
                paddingLeft: '1.5em',
                listStyleType: 'decimal',
                textAlign: 'left',
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ margin: '0.2em 0', textAlign: 'left' }}>
              {children}
            </li>
          ),
        }}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}






// ============================================================================
// SKELETON LOADERS
// ============================================================================

/**
 * Skeleton loader for leaf content while fetching suggestions
 * 
 * Shows animated placeholder matching the leaf suggestion card layout.
 * Used during subtree rewrite loading state.
 * 
 * @returns {React.ReactElement} Animated skeleton placeholder
 * 
 * @example
 * {isLoading && <LeafSkeleton />}
 */
export function LeafSkeleton() {
  return (
    <div style={{
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: 12,
      padding: 16,
      background: 'rgba(255,255,255,0.5)',
      animation: 'pulse 2s infinite'
    }}>
      {/* Header: index indicator + nav buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: '#e5e7eb'
        }} />
        <div style={{
          width: 80,
          height: 14,
          background: '#e5e7eb',
          borderRadius: 4
        }} />
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: '#e5e7eb'
        }} />
      </div>

      {/* Text content placeholder */}
      <div style={{
        width: '100%',
        height: 64,
        background: '#e5e7eb',
        borderRadius: 8
      }} />
    </div>
  );
}

/**
 * Multiple skeleton loaders for list of loading items
 * 
 * Shows N skeleton loaders during batch loading (e.g., subtree suggestions).
 * 
 * @param {any} count - Number of skeleton loaders to display
 * @returns {React.ReactElement} Container with multiple skeletons
 * 
 * @example
 * {leafOrder.length === 0 && <LeafSkeletonGroup count={leafOrder.length} />}
 */
export function LeafSkeletonGroup({ count }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
            animationDelay: `${i * 0.1}s`
          }}
        >
          <LeafSkeleton />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton loader for entire subtree editing section
 * 
 * Shows animated placeholders for both leaf suggestions and emotion radar.
 * Used during subtree rewrite loading state.
 * 
 * @returns {React.ReactElement} Full subtree skeleton layout
 */
export function SubtreeEditingSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
      {/* Left Column: Leaf suggestions skeleton */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflowY: 'auto' }}>
        <LeafSkeletonGroup count={3} />
      </div>

      {/* Right Column: Emotion radar skeleton */}
      <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
        {/* Circular skeleton for radar */}
        <div
          style={{
            width: 340,
            height: 340,
            borderRadius: '50%',
            background: '#e5e7eb',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
        />
      </div>
    </div>
  );
}