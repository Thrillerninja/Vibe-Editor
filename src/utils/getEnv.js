// src/utils/getEnv.js
/**
 * Safely get environment variables with fallbacks
 */
export default function getEnv(key, defaultValue = '') {
  const value = import.meta.env[`VITE_${key}`];
  
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    console.warn(`Env var VITE_${key} not configured`);
    return '';
  }

  return value;
}