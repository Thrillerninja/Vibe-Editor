// src/pages/Stats.jsx
import { useNavigate } from 'react-router-dom';

export default function Stats() {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#4c4c4cff',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#8b8b8bff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          ← Back to Editor
        </button>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
          Analytics Dashboard
        </h1>
      </div>

      {/* PostHog Iframe */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <iframe
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          src="https://eu.posthog.com/embedded/oNbQMm-zE3IdEUw6BJi4uFuOvywceQ"
          style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          title="PostHog Analytics"
        />
      </div>
    </div>
  );
}