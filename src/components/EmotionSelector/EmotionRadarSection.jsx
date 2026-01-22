
import EmotionRadar from '../EmotionSelector/old/EmotionRadar.jsx';


export function EmotionRadarSection({ emotion, onChange, isLoading, label }) {
    return (
        <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
            <div style={{ position: 'relative', opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto' }}>
                <EmotionRadar
                    profile={emotion.profile}
                    onChange={onChange}
                    size={340}
                    label={label}
                />
                {isLoading && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.3)' }} />
                )}
            </div>
        </div>
    );
}


export function SuggestionControls({ suggestions, currentIdx, onPrev, onNext, isLoading }) {
    return suggestions.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button
                onClick={onPrev}
                disabled={isLoading}
                title="Previous option"
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: 'rgba(255,255,255,0.8)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                ◀
            </button>
            <div style={{ fontSize: 12, color: '#555' }}>
                Option {currentIdx + 1} / {suggestions.length}
            </div>
            <button
                onClick={onNext}
                disabled={isLoading}
                title="Next option"
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: 'rgba(255,255,255,0.8)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                ▶
            </button>
        </div>
    ) : null;
}

export function EditHeader({ title, metadata, onRewrite, isLoading }) {
    return (
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
            <div 
                style={{ 
                    fontWeight: 600, 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}            
                title={title}
                >
                    {title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {(metadata?.source || metadata?.timestamp) && (
                    <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                        {[metadata.source && `by ${metadata.source}`,  new Date(metadata.timestamp).toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' • ')}
                    </span>
                )}
                <button
                    onClick={onRewrite}
                    disabled={isLoading}
                    title="Generate 3 rewrite options using current emotion profile"
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        border: 'none',
                        background: isLoading ? '#e5e7eb' : '#111827',
                        color: isLoading ? '#9ca3af' : '#ffffff',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                    onMouseOver={(e) => {
                        if (!isLoading) {
                            e.currentTarget.style.background = '#374151';
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = '#111827';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    ↻
                </button>
            </div>
        </div>
    );
}