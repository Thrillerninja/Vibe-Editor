import posthog from './posthog';

export function trackAIUsage(operation, details = {}) {
  posthog.capture('ai_operation', {
    operation_type: operation, // 'emotion_suggestion', 'text_rewrite', etc.
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export function trackAPICall(model, tokensUsed, cost) {
  posthog.capture('api_call', {
    model,
    tokens_used: tokensUsed,
    estimated_cost: cost,
    timestamp: new Date().toISOString(),
  });
}

export function trackAIError(error, context) {
  posthog.capture('ai_error', {
    error_message: error.message,
    error_code: error.code,
    context: context,
    timestamp: new Date().toISOString(),
  });
}