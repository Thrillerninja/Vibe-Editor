import { useEffect } from 'react';
import posthog from '../utils/posthog';

export function useUserIdentification() {
  useEffect(() => {
    // Identify user (can be anonymous ID or real user ID)
    const userId = localStorage.getItem('user_id') || `anon-${Date.now()}`;
    
    if (!localStorage.getItem('user_id')) {
      localStorage.setItem('user_id', userId);
    }

    posthog.identify(userId, {
      // User properties
      app_version: '0.0.0',
      platform: navigator.platform,
      user_agent: navigator.userAgent,
      first_visit: !localStorage.getItem('first_visit'),
    });

    if (!localStorage.getItem('first_visit')) {
      localStorage.setItem('first_visit', new Date().toISOString());
      posthog.capture('user_first_visit');
    }
  }, []);
}