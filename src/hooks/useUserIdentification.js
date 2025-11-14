// src/hooks/useUserIdentification.js
import { useEffect } from 'react';
import posthog from '../utils/posthog';

export function useUserIdentification() {
  useEffect(() => {
    if (!posthog || !posthog.identify) {
      console.warn('PostHog not available');
      return;
    }

    // Identify user for analytics
    const userId = localStorage.getItem('user_id') || `anon-${Date.now()}`;
    
    if (!localStorage.getItem('user_id')) {
      localStorage.setItem('user_id', userId);
    }

    try {
      posthog.identify(userId, {
        app_version: '0.0.0',
        platform: navigator.platform,
        first_visit: !localStorage.getItem('first_visit'),
      });

      if (!localStorage.getItem('first_visit')) {
        localStorage.setItem('first_visit', new Date().toISOString());
        posthog.capture('user_first_visit');
      }
    } catch (error) {
      console.warn('PostHog identify failed:', error);
    }
  }, []);
}