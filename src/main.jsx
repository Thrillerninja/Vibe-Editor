import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initPostHog } from './utils/posthog';
import './index.css'
import App from './App.jsx'

// Initialize before rendering
const posthogReady = initPostHog();

if (posthogReady) {
  console.log('✅ Analytics enabled');
} else {
  console.warn('⚠️ Analytics unavailable (development mode or missing key)');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
