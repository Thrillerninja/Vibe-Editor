export function renderLinksInContent(content) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]*)/g;
  const parts = content.split(urlRegex);
  
  return (
    <div style={{ wordBreak: 'break-word' }}>
      {parts.map((part, i) =>
        part.match(urlRegex) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={part}
            style={{
              color: '#2563eb',
              textDecoration: 'underline',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              const tooltip = document.createElement('div');
              tooltip.textContent = part.substring(0, 50) + (part.length > 50 ? '…' : '');
              tooltip.style.cssText = `
                position: absolute;
                bottom: 125%;
                background: #1f2937;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 10000;
              `;
              e.target.parentNode.appendChild(tooltip);
            }}
            onMouseLeave={(e) => {
              const tooltips = e.target.parentNode.querySelectorAll('div');
              tooltips.forEach(t => {
                if (t.textContent.includes('…') || t.textContent.includes('http')) {
                  t.remove();
                }
              });
            }}
          >
            {part.substring(0, 30)}
            {part.length > 30 ? '…' : ''}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </div>
  );
}