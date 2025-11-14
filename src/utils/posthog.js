// src/utils/posthog.js
import posthog from 'posthog-js';
import getEnv from './getEnv';

export function initPostHog() {
  const posthogKey = getEnv("POSTHOG_KEY");
  const posthogHost = getEnv("POSTHOG_HOST");

  if (!posthogKey) {
    console.warn(
      '⚠️ PostHog key not configured. ' +
      'Add VITE_POSTHOG_KEY to .env.local'
    );
    return;
  }

  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: 'identified_only',
      // Disable toolbar in development to reduce noise
      disable_toolbar: true,
      loaded: (ph) => {
        console.log('✅ PostHog initialized successfully');
        console.log('[PostHog] User ID:', ph.get_distinct_id());
      },
    });
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize PostHog:', error);
    return false;
  }
}

export default posthog;