// src/utils/errorTracking.js
import posthog from './posthog';

/**
 * Initialize global error tracking
 */
export function initErrorTracking() {
  // Unhandled JavaScript errors
  window.addEventListener('error', (event) => {
    const { error, message, filename, lineno, colno } = event;
    
    // Filter out ResizeObserver warning - this is a known benign issue with rapid layout changes
    if (message && message.includes('ResizeObserver loop completed with undelivered notifications')) {
      // This is a non-critical browser warning, ignore it
      return;
    }
    
    console.error('🔴 Uncaught error:', message);
    
    posthog.capture('error_uncaught', {
      error_type: 'javascript_error',
      error_message: message,
      error_stack: error?.stack,
      filename,
      line: lineno,
      column: colno,
      timestamp: new Date().toISOString(),
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    // Filter out ResizeObserver related rejections
    if (event.reason && String(event.reason).includes('ResizeObserver loop completed')) {
      return;
    }
    
    console.error('🔴 Unhandled rejection:', event.reason);
    
    posthog.capture('error_unhandled_rejection', {
      error_type: 'promise_rejection',
      error_message: event.reason?.message || String(event.reason),
      error_stack: event.reason?.stack,
      timestamp: new Date().toISOString(),
    });
  });

  console.log('✅ Error tracking initialized');
}

/**
 * Manual error logging (use in try-catch)
 */
export function logError(error, context = {}) {
  console.error('🔴 Error:', error);
  
  posthog.capture('error_caught', {
    error_type: error.name || 'Error',
    error_message: error.message,
    error_stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });
}