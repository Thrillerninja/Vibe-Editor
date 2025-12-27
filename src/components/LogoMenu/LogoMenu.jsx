import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LogoMenu( { maxDepth, setMaxDepth } ) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [theme, setTheme] = useState('light');
    const [isDragActive, setIsDragActive] = useState(false);
    const navigate = useNavigate();

    const handleExport = (fileType) => {
        console.log(`Exporting as ${fileType.toUpperCase()}`);
        // TODO: Implement export functionality
        // exportDocument(fileType);
    };
    const handleImportClick = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.md,.html,.pdf';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                console.log(`Importing file: ${file.name}`);
                // TODO: Implement import functionality
            }
        };
        fileInput.click();
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

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            console.log(`Dropped file: ${file.name}`);
            // TODO: Implement import functionality
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

    return (
        <>
            <div style={{ position: 'fixed', top: '0', left: '0', zIndex: 50 }}>
                {/* SVG Shape as Container */}
                <svg
                    width="350"
                    height="80"
                    viewBox="20 0 200 45"
                    style={{
                        display: 'block',
                    }}
                >
                    {/* Define Drop Shadow Filter */}
                    <defs>
                        <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.5" />
                        </filter>
                    </defs>

                    {/* Fill shape */}
                    <path
                        d="M 0,0 V 36 H 140 C 180,36 160,0 220,0 Z"
                        fill="#ffffffff"
                        fillOpacity="1"
                        filter="url(#dropShadow)"
                    />
                </svg>

                {/* Content Container - positioned absolute on top of SVG */}
                <div
                    style={{
                        position: 'absolute',
                        top: '12px',
                        left: '0',
                        width: '220px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '0 12px',
                    }}
                >
                    {/* Hamburger Menu */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label="Toggle menu"
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '20px',
                            backgroundImage: `url(/hamburger.png)`,
                            backgroundSize: "28px",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat"
                        }}
                    />

                    {/* Logo Text */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '36px', fontWeight: 300, color: '#111827' }}>Vibe</span>
                        <span style={{ fontSize: '36px', fontWeight: 600, color: '#111827' }}>Editor</span>
                    </div>
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
                    width: '280px',
                    height: '100vh',
                    backgroundColor: 'white',
                    boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
                    zIndex: 45,
                    transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.3s ease-in-out',
                    overflowY: 'auto',
                    paddingTop: '60px',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* IMPORT SECTION */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Import</div>
                    <div style={{ display: 'flex', gap: '8px', padding: '0 16px', alignItems: 'stretch' }}>
                        {/* Import Button */}
                        <button
                            onClick={handleImportClick}
                            style={{
                                width: '56px',
                                padding: '12px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: '#f9fafb',
                                cursor: 'pointer',
                                fontSize: '20px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6', e.target.style.borderColor = '#d1d5db')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = '#f9fafb', e.target.style.borderColor = '#e5e7eb')}
                        >
                            📂
                        </button>

                        {/* Drag & Drop Zone */}
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            style={{
                                flex: 1,
                                border: isDragActive ? '2px dashed #111827' : '2px dashed #d1d5db',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'grab',
                                backgroundColor: isDragActive ? '#f0f0ff' : 'transparent',
                                transition: 'all 0.2s',
                                padding: '8px',
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>⬇️</span>
                        </div>
                    </div>
                </div>

                {/* EXPORT SECTION */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Export</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '0 16px' }}>
                        <button
                            onClick={() => {
                                handleExport('txt');
                                closeMenu();
                            }}
                            title="Export as Text"
                            style={{
                                padding: '12px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: '#f9fafb',
                                cursor: 'pointer',
                                fontSize: '20px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6', e.target.style.borderColor = '#d1d5db')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = '#f9fafb', e.target.style.borderColor = '#e5e7eb')}
                        >
                            📄
                        </button>
                        <button
                            onClick={() => {
                                handleExport('md');
                                closeMenu();
                            }}
                            title="Export as Markdown"
                            style={{
                                padding: '12px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: '#f9fafb',
                                cursor: 'pointer',
                                fontSize: '20px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6', e.target.style.borderColor = '#d1d5db')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = '#f9fafb', e.target.style.borderColor = '#e5e7eb')}
                        >
                            📝
                        </button>
                        <button
                            onClick={() => {
                                handleExport('html');
                                closeMenu();
                            }}
                            title="Export as HTML"
                            style={{
                                padding: '12px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: '#f9fafb',
                                cursor: 'pointer',
                                fontSize: '20px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6', e.target.style.borderColor = '#d1d5db')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = '#f9fafb', e.target.style.borderColor = '#e5e7eb')}
                        >
                            🌐
                        </button>
                        <button
                            onClick={() => {
                                handleExport('pdf');
                                closeMenu();
                            }}
                            title="Export as PDF"
                            style={{
                                padding: '12px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: '#f9fafb',
                                cursor: 'pointer',
                                fontSize: '20px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6', e.target.style.borderColor = '#d1d5db')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = '#f9fafb', e.target.style.borderColor = '#e5e7eb')}
                        >
                            📕
                        </button>
                    </div>
                </div>


                {/* VIEW SECTION */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>View</div>
                    <button
                        onClick={() => {
                            navigate('/stats');
                            closeMenu();
                        }}
                        style={menuItemStyle}
                        onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6')}
                        onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
                    >
                        📊 Analytics
                    </button>
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

                    {/* Theme Selector */}
                    <div style={{ padding: '0 16px 12px 16px' }}>
                        <label style={{ fontSize: '13px', color: '#606b7eff', display: 'block', marginBottom: '8px' }}>
                            Theme
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setTheme('light')}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: theme === 'light' ? '2px solid #111827' : '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    backgroundColor: theme === 'light' ? '#f9fafb' : 'white',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: theme === 'light' ? 600 : 400,
                                    color: '#374151',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => !theme === 'light' && (e.target.style.borderColor = '#d1d5db')}
                                onMouseLeave={(e) => !theme === 'light' && (e.target.style.borderColor = '#e5e7eb')}
                            >
                                ☀️ Light
                            </button>
                            <button
                                onClick={() => setTheme('dark')}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: theme === 'dark' ? '2px solid #111827' : '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    backgroundColor: theme === 'dark' ? '#f9fafb' : 'white',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: theme === 'dark' ? 600 : 400,
                                    color: '#374151',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => !theme === 'dark' && (e.target.style.borderColor = '#d1d5db')}
                                onMouseLeave={(e) => !theme === 'dark' && (e.target.style.borderColor = '#e5e7eb')}
                            >
                                🌙 Dark
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}