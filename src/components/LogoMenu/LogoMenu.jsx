import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LogoMenu({ maxDepth, setMaxDepth, onInsertPoetry, isLoadingPoetry, onImport, onExport }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [theme, setTheme] = useState('light');
    const [isDragActive, setIsDragActive] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const navigate = useNavigate();

    // Handle file import via file picker
    const handleImportClick = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.md,.html,.htm,.pdf,.docx,.doc';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                setIsImporting(true);
                try {
                    await onImport(file);
                    closeMenu();
                } finally {
                    setIsImporting(false);
                    fileInput.value = ''; // Reset input to ensure onchange fires reliably on next selection
                }
            } else {
                fileInput.value = ''; // Reset input even if no file selected
            }
        };
        fileInput.click();
    };

    // Handle file export
    const handleExport = (fileType) => {
        onExport(fileType);
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            console.log(`Dropped file: ${file.name}`);
            setIsImporting(true);
            try {
                await onImport(file);
                closeMenu();
            } finally {
                setIsImporting(false);
            }
        }
    };

    const closeMenu = () => setIsMenuOpen(false);

    const sectionStyle = {
        paddingTop: '16px',
        paddingBottom: '16px',
        borderBottom: '2px solid #e5e7eb',
    };

    const sectionTitleStyle = {
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#8a909bff',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    };

    const menuItemStyle = {
        padding: '12px 16px',
        textAlign: 'left',
        color: '#374151',
        fontSize: '14px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        width: '100%',
    };

    const buttonBaseStyle = {
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        backgroundColor: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#374151',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    };

    return (
        <>
            <div style={{
                position: 'fixed',
                top: '12px',
                left: '12px',
                zIndex: 50,
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
            }}>
                {/* Hamburger Menu Capsule */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle menu"
                    style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: "rgba(255, 255, 255, 0.9)",
                        backdropFilter: "saturate(180%) blur(20px)",
                        WebkitBackdropFilter: "saturate(180%) blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.5)",
                        boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0,0,0,0.05)",
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.1s ease',
                    }}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <div style={{
                        width: '20px',
                        height: '20px',
                        backgroundImage: `url(/hamburger.png)`,
                        backgroundSize: "contain",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        opacity: 0.8
                    }} />
                </button>

                {/* Logo Text Capsule */}
                <div style={{
                    height: '44px',
                    padding: '0 20px',
                    borderRadius: '24px', // Fully rounded
                    background: "rgba(255, 255, 255, 0.9)",
                    backdropFilter: "saturate(180%) blur(20px)",
                    WebkitBackdropFilter: "saturate(180%) blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.5)",
                    boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0,0,0,0.05)",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    userSelect: 'none'
                }}>
                    <span style={{ fontSize: '18px', fontWeight: 400, color: '#111827' }}>Vibe</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>Editor</span>
                </div>
            </div>

            {/* Sidebar Overlay */}
            {isMenuOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        zIndex: 40,
                    }}
                    onClick={() => setIsMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '300px',
                    height: '100vh',
                    background: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "saturate(180%) blur(20px)",
                    WebkitBackdropFilter: "saturate(180%) blur(20px)",
                    borderRight: "1px solid rgba(255, 255, 255, 0.5)",
                    boxShadow: '2px 0 20px rgba(0,0,0,0.1)',
                    zIndex: 45,
                    transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    overflowY: 'auto',
                    paddingTop: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* IMPORT SECTION */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Import</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', padding: '0 16px' }}>
                        {/* Import Button */}
                        <button
                            onClick={handleImportClick}
                            disabled={isImporting}
                            style={{
                                ...buttonBaseStyle,
                                padding: '16px',
                                gap: '8px',
                                opacity: isImporting ? 0.7 : 1,
                                cursor: isImporting ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isImporting) {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                            }}
                        >
                            {isImporting ? (
                                <svg className="animate-spin" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    <path d="M12 11v6m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>{isImporting ? 'Loading...' : 'Upload'}</span>
                        </button>

                        {/* Drag & Drop Zone */}
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            style={{
                                ...buttonBaseStyle,
                                border: isDragActive ? '2px dashed #111827' : '1px dashed #d1d5db',
                                backgroundColor: isDragActive ? '#f0f9ff' : 'transparent',
                                padding: '16px',
                                gap: '8px',
                                boxShadow: 'none'
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3v-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>Drop File</span>
                        </div>

                        {/* Poetry Button */}
                        <button
                            onClick={onInsertPoetry}
                            disabled={isLoadingPoetry}
                            style={{
                                ...buttonBaseStyle,
                                padding: '16px',
                                gap: '8px',
                                opacity: isLoadingPoetry ? 0.7 : 1,
                                cursor: isLoadingPoetry ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isLoadingPoetry) {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                            }}
                            title="Load random poetry from PoetryDB"
                        >
                            {isLoadingPoetry ? (
                                <svg className="animate-spin" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z" />
                                    <path d="M12 6v6m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>
                                {isLoadingPoetry ? 'Loading...' : 'Poetry'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* EXPORT SECTION */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Export</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '0 16px' }}>
                        {[
                            { id: 'txt', label: 'TXT', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                            { id: 'md', label: 'MD', icon: 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM7 7h10M7 12h10M7 17h6' },
                            { id: 'html', label: 'HTML', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
                            { id: 'pdf', label: 'PDF', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' }
                        ].map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    handleExport(item.id);
                                    closeMenu();
                                }}
                                title={`Export as ${item.label}`}
                                style={{
                                    ...buttonBaseStyle,
                                    padding: '12px 4px',
                                    gap: '6px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span style={{ fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* SPACER */}
                <div style={{ flexGrow: 1 }}></div>

                {/* DISPLAY SECTION */}
                <div style={{
                    borderTop: '2px solid #e5e7eb',
                    ...sectionStyle
                }}>
                    <div style={sectionTitleStyle}>Settings</div>

                    {/* Tree Depth Slider */}
                    <div style={{ padding: '12px 16px', marginBottom: '16px' }}>
                        <label style={{ fontSize: '13px', color: '#606b7eff', display: 'block', marginBottom: '0px' }}>
                            Tree Depth: <strong>{maxDepth}</strong>
                        </label>
                        <input
                            type="range"
                            min="3"
                            max="6"
                            value={maxDepth}
                            onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                            style={{
                                width: '100%',
                                height: '6px',
                                borderRadius: '3px',
                                background: '#e5e7eb',
                                outline: 'none',
                                cursor: 'pointer',
                            }}
                            className="appearance-none cursor-pointer accent-blue-600"
                        />
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                            Adjust maximum hierarchy depth
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}

