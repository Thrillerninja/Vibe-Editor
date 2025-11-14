/**
 * Safely get environment variables with fallbacks
 */
export default function getEnv(key, defaultValue = undefined) {
  const value = import.meta.env[`VITE_${key}`];

  if (!value) {
    if (defaultValue !== undefined) {
      console.warn(`Environment variable VITE_${key} not found, using default`);
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: VITE_${key}`);
  }

  return value;
}