import {
  DecoratorNode,
  $applyNodeReplacement,
} from 'lexical';
import { Suspense } from 'react';
import RevertPopup from '../ui/RevertPopup';

export class HighlightNode extends DecoratorNode {
  __changeId;
  __originalText;
  __timestamp;
  __aiOperation;

  static getType() {
    return 'highlight';
  }

  static clone(node) {
    return new HighlightNode(
      node.__changeId,
      node.__originalText,
      node.__timestamp,
      node.__aiOperation,
      node.__key
    );
  }

  constructor(changeId, originalText, timestamp, aiOperation, key) {
    super(key);
    this.__changeId = changeId;
    this.__originalText = originalText;
    this.__timestamp = timestamp;
    this.__aiOperation = aiOperation;
  }

  createDOM(config) {
    const dom = document.createElement('span');
    dom.className = 'highlight-node';
    return dom;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return (
      <Suspense fallback={null}>
        <HighlightDecorator
          changeId={this.__changeId}
          originalText={this.__originalText}
          timestamp={this.__timestamp}
          aiOperation={this.__aiOperation}
          nodeKey={this.__key}
        />
      </Suspense>
    );
  }

  exportJSON() {
    return {
      changeId: this.__changeId,
      originalText: this.__originalText,
      timestamp: this.__timestamp,
      aiOperation: this.__aiOperation,
      type: 'highlight',
      version: 1,
    };
  }

  static importJSON(serializedNode) {
    return $createHighlightNode(
      serializedNode.changeId,
      serializedNode.originalText,
      serializedNode.timestamp,
      serializedNode.aiOperation
    );
  }
}

function HighlightDecorator({ changeId, originalText, timestamp, aiOperation, nodeKey }) {
  return (
    <span className="highlight-wrapper" data-change-id={changeId}>
      <RevertPopup
        changeId={changeId}
        originalText={originalText}
        timestamp={timestamp}
        aiOperation={aiOperation}
        nodeKey={nodeKey}
      />
    </span>
  );
}

export function $createHighlightNode(changeId, originalText, timestamp, aiOperation) {
  return $applyNodeReplacement(
    new HighlightNode(changeId, originalText, timestamp, aiOperation)
  );
}

export function $isHighlightNode(node) {
  return node instanceof HighlightNode;
}