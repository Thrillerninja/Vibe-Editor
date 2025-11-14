// src/utils/posthog.js
import posthog from 'posthog-js';
import getEnv from './getEnv';

export function initPostHog() {
  // Get keys safely without throwing errors
  const posthogKey = getEnv("POSTHOG_KEY");
  const posthogHost = getEnv("POSTHOG_HOST");

  if (!posthogKey) {
    console.warn(
      '⚠️ PostHog not configured. ' +
      'Add VITE_POSTHOG_KEY to .env.local for analytics.'
    );
    return false;
  }

  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      
      // Analytics-only config
      capture_pageview: true,
      capture_pageleave: true,
      
      // Disable all toolbar/recording features
      toolbar: {
        enabled: false,
      },
      // disable_session_recording: true,
      // disable_surveys: true,
      // disable_web_experiments: true,
      // disable_web_vitals: true,
      // disable_feature_flags: true,
      
      // Prevent extra requests
      persistence: 'localStorage',
      
      // Flush config
      flushAt: 5,
      flushInterval: 10000,
      
      loaded: (ph) => {
        console.log('✅ PostHog Analytics initialized');
        console.log('[PostHog] User ID:', ph.get_distinct_id());
      },
    });
    
    return true;
  } catch (error) {
    console.error('❌ PostHog init failed:', error);
    return false;
  }
}

export default posthog;